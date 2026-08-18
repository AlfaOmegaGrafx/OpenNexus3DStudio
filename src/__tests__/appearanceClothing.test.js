import { describe, it, expect } from 'vitest';
import {
  inferAppearanceSlot,
  equipSlotForAppearance,
  buildAppearanceComponentAutoRigOptions,
  isAppearanceClothingName,
  parseClothingAccessoryLines,
  buildAppearanceGarmentSubjectPrompt,
  DEFAULT_STUDIO_CLOTHING_TEXT,
  STUDIO_CLOTHING_ITEM_POOL,
  randomizeStudioClothingText,
  inferClothingStyleKey,
  resolveGarmentCut,
  garmentCutNeedsUserChoice,
  extractClothingThemeTokens,
  applySmartClothingLayering,
  APPEARANCE_TRAIT_CULLING_LAYER,
  APPEARANCE_SLOT_CULLING_LAYER,
  cullingLayerForAppearanceSlot,
  pickCompatibleAccessoryItems,
  classifyAccessorySegment,
} from '../library/appearanceClothing.js';
import { AUTO_RIG_MODES, APPEARANCE_COMPONENT_RIG_MODEL_ID } from '../library/avatarPipelineCatalog.js';
import { inferAutoRigPipelineKind, autoRigSelectionForPipelineKind } from '../library/aiModelsCatalog.js';

