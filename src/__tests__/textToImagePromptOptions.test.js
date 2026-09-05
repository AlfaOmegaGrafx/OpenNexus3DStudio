import { describe, expect, it } from 'vitest';
import {
  buildOrthographicMultiviewPrompts,
  buildTextToImageNegativePrompt,
  buildTextToImagePrompt,
  buildHeadlessBodySubjectPrompt,
  normalizeTextToImagePromptOptions,
  previewTextToImagePrompt,
  commitBodyWeightInput,
  STUDIO_CREATURE_MESH_READY_TEXT_TO_IMAGE_OPTIONS,
  STUDIO_HEADLESS_BODY_TEXT_TO_IMAGE_OPTIONS,
  STUDIO_GARMENT_TEXT_TO_IMAGE_OPTIONS,
  studioGarmentTextToImageOptionsForSlot,
  STUDIO_ORTHOGRAPHIC_VIEW_IDS,
  HEADLESS_BODY_NEGATIVE_PROMPT,
} from '../library/textToImagePromptOptions.js';

describe('textToImagePromptOptions', () => {
  it('appends modifier fragments to the subject prompt', () => {
    const prompt = buildTextToImagePrompt('a fox', {
      remove_background: true,
      full_body: true,
      camera_view: 'side_left',
    });
    expect(prompt).toContain('a fox');
    expect(prompt).toContain('plain white background');
    expect(prompt).toContain('full body');
    expect(prompt).toContain('left side profile');
  });

  it('mouth open chip appends jaw/lip fragment for face-visible shots', () => {
    const prompt = buildTextToImagePrompt('portrait of a knight', {
      mouth_open: true,
      remove_background: true,
    });
    expect(prompt).toContain('mouth open');
    expect(prompt).toContain('jaw slightly dropped');
    expect(prompt).toContain('not closed mouth');

    const headless = buildTextToImagePrompt(
      'streetwear body',
      STUDIO_HEADLESS_BODY_TEXT_TO_IMAGE_OPTIONS,
    );
    // Defaults omit mouth_open; even if forced, headless path must not add it.
    const forced = buildTextToImagePrompt('streetwear body', {
      ...STUDIO_HEADLESS_BODY_TEXT_TO_IMAGE_OPTIONS,
      mouth_open: true,
    });
    expect(headless).not.toContain('mouth open');
    expect(forced).not.toContain('mouth open');
  });

  it('allows only one pose preset at a time in the built prompt', () => {
    const tPose = buildTextToImagePrompt('knight', { t_pose: true, a_pose: true });
    expect(tPose).toContain('T-pose');
    expect(tPose).not.toContain('A-pose');

    const aOnly = buildTextToImagePrompt('knight', { a_pose: true });
    expect(aOnly).toContain('A-pose');
    expect(aOnly).not.toContain('T-pose');
  });

  it('normalizes conflicting pose flags', () => {
    const normalized = normalizeTextToImagePromptOptions({ t_pose: true, a_pose: true });
    expect(normalized.t_pose).toBe(true);
    expect(normalized.a_pose).toBe(false);
  });

  it('creature for rig disables T/A-pose and forces side + head/tail helpers', () => {
    const normalized = normalizeTextToImagePromptOptions({
      creature_rig_ready: true,
      t_pose: true,
      a_pose: true,
    });
    expect(normalized.creature_rig_ready).toBe(true);
    expect(normalized.t_pose).toBe(false);
    expect(normalized.a_pose).toBe(false);
    expect(normalized.head_forward).toBe(true);
    expect(normalized.tail_clear).toBe(true);
    expect(normalized.standing_pose).toBe(true);
    expect(normalized.full_body).toBe(true);
    expect(normalized.camera_view).toBe('side_left');

    const prompt = buildTextToImagePrompt('a fox', STUDIO_CREATURE_MESH_READY_TEXT_TO_IMAGE_OPTIONS);
    expect(prompt).toContain('quadruped rest pose');
    expect(prompt).toContain('head facing forward');
    expect(prompt).toContain('tail extended');
    expect(prompt).toContain('not tucked');
    expect(prompt).toContain('left side profile');
    expect(prompt).not.toContain('T-pose');
  });

  it('headless body prompt forces bare mannequin not outfit on body stage', () => {
    const prompt = buildTextToImagePrompt(
      'brown tracksuit character',
      STUDIO_HEADLESS_BODY_TEXT_TO_IMAGE_OPTIONS,
    );
    expect(prompt).toContain('bare neck-open humanoid mannequin');
    expect(prompt).toContain('NO clothing');
    expect(prompt).toContain('Appearance slots');
    expect(prompt).toContain('neck-down');
    expect(prompt).toContain('open neck');
    expect(prompt).toContain('arms extended horizontally');
    expect(prompt).toContain('palms facing straight down');
    expect(prompt).not.toContain('head to toe visible');
  });

  it('headless body with male gender uses strong mannequin male cues', () => {
    const prompt = buildTextToImagePrompt('streetwear hero', {
      ...STUDIO_HEADLESS_BODY_TEXT_TO_IMAGE_OPTIONS,
      character_gender: 'male',
    });
    expect(prompt).toContain('adult male neck-open humanoid mannequin');
    expect(prompt).toContain('adult male mannequin body');
    expect(prompt).toContain('NOT female');
    expect(prompt).not.toContain('neutral grey or skin-toned mannequin');
    expect(prompt).not.toContain('female presentation');
  });

  it('headless body with female gender uses strong mannequin female cues', () => {
    const prompt = buildTextToImagePrompt('knight', {
      ...STUDIO_HEADLESS_BODY_TEXT_TO_IMAGE_OPTIONS,
      character_gender: 'female',
    });
    expect(prompt).toContain('adult female neck-open humanoid mannequin');
    expect(prompt).toContain('adult female mannequin body');
    expect(prompt).toContain('NOT male');
  });

  it('buildHeadlessBodySubjectPrompt separates character concept from garments', () => {
    const wrapped = buildHeadlessBodySubjectPrompt('cyberpunk runner in a tracksuit', 'male');
    expect(wrapped).toContain('adult male neck-open');
    expect(wrapped).toContain('cyberpunk runner');
    expect(wrapped).toContain('NO clothing');
    expect(wrapped).toContain('Appearance slots');
  });

  it('headless body prompt forces neck-open / no-head phrases', () => {
    const prompt = buildTextToImagePrompt(
      'casual streetwear body',
      STUDIO_HEADLESS_BODY_TEXT_TO_IMAGE_OPTIONS,
    );
    expect(prompt).toContain('neck-down');
    expect(prompt).toMatch(/NO HEAD|no head/i);
    expect(prompt).toContain('no skull');
    expect(prompt).toContain('open neck');
    expect(prompt).toContain('blank');
    expect(prompt).toContain('T-pose');
    expect(prompt).toContain('NOT crossed arms');
    expect(prompt).toContain('avoid: head');
    expect(prompt).not.toContain('head to toe visible');
  });

  it('headless body negative prompt bans head and crossed arms for Krea', () => {
    const negative = buildTextToImageNegativePrompt(STUDIO_HEADLESS_BODY_TEXT_TO_IMAGE_OPTIONS);
    expect(negative).toBe(HEADLESS_BODY_NEGATIVE_PROMPT);
    expect(negative).toContain('head');
    expect(negative).toContain('crossed arms');
    expect(buildTextToImageNegativePrompt({ headless_body: false })).toBe('');
  });

  it('garment prompt is isolated clothing without full body', () => {
    const prompt = buildTextToImagePrompt(
      'red joggers',
      STUDIO_GARMENT_TEXT_TO_IMAGE_OPTIONS,
    );
    expect(prompt).toContain('isolated garment');
    expect(prompt).toContain('no full human body');
    expect(prompt).not.toContain('T-pose');
    expect(prompt).not.toContain('head to toe');
  });

  it('worn T-pose garment options force mannequin T-pose for limb slots', () => {
    const opts = studioGarmentTextToImageOptionsForSlot('Chest');
    expect(opts.worn_tpose_garment).toBe(true);
    expect(opts.t_pose).toBe(true);
    const prompt = buildTextToImagePrompt('quilted vest', opts);
    expect(prompt).toContain('T-pose mannequin');
    expect(prompt).toContain('arms extended horizontally');
    expect(prompt).toContain('wider than shoulder-width');
    expect(prompt).not.toContain('isolated garment');

    const legsOpts = studioGarmentTextToImageOptionsForSlot('Legs');
    const legsPrompt = buildTextToImagePrompt('tactical pants', legsOpts);
    expect(legsPrompt).toContain('wide open stance');
    expect(legsPrompt).toContain('air gap between the thighs');
    expect(legsPrompt).toContain('must not touch');
    expect(legsPrompt).toMatch(/bare (mannequin )?feet|NO shoes/i);
    expect(legsPrompt).not.toMatch(
      /shoes or boots|each boot|footwear stance|footwear plates|boots or greaves/i,
    );

    const handsOpts = studioGarmentTextToImageOptionsForSlot('Hands');
    const handsPrompt = buildTextToImagePrompt('leather gloves', handsOpts);
    expect(handsPrompt).toContain('fingers clearly separated');
    expect(handsPrompt).toContain('thumb index and middle');
    expect(handsPrompt).toMatch(/palms facing (straight )?down|palms down/i);
    expect(handsPrompt).toMatch(/thumbs pointing forward/i);
    expect(handsPrompt).not.toMatch(/open palm/i);

    const mittenOpts = studioGarmentTextToImageOptionsForSlot('Hands');
    const mittenPrompt = buildTextToImagePrompt('knit mittens', mittenOpts);
    expect(mittenPrompt).toMatch(/palms facing (straight )?down|palms down/i);
    expect(mittenPrompt).toMatch(/thumbs pointing forward/i);

    const shoesOpts = studioGarmentTextToImageOptionsForSlot('Shoes');
    const shoesPrompt = buildTextToImagePrompt('armored boots', shoesOpts);
    expect(shoesPrompt).toContain('1.25 to 1.5');
    expect(shoesPrompt).toContain('must not touch');
    expect(shoesPrompt).toContain('skin-weight');
    expect(shoesPrompt.toLowerCase()).toMatch(/\b(boots?|shoes?|footwear)\b/);

    const fatShoes = buildTextToImagePrompt(
      'armored boots',
      studioGarmentTextToImageOptionsForSlot('Shoes', { body_composition: 'fat' }),
    );
    expect(fatShoes).toContain('1.5 to 2');
    expect(fatShoes).toContain('heavyset');

    const headOpts = studioGarmentTextToImageOptionsForSlot('Head');
    expect(headOpts.isolated_garment).toBe(true);
    expect(headOpts.worn_tpose_garment).toBe(false);

    const neckOpts = studioGarmentTextToImageOptionsForSlot('Neck');
    expect(neckOpts.isolated_garment).toBe(true);
    expect(neckOpts.worn_tpose_garment).toBe(false);
  });

  it('returns null preview when no modifiers selected', () => {
    expect(previewTextToImagePrompt('a fox', {})).toBeNull();
  });

  it('character gender appends male/female presentation fragments', () => {
    const male = buildTextToImagePrompt('dragon knight', {
      full_body: true,
      character_gender: 'male',
    });
    expect(male).toContain('male presentation');
    expect(male).toContain('masculine proportions');

    const female = buildTextToImagePrompt('dragon knight', {
      full_body: true,
      character_gender: 'female',
    });
    expect(female).toContain('female presentation');
    expect(female).toContain('feminine proportions');

    const creature = normalizeTextToImagePromptOptions({
      creature_rig_ready: true,
      character_gender: 'female',
    });
    expect(creature.character_gender).toBe('');
  });

  it('character ethnicity appends facial-feature fragments', () => {
    const asian = buildTextToImagePrompt('knight', {
      full_body: true,
      character_ethnicity: 'asian',
    });
    expect(asian).toContain('East Asian');

    const cleared = normalizeTextToImagePromptOptions({
      creature_rig_ready: true,
      character_ethnicity: 'asian',
      character_gender: 'male',
    });
    expect(cleared.character_ethnicity).toBe('');
    expect(cleared.character_gender).toBe('');
  });

  it('normalizes head_track on the humanoid wrap options', () => {
    expect(normalizeTextToImagePromptOptions({}).head_track).toBe('meshmonk');
    expect(normalizeTextToImagePromptOptions({ head_track: 'arc2avatar' }).head_track).toBe(
      'arc2avatar',
    );
    expect(normalizeTextToImagePromptOptions({ head_track: 'BOTH' }).head_track).toBe('both');
    expect(normalizeTextToImagePromptOptions({ head_track: 'none' }).head_track).toBe('none');
    expect(normalizeTextToImagePromptOptions({ head_track: 'nope' }).head_track).toBe('meshmonk');
  });

  it('normalizes likeness_source for MeshMonk selfie / body ROI', () => {
    expect(normalizeTextToImagePromptOptions({}).likeness_source).toBe('auto');
    expect(normalizeTextToImagePromptOptions({ likeness_source: 'selfie' }).likeness_source).toBe(
      'selfie',
    );
    expect(
      normalizeTextToImagePromptOptions({ likeness_source: 'body_roi' }).likeness_source,
    ).toBe('body_roi');
    expect(normalizeTextToImagePromptOptions({ likeness_source: 'nope' }).likeness_source).toBe(
      'auto',
    );
  });

  it('appends selfie skin tone phrase to headless body prompts', () => {
    const phrase =
      'warm medium-tan skin tone approximately #c4a484, uniform complexion, consistent neck and arms matching face reference';
    const prompt = buildTextToImagePrompt('casual streetwear body', {
      ...STUDIO_HEADLESS_BODY_TEXT_TO_IMAGE_OPTIONS,
      skin_tone_phrase: phrase,
      skin_tone_hex: '#c4a484',
    });
    expect(prompt).toContain('neck-down');
    expect(prompt).toContain('#c4a484');
    expect(prompt).toContain('consistent neck and arms');

    const garment = buildTextToImagePrompt('red jacket', {
      ...STUDIO_GARMENT_TEXT_TO_IMAGE_OPTIONS,
      skin_tone_phrase: phrase,
    });
    expect(garment).not.toContain('#c4a484');
  });

  it('buildOrthographicMultiviewPrompts returns six consistent views', () => {
    const views = buildOrthographicMultiviewPrompts('dragon knight', {
      full_body: true,
      t_pose: true,
      remove_background: true,
      all_orthographic_views: true,
    });
    expect(views.map((v) => v.viewId)).toEqual([...STUDIO_ORTHOGRAPHIC_VIEW_IDS]);
    expect(views.every((v) => v.prompt.includes('dragon knight'))).toBe(true);
    expect(views.every((v) => v.prompt.includes('character turnaround'))).toBe(true);
    expect(views[0].prompt).toContain('front view');
    expect(views[1].prompt).toContain('back view');
  });

  it('commitBodyWeightInput keeps incomplete lb drafts without wiping', () => {
    expect(commitBodyWeightInput('1', 'lb')).toEqual({ kg: null, committed: false });
    expect(commitBodyWeightInput('15', 'lb')).toEqual({ kg: null, committed: false });
    expect(commitBodyWeightInput('180', 'lb').committed).toBe(true);
    expect(commitBodyWeightInput('180', 'lb').kg).toBeGreaterThan(80);
    expect(commitBodyWeightInput('', 'lb')).toEqual({ kg: null, committed: true });
    expect(commitBodyWeightInput('70', 'kg')).toEqual({ kg: 70, committed: true });
  });

  it('body composition, height, and weight append physique fragments', () => {
    const prompt = buildTextToImagePrompt('streetwear body', {
      body_composition: 'athletic',
      body_height_cm: 185,
      body_weight_kg: 78,
      headless_body: true,
    });
    expect(prompt).toContain('athletic body composition');
    expect(prompt).toContain('185 cm tall');
    expect(prompt).toContain('78 kg body weight');

    const zombie = buildTextToImagePrompt('undead knight', {
      body_composition: 'zombie',
      body_height_cm: 170,
    });
    expect(zombie).toContain('zombie undead body composition');

    const normalized = normalizeTextToImagePromptOptions({
      body_composition: 'undead',
      body_height_cm: '172.4',
      body_weight_kg: '65',
    });
    expect(normalized.body_composition).toBe('zombie');
    expect(normalized.body_height_cm).toBe(172.4);
    expect(normalized.body_weight_kg).toBe(65);

    const garment = buildTextToImagePrompt('hoodie', {
      ...STUDIO_GARMENT_TEXT_TO_IMAGE_OPTIONS,
      body_composition: 'fat',
      body_height_cm: 180,
    });
    expect(garment).not.toContain('fat body composition');
    expect(garment).not.toContain('180 cm');

    const creature = normalizeTextToImagePromptOptions({
      creature_rig_ready: true,
      body_composition: 'curvy',
      body_height_cm: 160,
      body_weight_kg: 55,
    });
    expect(creature.body_composition).toBe('');
    expect(creature.body_height_cm).toBeNull();
    expect(creature.body_weight_kg).toBeNull();
  });
});