describe('appearanceClothing', () => {
  it('maps joggers/pants to Legs and equips Waist', () => {
    expect(inferAppearanceSlot({ objectName: 'Joggers' })).toBe('Legs');
    expect(inferAppearanceSlot({ objectName: 'Jogging Pants' })).toBe('Legs');
    expect(equipSlotForAppearance('Legs')).toBe('Waist');
  });

  it('builds appearance_component auto-rig options', () => {
    const opts = buildAppearanceComponentAutoRigOptions({ objectName: 'Joggers' });
    expect(opts.rig_mode).toBe(AUTO_RIG_MODES.APPEARANCE_COMPONENT);
    expect(opts.appearance_slot).toBe('Legs');
    expect(opts.output_format).toBe('vrm');
    expect(opts.model_preference).toBe(APPEARANCE_COMPONENT_RIG_MODEL_ID);
  });

  it('routes clothing names away from SkinTokens', () => {
    expect(isAppearanceClothingName({ objectName: 'Blue Hoodie' })).toBe(true);
    expect(inferAutoRigPipelineKind({ objectName: 'Joggers' })).toBe('appearance');
    const sel = autoRigSelectionForPipelineKind('appearance', { objectName: 'Joggers' });
    expect(sel.rigMode).toBe(AUTO_RIG_MODES.APPEARANCE_COMPONENT);
    expect(sel.modelPreference).toBe(APPEARANCE_COMPONENT_RIG_MODEL_ID);
  });

  it('parseClothingAccessoryLines maps joggers and boots to Legs and Shoes', () => {
    const rows = parseClothingAccessoryLines('red joggers, leather boots');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ label: 'red joggers', appearance_slot: 'Legs', cut: 'long' });
    expect(rows[1]).toMatchObject({ label: 'leather boots', appearance_slot: 'Shoes' });
  });

  it('parseClothingAccessoryLines accepts slot overrides', () => {
    const rows = parseClothingAccessoryLines('Chest: blue hoodie\nscarf @Neck');
    expect(rows[0].appearance_slot).toBe('Chest');
    expect(rows[0].label).toBe('blue hoodie');
    expect(rows[0].cut).toBe('long');
    expect(rows[1].appearance_slot).toBe('Neck');
    expect(rows[1].label).toBe('scarf');
  });

  it('parseClothingAccessoryLines accepts cut tokens', () => {
    const rows = parseClothingAccessoryLines(
      'Legs: tactical leggings (short)\nChest: linen shirt (short-sleeve)',
    );
    expect(rows[0]).toMatchObject({
      label: 'tactical leggings',
      appearance_slot: 'Legs',
      cut: 'short',
    });
    expect(rows[1]).toMatchObject({
      label: 'linen shirt',
      appearance_slot: 'Chest',
      cut: 'short',
    });
  });

  it('defaults unknown wearables to Chest', () => {
    const rows = parseClothingAccessoryLines('mystery fabric wrap');
    expect(rows[0].appearance_slot).toBe('Chest');
  });

  it('buildAppearanceGarmentSubjectPrompt includes exclusive Legs cut', () => {
    const longPrompt = buildAppearanceGarmentSubjectPrompt({
      style: 'streetwear',
      slot: 'Legs',
      label: 'arcane ember red tactical leggings',
      cut: 'long',
    });
    expect(longPrompt).toContain('full-length long legs only');
    expect(longPrompt).toContain('NOT shorts');
    expect(longPrompt).not.toContain('shorts only');
    expect(longPrompt).toContain('wider than shoulder-width');
    expect(longPrompt).toContain('must not touch');
    expect(longPrompt).toContain('air gap');

    const shortPrompt = buildAppearanceGarmentSubjectPrompt({
      slot: 'Legs',
      label: 'arcane ember red tactical leggings',
      cut: 'short',
    });
    expect(shortPrompt).toContain('shorts only');
    expect(shortPrompt).toContain('NOT full-length');
  });

  it('Legs garment prompts exclude footwear so joggers do not grow shoes', () => {
    const joggers = buildAppearanceGarmentSubjectPrompt({
      slot: 'Legs',
      label: 'cobalt black tapered joggers',
      cut: 'long',
    });
    expect(joggers).toMatch(/bare (mannequin )?feet|NO shoes/i);
    expect(joggers).not.toMatch(
      /shoes or boots|each boot|footwear stance|footwear plates|boots or greaves/i,
    );

    const fatLegs = buildAppearanceGarmentSubjectPrompt({
      slot: 'Legs',
      label: 'cobalt black tapered joggers',
      cut: 'long',
      body_composition: 'chubby',
    });
    expect(fatLegs).toMatch(/bare (mannequin )?feet|NO shoes/i);
    expect(fatLegs).not.toMatch(
      /shoes or boots|each boot|footwear stance|footwear plates|boots or greaves/i,
    );

    const shoes = buildAppearanceGarmentSubjectPrompt({
      slot: 'Shoes',
      label: 'armored boots',
    });
    expect(shoes.toLowerCase()).toMatch(/\b(boots?|shoes?|footwear)\b/);
  });

  it('Hands/Neck/Head/Shoes subject prompts ask for mesh-ready framing', () => {
    const hands = buildAppearanceGarmentSubjectPrompt({
      slot: 'Hands',
      label: 'leather gloves',
    });
    expect(hands).toContain('fingers clearly separated');
    expect(hands).toContain('thumb index and middle');
    expect(hands).toMatch(/palms facing (straight )?down|palms down/i);
    expect(hands).toMatch(/thumbs pointing forward/i);
    expect(hands).not.toMatch(/open palm/i);

    const neck = buildAppearanceGarmentSubjectPrompt({
      slot: 'Neck',
      label: 'gold pendant',
    });
    expect(neck).toContain('tiny neck jewelry');
    expect(neck).not.toContain('full torso mannequin');

    const head = buildAppearanceGarmentSubjectPrompt({
      slot: 'Head',
      label: 'horned war helm',
    });
    expect(head).toContain('single head accessory');
    expect(head).toContain('NOT full body');

    const shoes = buildAppearanceGarmentSubjectPrompt({
      slot: 'Shoes',
      label: 'armored boots',
    });
    expect(shoes).toContain('wider than shoulder-width');
    expect(shoes).toContain('must not touch');
    expect(shoes).toContain('skin-weight');

    const fatShoes = buildAppearanceGarmentSubjectPrompt({
      slot: 'Shoes',
      label: 'armored boots',
      body_composition: 'chubby',
    });
    expect(fatShoes).toContain('1.5 to 2');
    expect(fatShoes).toContain('heavyset');
  });

  it('vest and t-shirt lock cut without user choice; shirt needs sleeve choice', () => {
    expect(
      resolveGarmentCut({ label: 'ornate burgundy quilted vest', appearance_slot: 'Chest' }),
    ).toMatchObject({
      cut: 'sleeveless',
      locked: true,
    });
    expect(
      garmentCutNeedsUserChoice({
        label: 'ornate burgundy quilted vest',
        appearance_slot: 'Chest',
      }),
    ).toBe(false);
    expect(
      garmentCutNeedsUserChoice({ label: 'black t-shirt', appearance_slot: 'Chest' }),
    ).toBe(false);
    expect(
      garmentCutNeedsUserChoice({ label: 'linen shirt', appearance_slot: 'Chest' }),
    ).toBe(true);
    expect(resolveGarmentCut({ label: 'linen shirt', appearance_slot: 'Chest' }).cut).toBe('long');
  });

  it('Legs always offers length choice', () => {
    expect(
      garmentCutNeedsUserChoice({
        label: 'arcane ember red tactical leggings',
        appearance_slot: 'Legs',
      }),
    ).toBe(true);
    expect(resolveGarmentCut({ label: 'athletic shorts', appearance_slot: 'Legs' }).cut).toBe(
      'short',
    );
  });

  it('DEFAULT_STUDIO_CLOTHING_TEXT parses to expected slots', () => {
    const rows = parseClothingAccessoryLines(DEFAULT_STUDIO_CLOTHING_TEXT);
    expect(rows.map((r) => r.appearance_slot)).toEqual([
      'Chest',
      'Legs',
      'Shoes',
      'Waist',
      'Neck',
    ]);
  });

  it('default clothing pool covers casual staples users ask for', () => {
    const joined = Object.values(STUDIO_CLOTHING_ITEM_POOL).flat().join(' | ').toLowerCase();
    expect(joined).toMatch(/denim jeans/);
    expect(joined).toMatch(/shorts/);
    expect(joined).toMatch(/baseball cap/);
    expect(joined).toMatch(/knit cap/);
    expect(joined).toMatch(/bucket hat/);
    expect(joined).toMatch(/medallion/);
    expect(joined).toMatch(/sandals/);
    expect(joined).toMatch(/slippers/);
    expect(joined).toMatch(/eyeglasses|sunglasses|glasses/);
    expect(joined).toMatch(/boxing gloves/);
    expect(joined).toMatch(/bracelet on left wrist/);
    expect(joined).toMatch(/bracelet on right wrist/);
    expect(joined).toMatch(/bracelets on both wrists/);
    expect(joined).toMatch(/earring on left ear/);
    expect(joined).toMatch(/earring on right ear/);
    expect(joined).toMatch(/earrings on both ears/);
    expect(joined).toMatch(/wristwatch|smartwatch/);
    expect(joined).toMatch(/pajama|onesie|jumpsuit/);
  });

  it('maps fullbody garments and watches to Body/Hands with culling layers', () => {
    expect(inferAppearanceSlot({ objectName: 'flannel pajamas' })).toBe('Body');
    expect(inferAppearanceSlot({ objectName: 'fleece onesie' })).toBe('Body');
    expect(inferAppearanceSlot({ objectName: 'utility jumpsuit' })).toBe('Body');
    expect(inferAppearanceSlot({ objectName: 'smartwatch on left wrist' })).toBe('Hands');
    expect(cullingLayerForAppearanceSlot('Body')).toBe(APPEARANCE_TRAIT_CULLING_LAYER.CLOTHING);
    expect(cullingLayerForAppearanceSlot('Chest')).toBe(1);
    expect(cullingLayerForAppearanceSlot('Hands')).toBe(APPEARANCE_TRAIT_CULLING_LAYER.ACCESSORY);
    expect(APPEARANCE_SLOT_CULLING_LAYER.Head).toBe(2);
  });

  it('smart layering drops Chest/Legs/Waist when pajamas present', () => {
    const rows = parseClothingAccessoryLines(
      [
        'Body: soft cotton pajama set',
        'Chest: navy hoodie',
        'Legs: charcoal joggers',
        'Waist: black belt',
        'Shoes: fuzzy slippers',
        'Neck: thin silver chain',
      ].join('\n'),
    );
    expect(rows.map((r) => r.appearance_slot)).toEqual(['Body', 'Shoes', 'Neck']);
    expect(rows[0].culling_layer).toBe(1);
  });

  it('smart layering drops wristwear when boxing gloves are present', () => {
    const rows = applySmartClothingLayering([
      { label: 'black boxing gloves', appearance_slot: 'Hands' },
      { label: 'wristwatch on left wrist', appearance_slot: 'Hands' },
      { label: 'bracelet on right wrist', appearance_slot: 'Hands' },
      { label: 'clear eyeglasses', appearance_slot: 'Head' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.label)).toEqual(['black boxing gloves', 'clear eyeglasses']);
  });

  it('keeps compatible Head segments: baseball cap + glasses + earrings', () => {
    const rows = parseClothingAccessoryLines(
      [
        'Head: fitted baseball cap',
        'Head: clear eyeglasses',
        'Head: stud earrings on both ears',
        'Head: bucket hat',
      ].join('\n'),
    );
    expect(rows.map((r) => r.accessory_segment)).toEqual(['hat', 'eyewear', 'earrings']);
    expect(rows.map((r) => r.label)).toEqual([
      'fitted baseball cap',
      'clear eyeglasses',
      'stud earrings on both ears',
    ]);
    expect(rows[1].equip_trait_candidates).toEqual(
      expect.arrayContaining(['Head_Eyewear', 'Eyewear', 'Head']),
    );
  });

  it('helmet conflicts with hat and eyewear on Head', () => {
    const rows = parseClothingAccessoryLines(
      'Head: lightweight helmet\nHead: baseball cap\nHead: aviator sunglasses',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].accessory_segment).toBe('helmet');
  });

  it('pickCompatibleAccessoryItems can return hat and eyewear together', () => {
    let i = 0;
    const rng = () => {
      // High chances: skip none; pick hat + eyewear; skip earrings boost path sometimes.
      const seq = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9, 0.2, 0.2, 0.2];
      const v = seq[i % seq.length];
      i += 1;
      return v;
    };
    const picks = pickCompatibleAccessoryItems(
      'Head',
      ['baseball cap', 'clear eyeglasses', 'stud earrings on both ears', 'bucket hat'],
      rng,
    );
    const segs = picks.map((p) => p.segment);
    expect(segs).toContain('hat');
    expect(segs).toContain('eyewear');
  });

  it('randomize can emit full-body pajamas without Chest/Legs/Waist', () => {
    let i = 0;
    const rng = () => {
      // First draw < 0.22 → full body; keep other draws deterministic.
      const seq = [0.1, 0.9, 0.9, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
      const v = seq[i % seq.length];
      i += 1;
      return v;
    };
    const text = randomizeStudioClothingText({
      stylePrompt: 'casual loungewear',
      slots: ['Chest', 'Legs', 'Shoes', 'Waist', 'Neck', 'Hands', 'Head'],
      rng,
      fullBodyChance: 1,
    });
    const slots = parseClothingAccessoryLines(text).map((r) => r.appearance_slot);
    expect(slots).toContain('Body');
    expect(slots).not.toContain('Chest');
    expect(slots).not.toContain('Legs');
    expect(slots).not.toContain('Waist');
  });

  it('infers glasses, earrings, bracelets, and boxing gloves to Head/Hands', () => {
    expect(inferAppearanceSlot({ objectName: 'clear eyeglasses' })).toBe('Head');
    expect(inferAppearanceSlot({ objectName: 'aviator sunglasses' })).toBe('Head');
    expect(inferAppearanceSlot({ objectName: 'hoop earring on left ear' })).toBe('Head');
    expect(inferAppearanceSlot({ objectName: 'stud earrings on both ears' })).toBe('Head');
    expect(inferAppearanceSlot({ objectName: 'bracelet on left wrist' })).toBe('Hands');
    expect(inferAppearanceSlot({ objectName: 'bracelets on both wrists' })).toBe('Hands');
    expect(inferAppearanceSlot({ objectName: 'boxing gloves' })).toBe('Hands');
    expect(parseClothingAccessoryLines('Head: wayfarer sunglasses\nHands: black boxing gloves')).toEqual([
      expect.objectContaining({ appearance_slot: 'Head', label: 'wayfarer sunglasses' }),
      expect.objectContaining({ appearance_slot: 'Hands', label: 'black boxing gloves' }),
    ]);
  });

  it('Hands/Head mesh prompts mention bracelets, boxing gloves, glasses, earrings', () => {
    const hands = buildAppearanceGarmentSubjectPrompt({
      slot: 'Hands',
      label: 'bracelet on left wrist',
    });
    expect(hands).toMatch(/bracelet|wrist/i);
    expect(hands).toMatch(/boxing gloves/i);

    const head = buildAppearanceGarmentSubjectPrompt({
      slot: 'Head',
      label: 'clear eyeglasses',
    });
    expect(head).toMatch(/glasses|earrings/i);
  });

  it('Hands mitten prompts keep T-pose palm-down bind and allow mitten topology', () => {
    const mittens = buildAppearanceGarmentSubjectPrompt({
      slot: 'Hands',
      label: 'burgundy knit mittens',
    });
    expect(mittens).toMatch(/palms facing (straight )?down|palms down/i);
    expect(mittens).toMatch(/thumbs pointing forward/i);
    expect(mittens).toMatch(/thumb pouch/i);
    expect(mittens).not.toMatch(/open palm/i);
    expect(mittens).not.toMatch(/not fused into a mitt/i);
    expect(mittens).not.toMatch(/five separate digits/i);
  });

  it('randomizeStudioClothingText returns slot-prefixed lines biased by style', () => {
    let i = 0;
    const rng = () => {
      i += 1;
      return (i % 10) / 10;
    };
    const text = randomizeStudioClothingText({
      stylePrompt: 'cyberpunk streetwear body',
      slots: ['Chest', 'Legs', 'Shoes'],
      rng,
      fullBodyChance: 0,
    });
    const rows = parseClothingAccessoryLines(text);
    expect(rows).toHaveLength(3);
    expect(rows[0].appearance_slot).toBe('Chest');
    expect(rows[1].appearance_slot).toBe('Legs');
    expect(rows[2].appearance_slot).toBe('Shoes');
    expect(inferClothingStyleKey('cyberpunk neon runner')).toBe('cyberpunk');
  });

  it('infers medieval/fantasy from stylized prompts and randomizes matching garments', () => {
    expect(inferClothingStyleKey('Medieval Dragon Knight')).toBe('medieval');
    expect(inferClothingStyleKey('dragon knight character')).toBe('fantasy');
    expect(inferClothingStyleKey('neon cyber assassin')).toBe('cyberpunk');
    expect(extractClothingThemeTokens('Medieval Dragon Knight', 'medieval')).toEqual(
      expect.arrayContaining(['dragon', 'knight']),
    );

    let i = 0;
    const rng = () => {
      i += 1;
      return (i % 10) / 10;
    };
    const text = randomizeStudioClothingText({
      stylePrompt: 'Medieval Dragon Knight',
      slots: ['Chest', 'Legs', 'Shoes'],
      rng,
      fullBodyChance: 0,
    });
    // Should not fall back to streetwear staples for a knight prompt.
    expect(text.toLowerCase()).not.toMatch(/hoodie|sneakers|joggers|jeans/);
    expect(text.toLowerCase()).toMatch(
      /helm|armor|armou|cuirass|greave|sabaton|surcoat|mail|plate|gauntlet|boot|chausse|brigandine|tabard|hauberk|gambeson|jerkin|tunic|hose|baldric|gorget/i,
    );
  });
});
