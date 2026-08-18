/**
 * Appearance Editor clothing / component fitting helpers.
 *
 * Maps wearable object names → Choose Appearance trait slots and builds
 * auto-rig options for `rig_mode: appearance_component`.
 *
 * Culling layers (Modder getting-started / character-traits):
 *   0 = base body, 1 = clothing, 2+ = accessories (−1 = no cull).
 * See APPEARANCE_TRAIT_CULLING_LAYER / APPEARANCE_SLOT_CULLING_LAYER.
 */

import {
  AUTO_RIG_MODES,
  APPEARANCE_COMPONENT_RIG_MODEL_ID,
} from './avatarPipelineCatalog.js';
import { wornLegStanceFragment, TPOSE_HAND_ORIENTATION_FRAGMENT } from './textToImagePromptOptions.js';

/** Canonical Loot / Appearance trait ids. */
export const APPEARANCE_SLOTS = [
  'Body',
  'Head',
  'Hands',
  'Shoes',
  'Chest',
  'Waist',
  'Neck',
  'Legs',
];

/**
 * Manifest culling layers — same integers as Modder docs
 * (`docs/docs/Modders/getting-started.md` § Culling Layers,
 * `docs/docs/Modders/manifest-files/character-traits.md` § defaultCullingLayer).
 * Lower layer meshes are culled by higher layers; −1 skips culling.
 */
export const APPEARANCE_TRAIT_CULLING_LAYER = Object.freeze({
  BASE_BODY: 0,
  CLOTHING: 1,
  ACCESSORY: 2,
  NO_CULL: -1,
});

/**
 * Studio Body+Cloth slot → recommended cullingLayer when equipping.
 * Slot `Body` here means full-body *garments* (pajamas, jumpsuits) → clothing (1),
 * not the soulbound base-body mesh (also named Body in manifests, layer 0).
 */
export const APPEARANCE_SLOT_CULLING_LAYER = Object.freeze({
  Body: APPEARANCE_TRAIT_CULLING_LAYER.CLOTHING,
  Chest: APPEARANCE_TRAIT_CULLING_LAYER.CLOTHING,
  Legs: APPEARANCE_TRAIT_CULLING_LAYER.CLOTHING,
  Waist: APPEARANCE_TRAIT_CULLING_LAYER.CLOTHING,
  Shoes: APPEARANCE_TRAIT_CULLING_LAYER.CLOTHING,
  Hands: APPEARANCE_TRAIT_CULLING_LAYER.ACCESSORY,
  Head: APPEARANCE_TRAIT_CULLING_LAYER.ACCESSORY,
  Neck: APPEARANCE_TRAIT_CULLING_LAYER.ACCESSORY,
});

/** Slots replaced by a full-body garment (layer-1 onesie / pajamas / jumpsuit). */
export const FULLBODY_EXCLUDED_SLOTS = Object.freeze(['Chest', 'Legs', 'Waist']);

/** When Legs is missing from the pack, equip into Waist (waistband). */
export const APPEARANCE_SLOT_EQUIP_FALLBACK = {
  Legs: 'Waist',
};

/** Full-body garments → Appearance slot Body (hips–head–feet bone fit). */
const FULLBODY_ITEM_RE =
  /\b(paja?mas?|pyjamas?|onesie|jumpsuit|romper|overalls|coveralls|bodysuit|catsuit|flight\s*suit|boiler\s*suit|wetsuit|sleepwear|nightgown|nightie|housecoat|dressing\s*gown|full[\s-]?body\s*(?:outfit|suit|garment)|one[\s-]?piece)\b/i;

/** Wrist jewelry / watches — mutually exclusive with covering gloves. */
const WRISTWEAR_ITEM_RE =
  /\b(bracelet|bracelets|bangle|bangles|wristband|wristbands|wrist\s*wrap|wristwatch|wrist\s*watch|smart\s*watch|smartwatch|watch|cuff(?!\s*link)|sweatband|fitness\s*tracker|paracord)\b/i;

/** Gloves that cover the wrist — no separate wristwear. */
const COVERING_GLOVES_RE =
  /\b(boxing\s*gloves?|gauntlet|gauntlets|mitten|mittens|hockey\s*gloves?|goalie\s*gloves?|padded\s*gloves?)\b/i;

const NAME_TO_SLOT = [
  [FULLBODY_ITEM_RE, 'Body'],
  [/\b(jogger|joggers|pants|trousers|shorts|jeans|leggings|skirt|kilt)\b/i, 'Legs'],
  [/\b(shoe|shoes|boot|boots|sneaker|sneakers|sandal|slippers?|footwear|greave|flip-?flops?|slides?)\b/i, 'Shoes'],
  [
    /\b(boxing\s*gloves?|glove|gloves|gauntlet|mitten|bracelet|bracelets|wristband|wrist\s*wrap|wristwatch|smart\s*watch|smartwatch|watch)\b/i,
    'Hands',
  ],
  [
    /\b((?:eye)?glass(?:es)?|sunglass(?:es)?|spectacles?|earring|earrings|hat|cap|helmet|hood|crown|headwear|mask|beanie|visor)\b/i,
    'Head',
  ],
  [/\b(necklace|collar|choker|scarf|pendant|chain|medallion)\b/i, 'Neck'],
  [/\b(belt|sash|cummerbund|waistband)\b/i, 'Waist'],
  [/\b(shirt|jacket|coat|hoodie|sweater|armor|robe|chest|torso|vest|blouse|top)\b/i, 'Chest'],
  [/\b(clothing|outfit|wearable|apparel|garment)\b/i, 'Chest'],
];

const SLOT_ALIASES = {
  pants: 'Legs',
  legs: 'Legs',
  lower: 'Legs',
  lowerbody: 'Legs',
  lower_body: 'Legs',
  torso: 'Chest',
  upper: 'Chest',
  upperbody: 'Chest',
  fullbody: 'Body',
  full_body: 'Body',
  pajamas: 'Body',
  pyjamas: 'Body',
  onesie: 'Body',
  jumpsuit: 'Body',
  hair: 'Head',
  face: 'Head',
  eyewear: 'Head',
  glasses: 'Head',
  earrings: 'Head',
  footwear: 'Shoes',
  gloves: 'Hands',
  wrists: 'Hands',
  bracelet: 'Hands',
  watch: 'Hands',
  wristwatch: 'Hands',
  belt: 'Waist',
};

/**
 * @param {string} [slot]
 * @returns {string|null}
 */
export function normalizeAppearanceSlot(slot) {
  if (!slot) return null;
  const raw = String(slot).trim();
  if (!raw) return null;
  const hit = APPEARANCE_SLOTS.find((s) => s.toLowerCase() === raw.toLowerCase());
  if (hit) return hit;
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  return SLOT_ALIASES[key] || SLOT_ALIASES[raw.toLowerCase()] || null;
}

/**
 * @param {{ objectName?: string, meshFileName?: string, appearanceSlot?: string }} [hints]
 * @returns {string|null}
 */
export function inferAppearanceSlot(hints = {}) {
  const explicit = normalizeAppearanceSlot(hints.appearanceSlot);
  if (explicit) return explicit;
  const text = `${hints.objectName || ''} ${hints.meshFileName || ''}`.trim();
  if (!text) return null;
  for (const [re, slot] of NAME_TO_SLOT) {
    if (re.test(text)) return slot;
  }
  return null;
}

/**
 * @param {string} slot
 * @returns {string}
 */
export function equipSlotForAppearance(slot) {
  const normalized = normalizeAppearanceSlot(slot) || slot;
  return APPEARANCE_SLOT_EQUIP_FALLBACK[normalized] || normalized;
}

/**
 * @param {{ objectName?: string, meshFileName?: string, appearanceSlot?: string }} [hints]
 * @returns {boolean}
 */
export function isAppearanceClothingName(hints = {}) {
  return inferAppearanceSlot(hints) != null;
}

/**
 * @param {string} [slot]
 * @returns {number|null}
 */
export function cullingLayerForAppearanceSlot(slot) {
  const normalized = normalizeAppearanceSlot(slot);
  if (!normalized) return null;
  const layer = APPEARANCE_SLOT_CULLING_LAYER[normalized];
  return typeof layer === 'number' ? layer : null;
}

/**
 * @param {string} label
 * @returns {boolean}
 */
export function isFullBodyClothingLabel(label) {
  return FULLBODY_ITEM_RE.test(String(label || ''));
}

/**
 * @param {string} label
 * @returns {boolean}
 */
export function isWristwearLabel(label) {
  return WRISTWEAR_ITEM_RE.test(String(label || ''));
}

/**
 * @param {string} label
 * @returns {boolean}
 */
export function isCoveringGlovesLabel(label) {
  return COVERING_GLOVES_RE.test(String(label || ''));
}

/** Accessory segments that share an Appearance attachment slot but can co-exist. */
export const ACCESSORY_SEGMENT = Object.freeze({
  HAT: 'hat',
  HELMET: 'helmet',
  EYEWEAR: 'eyewear',
  EARRINGS: 'earrings',
  MASK: 'mask',
  CROWN: 'crown',
  COVERING_GLOVES: 'covering_gloves',
  LIGHT_GLOVES: 'light_gloves',
  WRISTWEAR: 'wristwear',
  SCARF: 'scarf',
  NECKLACE: 'necklace',
  COLLAR: 'collar',
});

/** Slots that support multiple segmented accessories. */
export const MULTI_ACCESSORY_SLOTS = Object.freeze(new Set(['Head', 'Hands', 'Neck']));

/**
 * Incompatible segments at the same attachment point.
 * Compatible example: hat + eyewear + earrings (baseball cap + glasses + studs).
 */
export const ACCESSORY_SEGMENT_CONFLICTS = Object.freeze({
  [ACCESSORY_SEGMENT.HELMET]: [
    ACCESSORY_SEGMENT.HAT,
    ACCESSORY_SEGMENT.EYEWEAR,
    ACCESSORY_SEGMENT.EARRINGS,
    ACCESSORY_SEGMENT.MASK,
    ACCESSORY_SEGMENT.CROWN,
  ],
  [ACCESSORY_SEGMENT.MASK]: [
    ACCESSORY_SEGMENT.EYEWEAR,
    ACCESSORY_SEGMENT.HELMET,
    ACCESSORY_SEGMENT.HAT,
  ],
  [ACCESSORY_SEGMENT.CROWN]: [ACCESSORY_SEGMENT.HAT, ACCESSORY_SEGMENT.HELMET],
  [ACCESSORY_SEGMENT.COVERING_GLOVES]: [
    ACCESSORY_SEGMENT.WRISTWEAR,
    ACCESSORY_SEGMENT.LIGHT_GLOVES,
  ],
  [ACCESSORY_SEGMENT.COLLAR]: [ACCESSORY_SEGMENT.SCARF],
});

/** Per-slot pick chances when randomizing multi-segment accessories. */
export const ACCESSORY_SEGMENT_PICK_CHANCE = Object.freeze({
  Head: Object.freeze({
    [ACCESSORY_SEGMENT.HELMET]: 0.1,
    [ACCESSORY_SEGMENT.MASK]: 0.06,
    [ACCESSORY_SEGMENT.CROWN]: 0.08,
    [ACCESSORY_SEGMENT.HAT]: 0.7,
    [ACCESSORY_SEGMENT.EYEWEAR]: 0.5,
    [ACCESSORY_SEGMENT.EARRINGS]: 0.4,
  }),
  Hands: Object.freeze({
    [ACCESSORY_SEGMENT.COVERING_GLOVES]: 0.18,
    [ACCESSORY_SEGMENT.LIGHT_GLOVES]: 0.22,
    [ACCESSORY_SEGMENT.WRISTWEAR]: 0.55,
  }),
  Neck: Object.freeze({
    [ACCESSORY_SEGMENT.SCARF]: 0.28,
    [ACCESSORY_SEGMENT.COLLAR]: 0.12,
    [ACCESSORY_SEGMENT.NECKLACE]: 0.65,
  }),
});

/**
 * Classify a wearable into a same-slot accessory segment (smart segmentation).
 * @param {string} [slot]
 * @param {string} [label]
 * @returns {string|null}
 */
export function classifyAccessorySegment(slot, label) {
  const s = normalizeAppearanceSlot(slot) || inferAppearanceSlot({ objectName: label });
  const text = String(label || '');
  if (!s || !text.trim()) return null;

  if (s === 'Head') {
    if (/\b(helmet|helm|bascinet|nasal\s*helm|kettle\s*helm)\b/i.test(text)) {
      return ACCESSORY_SEGMENT.HELMET;
    }
    if (/\b(mask|balaclava|ski\s*mask)\b/i.test(text)) return ACCESSORY_SEGMENT.MASK;
    if (/\b(crown|circlet|tiara|fascinator)\b/i.test(text)) return ACCESSORY_SEGMENT.CROWN;
    if (/\b((?:eye)?glass(?:es)?|sunglass(?:es)?|spectacles?|goggles?)\b/i.test(text)) {
      return ACCESSORY_SEGMENT.EYEWEAR;
    }
    if (/\b(earrings?|ear\s*cuff)\b/i.test(text)) return ACCESSORY_SEGMENT.EARRINGS;
    if (
      /\b(hat|cap|beanie|beret|durag|visor|fedora|hood|chaperon|newsboy|trucker|snapback|bucket|cloche|boonie)\b/i.test(
        text,
      )
    ) {
      return ACCESSORY_SEGMENT.HAT;
    }
    return ACCESSORY_SEGMENT.HAT;
  }

  if (s === 'Hands') {
    if (isCoveringGlovesLabel(text)) return ACCESSORY_SEGMENT.COVERING_GLOVES;
    if (isWristwearLabel(text)) return ACCESSORY_SEGMENT.WRISTWEAR;
    if (/\b(glove|gloves|mitten|gauntlet)\b/i.test(text)) return ACCESSORY_SEGMENT.LIGHT_GLOVES;
    return ACCESSORY_SEGMENT.WRISTWEAR;
  }

  if (s === 'Neck') {
    if (/\b(scarf|neckerchief|bandana|muffler)\b/i.test(text)) return ACCESSORY_SEGMENT.SCARF;
    if (/\b(choker|collar|gorget)\b/i.test(text)) return ACCESSORY_SEGMENT.COLLAR;
    return ACCESSORY_SEGMENT.NECKLACE;
  }

  return null;
}

/**
 * Drop conflicting garments so outfits respect layering + same-slot segmentation:
 * - Full-body clothing (layer 1) replaces Chest / Legs / Waist
 * - Covering gloves exclude wristwear / light gloves on Hands
 * - Head/Hands/Neck: one item per accessory segment; incompatible segments drop
 *   (helmet vs cap+glasses; mask vs eyewear) while compatible ones keep
 *   (baseball cap + glasses + earrings)
 *
 * @template {{ label?: string, appearance_slot?: string, accessory_segment?: string }} T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function applySmartClothingLayering(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows || [];

  const annotated = rows.map((r) => {
    const slot = normalizeAppearanceSlot(r.appearance_slot) || r.appearance_slot || 'Chest';
    const label = String(r.label || '');
    const segment =
      r.accessory_segment ||
      classifyAccessorySegment(slot, label) ||
      null;
    return { ...r, appearance_slot: slot, accessory_segment: segment };
  });

  const hasFullBody = annotated.some(
    (r) => r.appearance_slot === 'Body' || isFullBodyClothingLabel(r.label),
  );

  const afterFullBody = annotated.filter((r) => {
    if (hasFullBody && FULLBODY_EXCLUDED_SLOTS.includes(r.appearance_slot)) return false;
    return true;
  });

  // Process multi-accessory slots in segment-priority order so helmet/gloves win conflicts.
  const priorityIndex = (slot, segment) => {
    const defs = ACCESSORY_SEGMENT_PICK_CHANCE[slot];
    if (!defs || !segment) return 999;
    const keys = Object.keys(defs);
    const idx = keys.indexOf(segment);
    return idx === -1 ? 500 : idx;
  };

  const ordered = [...afterFullBody].sort((a, b) => {
    if (a.appearance_slot !== b.appearance_slot) return 0;
    return (
      priorityIndex(a.appearance_slot, a.accessory_segment) -
      priorityIndex(b.appearance_slot, b.accessory_segment)
    );
  });

  /** @type {typeof annotated} */
  const out = [];
  /** @type {Map<string, Set<string>>} */
  const keptSegmentsBySlot = new Map();

  for (const row of ordered) {
    const slot = row.appearance_slot;
    const segment = row.accessory_segment;
    if (!MULTI_ACCESSORY_SLOTS.has(slot) || !segment) {
      out.push(row);
      continue;
    }

    if (!keptSegmentsBySlot.has(slot)) keptSegmentsBySlot.set(slot, new Set());
    const kept = keptSegmentsBySlot.get(slot);

    if (kept.has(segment)) {
      continue;
    }

    const conflicts = ACCESSORY_SEGMENT_CONFLICTS[segment] || [];
    if ([...kept].some((k) => conflicts.includes(k))) {
      continue;
    }
    let blocked = false;
    for (const k of kept) {
      const kConflicts = ACCESSORY_SEGMENT_CONFLICTS[k] || [];
      if (kConflicts.includes(segment)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    kept.add(segment);
    out.push(row);
  }

  // Restore original relative order among survivors.
  const survivor = new Set(out);
  return afterFullBody.filter((r) => survivor.has(r));
}

/**
 * Manifest trait-group candidates so multiple Head accessories can equip without
 * overwriting each other when the collection defines segmented groups.
 * @param {string} [slot]
 * @param {string|null} [segment]
 * @returns {string[]}
 */
export function equipTraitCandidatesForAccessory(slot, segment = null) {
  const preferred = normalizeAppearanceSlot(slot) || slot || 'Waist';
  const seg = segment || null;
  const ranked = [];
  if (seg && preferred) {
    const pascal = seg.replace(/(^|_)([a-z])/g, (_, _u, c) => c.toUpperCase());
    ranked.push(
      `${preferred}_${pascal}`,
      `${preferred}_${seg}`,
      `${preferred}-${seg}`,
      pascal,
    );
    if (seg === ACCESSORY_SEGMENT.EYEWEAR) ranked.push('Eyewear', 'Glasses', 'Sunglasses');
    if (seg === ACCESSORY_SEGMENT.HAT) ranked.push('Hat', 'Headwear', 'Cap');
    if (seg === ACCESSORY_SEGMENT.EARRINGS) ranked.push('Earrings', 'Ears');
    if (seg === ACCESSORY_SEGMENT.HELMET) ranked.push('Helmet', 'Helm');
    if (seg === ACCESSORY_SEGMENT.WRISTWEAR) ranked.push('Wrist', 'Watch', 'Bracelet');
    if (seg === ACCESSORY_SEGMENT.COVERING_GLOVES || seg === ACCESSORY_SEGMENT.LIGHT_GLOVES) {
      ranked.push('Gloves', 'Hands_Gloves');
    }
    if (seg === ACCESSORY_SEGMENT.NECKLACE) ranked.push('Necklace', 'Jewelry');
    if (seg === ACCESSORY_SEGMENT.SCARF) ranked.push('Scarf');
  }
  ranked.push(preferred, equipSlotForAppearance(preferred), 'Waist', 'Chest');
  return ranked.filter((v, i, a) => v && a.indexOf(v) === i);
}

/**
 * Pick compatible accessory stems for a multi-equip slot (Head / Hands / Neck).
 * @param {string} slot
 * @param {string[]} pool
 * @param {() => number} rng
 * @returns {{ item: string, segment: string }[]}
 */
export function pickCompatibleAccessoryItems(slot, pool, rng = Math.random) {
  const normalized = normalizeAppearanceSlot(slot) || slot;
  if (!MULTI_ACCESSORY_SLOTS.has(normalized) || !pool?.length) {
    const item = pickRandom(pool, rng);
    return item
      ? [{ item, segment: classifyAccessorySegment(normalized, item) || 'other' }]
      : [];
  }

  /** @type {Record<string, string[]>} */
  const bySeg = {};
  for (const item of pool) {
    const seg = classifyAccessorySegment(normalized, item);
    if (!seg) continue;
    if (!bySeg[seg]) bySeg[seg] = [];
    bySeg[seg].push(item);
  }

  const defs = ACCESSORY_SEGMENT_PICK_CHANCE[normalized] || {};
  /** @type {string[]} */
  let chosen = [];
  for (const [seg, chance] of Object.entries(defs)) {
    if (!bySeg[seg]?.length) continue;
    if (rng() < chance) chosen.push(seg);
  }

  // Ensure Head usually gets at least one piece when the slot was not skipped.
  if (!chosen.length) {
    const fallbackOrder =
      normalized === 'Head'
        ? [ACCESSORY_SEGMENT.HAT, ACCESSORY_SEGMENT.EYEWEAR, ACCESSORY_SEGMENT.EARRINGS]
        : normalized === 'Hands'
          ? [ACCESSORY_SEGMENT.WRISTWEAR, ACCESSORY_SEGMENT.LIGHT_GLOVES, ACCESSORY_SEGMENT.COVERING_GLOVES]
          : [ACCESSORY_SEGMENT.NECKLACE, ACCESSORY_SEGMENT.SCARF];
    for (const seg of fallbackOrder) {
      if (bySeg[seg]?.length) {
        chosen = [seg];
        break;
      }
    }
  }

  // Resolve conflicts: drop lower-priority segments.
  const priority = Object.keys(defs);
  chosen.sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
  /** @type {string[]} */
  const resolved = [];
  for (const seg of chosen) {
    const conflicts = ACCESSORY_SEGMENT_CONFLICTS[seg] || [];
    if (resolved.some((k) => conflicts.includes(k) || (ACCESSORY_SEGMENT_CONFLICTS[k] || []).includes(seg))) {
      continue;
    }
    resolved.push(seg);
  }

  // Soft boost: if we have a hat and eyewear both available but only hat was picked,
  // ~50% also add eyewear (the baseball-cap + glasses case).
  if (
    normalized === 'Head' &&
    resolved.includes(ACCESSORY_SEGMENT.HAT) &&
    !resolved.includes(ACCESSORY_SEGMENT.EYEWEAR) &&
    bySeg[ACCESSORY_SEGMENT.EYEWEAR]?.length &&
    rng() < 0.55
  ) {
    const conflicts = ACCESSORY_SEGMENT_CONFLICTS[ACCESSORY_SEGMENT.EYEWEAR] || [];
    if (!resolved.some((k) => conflicts.includes(k))) {
      resolved.push(ACCESSORY_SEGMENT.EYEWEAR);
    }
  }
  if (
    normalized === 'Head' &&
    (resolved.includes(ACCESSORY_SEGMENT.HAT) || resolved.includes(ACCESSORY_SEGMENT.EYEWEAR)) &&
    !resolved.includes(ACCESSORY_SEGMENT.EARRINGS) &&
    bySeg[ACCESSORY_SEGMENT.EARRINGS]?.length &&
    rng() < 0.35
  ) {
    resolved.push(ACCESSORY_SEGMENT.EARRINGS);
  }

  return resolved.map((seg) => ({
    item: pickRandom(bySeg[seg], rng),
    segment: seg,
  }));
}

/**
 * Build auto-rig request fields for Appearance clothing fit.
 * @param {{ appearance_slot?: string, objectName?: string }} [options]
 */
export function buildAppearanceComponentAutoRigOptions(options = {}) {
  const slot =
    normalizeAppearanceSlot(options.appearance_slot) ||
    inferAppearanceSlot({ objectName: options.objectName }) ||
    'Legs';
  return {
    rig_mode: AUTO_RIG_MODES.APPEARANCE_COMPONENT,
    appearance_slot: slot,
    output_format: 'vrm',
    model_preference: APPEARANCE_COMPONENT_RIG_MODEL_ID,
  };
}

/**
 * Parse clothing / accessory lines from Studio clothing textarea.
 * Splits on newlines and commas. Optional overrides:
 *   `Legs: red joggers` or `red joggers @Legs` or `red joggers [Shoes]`
 * Optional cut: `(long)`, `(short)`, `(long-sleeve)`, `(short-sleeve)`.
 *
 * @param {string} text
 * @returns {{ label: string, appearance_slot: string, object_name: string, cut: string|null, cut_locked: boolean, cut_kind: string|null }[]}
 */
export function parseClothingAccessoryLines(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const chunks = raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const results = [];
  for (const chunk of chunks) {
    let label = chunk;
    let slotOverride = null;
    let cutOverride = null;

    const colon = chunk.match(/^([A-Za-z_]+)\s*:\s*(.+)$/);
    if (colon) {
      const maybe = normalizeAppearanceSlot(colon[1]);
      if (maybe) {
        slotOverride = maybe;
        label = colon[2].trim();
      }
    }

    const atSlot = label.match(/^(.*?)\s*@\s*([A-Za-z_]+)\s*$/);
    if (atSlot) {
      const maybe = normalizeAppearanceSlot(atSlot[2]);
      if (maybe) {
        slotOverride = maybe;
        label = atSlot[1].trim();
      }
    }

    const bracket = label.match(/^(.*?)\s*\[([A-Za-z_]+)\]\s*$/);
    if (bracket) {
      const maybe = normalizeAppearanceSlot(bracket[2]);
      if (maybe) {
        slotOverride = maybe;
        label = bracket[1].trim();
      }
    }

    // Cut token: (long) (short) (long-sleeve) (short-sleeve) or trailing #long / #short
    const cutParen = label.match(/^(.*?)\s*\((long(?:-?\s*sleeve)?|short(?:-?\s*sleeve)?|shorts)\)\s*$/i);
    if (cutParen) {
      label = cutParen[1].trim();
      cutOverride = normalizeGarmentCutToken(cutParen[2]);
    } else {
      const cutHash = label.match(/^(.*?)\s*#(long(?:-sleeve)?|short(?:-sleeve)?|shorts)\s*$/i);
      if (cutHash) {
        label = cutHash[1].trim();
        cutOverride = normalizeGarmentCutToken(cutHash[2]);
      }
    }

    if (!label) continue;

    const appearance_slot =
      slotOverride ||
      inferAppearanceSlot({ objectName: label }) ||
      'Chest';
    const object_name = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'garment';

    const cutInfo = resolveGarmentCut({
      label,
      appearance_slot,
      cut: cutOverride,
    });

    const accessory_segment = classifyAccessorySegment(appearance_slot, label);
    results.push({
      label,
      appearance_slot,
      object_name,
      cut: cutInfo.cut,
      cut_locked: cutInfo.locked,
      cut_kind: cutInfo.kind,
      culling_layer: cullingLayerForAppearanceSlot(appearance_slot),
      accessory_segment,
      equip_trait_candidates: equipTraitCandidatesForAccessory(
        appearance_slot,
        accessory_segment,
      ),
    });
  }
  return applySmartClothingLayering(results);
}

/** @param {string} token */
export function normalizeGarmentCutToken(token) {
  const t = String(token || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  if (!t) return null;
  if (t === 'shorts' || t === 'short' || t === 'short-sleeve' || t === 'shortsleeve') {
    return 'short';
  }
  if (t === 'long' || t === 'long-sleeve' || t === 'longsleeve') {
    return 'long';
  }
  if (t === 'sleeveless' || t === 'no-sleeve' || t === 'tank') {
    return 'sleeveless';
  }
  return null;
}

/**
 * Labels that lock cut — no further UI refinement needed.
 * Vest / t-shirt are obvious; shorts vs pants; hoodie implies long sleeve.
 */
const LEGS_CUT_LOCK = Object.freeze([
  [/\b(shorts|bermuda|hot.?pants|short.?shorts)\b/i, 'short'],
  [/\b(leggings|joggers|trousers|pants|jeans|chinos|cargo|wide-?leg|sweatpants)\b/i, 'long'],
]);

const CHEST_CUT_LOCK = Object.freeze([
  // Sleeveless / obvious — no sleeve UI
  [/\b(vest|waistcoat|tank|sleeveless|halter|crop\s*top)\b/i, 'sleeveless'],
  [/\b(t-?shirts?|tees?\b|polo)\b/i, 'short'],
  // Obvious long sleeve
  [/\b(hoodie|sweater|jumper|peacoat|coat|parka|cardigan|long\s*sleeve)\b/i, 'long'],
  [/\b(jacket|bomber|blazer|windbreaker)\b/i, 'long'],
]);

/** Chest labels that need an explicit short/long sleeve choice. */
const CHEST_CUT_CHOICE = /\b(shirts?|blouse|tops?|overshirts?|button-?downs?|oxford)\b/i;

/**
 * @param {{ label?: string, appearance_slot?: string, cut?: string|null }} opts
 * @returns {{ cut: 'long'|'short'|null, locked: boolean, kind: 'leg_length'|'sleeve_length'|null }}
 */
export function resolveGarmentCut(opts = {}) {
  const label = String(opts.label || '').trim();
  const slot = normalizeAppearanceSlot(opts.appearance_slot) || inferAppearanceSlot({ objectName: label });
  const explicit = normalizeGarmentCutToken(opts.cut);

  if (slot === 'Legs') {
    for (const [re, cut] of LEGS_CUT_LOCK) {
      if (re.test(label)) {
        return { cut: explicit || cut, locked: !explicit, kind: 'leg_length' };
      }
    }
    // Ambiguous Legs item — user must pick; default long.
    return { cut: explicit || 'long', locked: false, kind: 'leg_length' };
  }

  if (slot === 'Chest') {
    for (const [re, cut] of CHEST_CUT_LOCK) {
      if (re.test(label)) {
        // Locked designs (vest, t-shirt, hoodie) — no UI unless user overrode.
        return { cut: explicit || cut, locked: !explicit, kind: 'sleeve_length' };
      }
    }
    if (CHEST_CUT_CHOICE.test(label) || explicit) {
      return { cut: explicit || 'long', locked: false, kind: 'sleeve_length' };
    }
    // Jacket-like / unknown chest — no sleeve control.
    return { cut: explicit || null, locked: true, kind: null };
  }

  return { cut: null, locked: true, kind: null };
}

/**
 * Whether Studio should show a short/long control for this accessory.
 * Legs: always (exclusive length). Chest: only ambiguous shirts/tops — not vest/t-shirt.
 * @param {{ label?: string, appearance_slot?: string, cut?: string|null, cut_locked?: boolean, cut_kind?: string|null }} acc
 */
export function garmentCutNeedsUserChoice(acc = {}) {
  const label = String(acc.label || '').trim();
  const slot =
    normalizeAppearanceSlot(acc.appearance_slot) ||
    inferAppearanceSlot({ objectName: label });
  if (slot === 'Legs') return true;
  if (slot === 'Chest') {
    // Obvious designs skip the control.
    for (const [re] of CHEST_CUT_LOCK) {
      if (re.test(label)) return false;
    }
    return CHEST_CUT_CHOICE.test(label);
  }
  return false;
}

/**
 * @param {'leg_length'|'sleeve_length'|null|undefined} kind
 * @returns {{ value: string, label: string }[]}
 */
export function garmentCutSelectOptions(kind) {
  if (kind === 'leg_length') {
    return [
      { value: 'long', label: 'Long' },
      { value: 'short', label: 'Shorts' },
    ];
  }
  if (kind === 'sleeve_length') {
    return [
      { value: 'long', label: 'Long sleeve' },
      { value: 'short', label: 'Short sleeve' },
    ];
  }
  return [];
}

/** Exclusive prompt fragments — never both lengths in one shot. */
const CUT_PROMPT_FRAGMENTS = Object.freeze({
  Legs: {
    long:
      'full-length long legs only, hem at ankles, NOT shorts, NOT cropped mid-thigh, single length only',
    short:
      'shorts only, hem above the knee, mid-thigh length, NOT full-length pants, NOT leggings to the ankle, single length only',
  },
  Chest: {
    long:
      'long sleeves only, sleeves to the wrists, NOT short sleeves, NOT sleeveless',
    short:
      'short sleeves only, sleeves end above the elbow, NOT long sleeves, NOT a coat',
    sleeveless:
      'sleeveless only, no sleeves, open armholes, NOT short sleeves, NOT long sleeves',
  },
});

/** Slot-specific mesh-ready framing (Krea → TRELLIS). */
const SLOT_MESH_READY_FRAGMENTS = Object.freeze({
  Body:
    'full-body one-piece garment on a T-pose mannequin from shoulders to ankles, ' +
    'single continuous outfit covering torso and legs, NOT separate top and pants, ' +
    'arms and legs clearly separated, bare feet wider than shoulder-width with a clear air gap between the knees, ' +
    'NO shoes, NO boots, NO sneakers attached',
  Hands:
    'hands accessory on a T-pose mannequin; ' +
    'for bracelets or wristbands show jewelry on the named wrist only (left, right, or both) at true wrist scale; ' +
    'for wristwatches show a readable watch face on the named wrist only; ' +
    'for boxing gloves show a matched pair of padded gloves, one on each hand, covering the wrists (no separate bracelets)',
  Legs:
    'legs garment only on a T-pose mannequin in a wide open stance with clear air gap between the thighs calves and knees, ' +
    'bare mannequin feet planted wider than shoulder-width apart, left and right legs must not touch, ' +
    'NO shoes, NO boots, NO sneakers, NO footwear — pants or shorts end at the hem with bare ankles visible, ' +
    'NOT feet together, NOT crossed legs, NOT knees touching, inner leg seams visible for 3D skin-weight segmentation',
  Shoes:
    'boots or shoes on a T-pose mannequin with feet wider than shoulder-width apart, ' +
    'large clear air gap between left and right footwear at the ankles shins and knees, ' +
    'boot plates and kneecaps must not touch or overlap, ' +
    'NOT feet together, NOT merged into one block, each boot independently readable for 3D skin-weight segmentation',
  Neck:
    'tiny neck jewelry only, pendant or choker that fits a human neck collar, ' +
    'product scale about 3 to 8 centimeters, plain studio backdrop, ' +
    'NOT a full torso, NOT a life-size dragon statue, NOT a body mannequin',
  Head:
    'single head accessory sized for one human head — hat, glasses, sunglasses, or earrings as specified, ' +
    'head-only product shot, wearable human scale, NOT oversized, NOT full body, NOT torso scale; ' +
    'for earrings show left ear, right ear, or both ears as named; for glasses show a clear frame and lenses',
});

/**
 * Hands mesh-ready framing: always T-pose palm-down bind; mittens keep thumb-pouch topology.
 * @param {string} [label]
 * @returns {string}
 */
function handsMeshReadyFragment(label = '') {
  const text = String(label || '');
  const isMitten = /\bmittens?\b/i.test(text);
  const topology = isMitten
    ? 'knit or cloth mittens with a distinct thumb pouch and fused finger pouch, ' +
      'mitten topology is correct — do not force five separate fingers'
    : 'for fingered gloves: fingers clearly separated and defined, visible gaps between thumb index and middle fingers, ' +
      'distinct finger silhouettes not fused into a club, five separate digits per hand readable for 3D mesh';
  return [TPOSE_HAND_ORIENTATION_FRAGMENT, topology, SLOT_MESH_READY_FRAGMENTS.Hands].join('; ');
}

/**
 * Subject line for Krea garment generation (style + slot + label + exclusive cut).
 * @param {{
 *   style?: string,
 *   slot?: string,
 *   label?: string,
 *   cut?: string|null,
 *   body_composition?: string,
 * }} [opts]
 * @returns {string}
 */
export function buildAppearanceGarmentSubjectPrompt(opts = {}) {
  const label = String(opts.label || 'garment').trim() || 'garment';
  const slot = normalizeAppearanceSlot(opts.slot) || inferAppearanceSlot({ objectName: label }) || 'Chest';
  const style = String(opts.style || '').trim();
  const cutInfo = resolveGarmentCut({
    label,
    appearance_slot: slot,
    cut: opts.cut,
  });
  const parts = [label, `${slot} slot wearable for humanoid avatar`];
  if (style) {
    parts.push(`matching style: ${style}`);
  }
  parts.push('fitted for appearance_base.vrm proportions');
  const frag = cutInfo.cut && CUT_PROMPT_FRAGMENTS[slot]?.[cutInfo.cut];
  if (frag) {
    parts.push(frag);
  }
  if (slot === 'Hands') {
    parts.push(handsMeshReadyFragment(label));
  } else {
    const slotFrag = SLOT_MESH_READY_FRAGMENTS[slot];
    if (slotFrag) {
      parts.push(slotFrag);
    }
  }
  if (slot === 'Shoes' || slot === 'Legs' || slot === 'Body') {
    parts.push(
      wornLegStanceFragment({
        body_composition: opts.body_composition,
        appearance_slot: slot,
      }),
    );
  }
  return parts.join(', ');
}

/** Default Studio Body+Cloth clothing lines (one per common Appearance slot). */
export const DEFAULT_STUDIO_CLOTHING_LINES = Object.freeze([
  'Chest: navy techwear hoodie',
  'Legs: charcoal tapered joggers',
  'Shoes: white leather sneakers',
  'Waist: black utility belt',
  'Neck: thin silver chain',
]);

export const DEFAULT_STUDIO_CLOTHING_TEXT = DEFAULT_STUDIO_CLOTHING_LINES.join('\n');

/** Default / cross-style fallbacks when a style pool omits a slot. */
export const STUDIO_CLOTHING_ITEM_POOL = Object.freeze({
  Body: [
    'pajama set',
    'flannel pajamas',
    'silk pajamas',
    'cotton pajamas',
    'striped pajamas',
    'onesie',
    'fleece onesie',
    'jumpsuit',
    'utility jumpsuit',
    'romper',
    'coveralls',
    'boiler suit',
    'flight suit',
    'knit bodysuit',
    'sleepwear onesie',
    'housecoat over pajamas',
  ],
  Chest: [
    'techwear hoodie',
    'cropped bomber jacket',
    'quilted vest',
    'linen overshirt',
    'armored chest plate',
    'silk blouse',
    'denim jacket',
    'wool peacoat',
    'graphic tee',
    'crewneck sweatshirt',
    'windbreaker',
    'leather moto jacket',
    'flannel button-up',
    'cropped sweater',
    'puffer jacket',
    'tank top',
  ],
  Legs: [
    'tapered joggers',
    'pleated trousers',
    'cargo pants',
    'slim jeans',
    'athletic shorts',
    'leather pants',
    'wide-leg trousers',
    'tactical leggings',
    'denim jeans',
    'distressed denim jeans',
    'baggy denim jeans',
    'straight-leg jeans',
    'denim shorts',
    'chino shorts',
    'bermuda shorts',
    'cargo shorts',
    'bike shorts',
    'sweatpants',
    'corduroy pants',
    'ripped skinny jeans',
  ],
  Shoes: [
    'leather sneakers',
    'combat boots',
    'chelsea boots',
    'running shoes',
    'loafers',
    'ankle boots',
    'platform sneakers',
    'trail hikers',
    'sandals',
    'strappy sandals',
    'sport sandals',
    'flip-flops',
    'house slippers',
    'fuzzy slippers',
    'slide sandals',
    'mule slippers',
    'high-top sneakers',
    'canvas sneakers',
    'work boots',
    'espadrilles',
  ],
  Waist: [
    'utility belt',
    'woven sash',
    'leather waistband',
    'web belt',
    'chain belt',
    'studded belt',
    'rope belt',
    'double-buckle belt',
    'hip chain',
  ],
  Neck: [
    'thin silver chain',
    'knit scarf',
    'leather choker',
    'pendant necklace',
    'silk neckerchief',
    'thick gold chain with medallion',
    'thick silver chain with medallion',
    'heavy Cuban link chain',
    'rope chain with pendant',
    'layered gold necklaces',
    'locket necklace',
    'dog-tag necklace',
    'beaded necklace',
    'bandana tied at the neck',
  ],
  Hands: [
    'fingerless gloves',
    'leather gauntlets',
    'knit mittens',
    'tactical gloves',
    'driving gloves',
    'rubber work gloves',
    'boxing gloves',
    'red boxing gloves',
    'black boxing gloves',
    'lace-up boxing gloves',
    'bracelet on left wrist',
    'bracelet on right wrist',
    'bracelets on both wrists',
    'beaded bracelet on left wrist',
    'beaded bracelet on right wrist',
    'gold bangle on left wrist',
    'gold bangle on right wrist',
    'gold bangles on both wrists',
    'silver cuff on left wrist',
    'silver cuff on right wrist',
    'leather wristband on left wrist',
    'leather wristband on right wrist',
    'wristbands on both wrists',
    'bracelet stack on left wrist',
    'bracelet stack on right wrist',
    'bracelet stacks on both wrists',
    'wristwatch on left wrist',
    'wristwatch on right wrist',
    'analog wristwatch on left wrist',
    'analog wristwatch on right wrist',
    'chronograph watch on left wrist',
    'chronograph watch on right wrist',
    'smartwatch on left wrist',
    'smartwatch on right wrist',
    'leather-strap watch on left wrist',
    'metal-band watch on right wrist',
    'friendship bracelets on both wrists',
  ],
  Head: [
    'beanie cap',
    'knit cap',
    'ribbed knit beanie',
    'baseball cap',
    'fitted baseball cap',
    'trucker baseball cap',
    'bucket hat',
    'corduroy bucket hat',
    'lightweight helmet',
    'knit hood',
    'beret',
    'snapback cap',
    'dad hat',
    'newsboy cap',
    'wide-brim sun hat',
    'durag',
    'headband',
    'clear eyeglasses',
    'round eyeglasses',
    'rectangular eyeglasses',
    'aviator sunglasses',
    'wayfarer sunglasses',
    'sport sunglasses',
    'rimless glasses',
    'earring on left ear',
    'earring on right ear',
    'earrings on both ears',
    'hoop earring on left ear',
    'hoop earring on right ear',
    'hoop earrings on both ears',
    'stud earring on left ear',
    'stud earring on right ear',
    'stud earrings on both ears',
    'dangling earrings on both ears',
    'ear cuff on left ear',
    'ear cuff on right ear',
  ],
});

/**
 * Per-style garment stems so randomize matches the subject prompt
 * (e.g. Medieval Dragon Knight → fantasy armor, not techwear hoodie).
 */
export const STUDIO_CLOTHING_STYLE_ITEM_POOLS = Object.freeze({
  fantasy: {
    Body: [
      'mage robes onesie',
      'embroidered jumpsuit',
      'battle romper',
      'arcane sleepwear pajamas',
    ],
    Chest: [
      'plate cuirass',
      'scale mail vest',
      'embroidered tabard',
      'dragon-scale chest armor',
      'leather brigandine',
      'mage robes',
      'knight surcoat',
      'ornate breastplate',
    ],
    Legs: [
      'plated greaves',
      'leather chausses',
      'armored leggings',
      'tasseted battle trousers',
      'mail hose',
      'knight poleyns',
      'scaled battle pants',
    ],
    Shoes: [
      'sabatons',
      'armored boots',
      'knight greave boots',
      'dragonhide boots',
      'iron-toed war boots',
      'leather riding boots',
    ],
    Waist: [
      'sword belt',
      'embossed war belt',
      'dragon-clasp sash',
      'plated girdle',
      'leather baldric',
    ],
    Neck: [
      'gorget collar',
      'cloak clasp chain',
      'amulet choker',
      'heraldic pendant',
      'fur mantle collar',
    ],
    Hands: [
      'plated gauntlets',
      'dragon-scale gauntlets',
      'leather vambraces',
      'knight gloves',
      'rune bracelet on left wrist',
      'rune bracelet on right wrist',
      'rune bracelets on both wrists',
      'gold bracer on left wrist',
      'gold bracer on right wrist',
      'leather wrist cuffs on both wrists',
    ],
    Head: [
      'great helm',
      'knight bascinet',
      'horned war helm',
      'dragon crest helmet',
      'mage hood',
      'circlet crown',
      'leather coif',
      'fur-lined hood',
      'arcane spectacles',
      'round mage eyeglasses',
      'elven hoop earrings on both ears',
      'gem stud earring on left ear',
      'gem stud earring on right ear',
      'dangling crystal earrings on both ears',
    ],
  },
  medieval: {
    Body: [
      'woolen nightshirt pajamas',
      'peasant smock onesie',
      'linen sleeping gown',
      'monk habit jumpsuit',
    ],
    Chest: [
      'chainmail hauberk',
      'padded gambeson',
      'heraldic surcoat',
      'leather jerkin',
      'iron breastplate',
      'wool tunic',
      'linen undertunic',
      'fur-lined cloak coat',
    ],
    Legs: [
      'woolen chausses',
      'mail chausses',
      'leather braies',
      'hose trousers',
      'armored greaves',
      'peasant shorts braies',
    ],
    Shoes: [
      'turnshoe boots',
      'iron sabatons',
      'leather riding boots',
      'peasant ankle boots',
      'strapped sandals',
      'wooden clogs',
    ],
    Waist: ['leather sword belt', 'rope sash', 'metal girdle', 'pouch belt', 'coin purse belt'],
    Neck: [
      'cloak pin',
      'wool scarf',
      'crucifix pendant',
      'fur collar',
      'thick bronze chain with medallion',
      'pilgrim badge necklace',
    ],
    Hands: [
      'mail mittens',
      'leather gloves',
      'plate gauntlets',
      'archer gloves',
      'bronze bracelet on left wrist',
      'bronze bracelet on right wrist',
      'bronze bracelets on both wrists',
      'leather wrist cuff on left wrist',
      'leather wrist cuff on right wrist',
      'twisted wire bracelet on left wrist',
    ],
    Head: [
      'kettle helm',
      'coif hood',
      'iron nasal helm',
      'woolen cap',
      'knit cap',
      'hooded chaperon',
      'straw peasant hat',
      'monk eyeglasses',
      'simple wire spectacles',
      'hoop earring on left ear',
      'hoop earring on right ear',
      'hoop earrings on both ears',
      'pearl drop earring on left ear',
      'pearl drop earring on right ear',
    ],
  },
  streetwear: {
    Body: [
      'streetwear jumpsuit',
      'cargo coveralls',
      'graphic onesie',
      'lounge pajama set',
    ],
    Chest: [
      'oversized hoodie',
      'graphic sweatshirt',
      'puffer vest',
      'bomber jacket',
      'flannel shirt',
      'cropped hoodie',
      'graphic tee',
      'denim trucker jacket',
      'varsity jacket',
      'windbreaker',
      'cropped puffer',
      'mesh jersey',
    ],
    Legs: [
      'baggy cargo pants',
      'distressed jeans',
      'denim jeans',
      'baggy denim jeans',
      'track pants',
      'tapered joggers',
      'wide cargo shorts',
      'denim shorts',
      'chino shorts',
      'baggy shorts',
      'carpenter pants',
      'stacked jeans',
    ],
    Shoes: [
      'chunky sneakers',
      'high-top sneakers',
      'skate shoes',
      'platform sneakers',
      'slides',
      'slide sandals',
      'foam runners',
      'dunk sneakers',
      'sandals',
      'fuzzy slippers',
    ],
    Waist: [
      'canvas belt',
      'chain belt',
      'nylon webbing belt',
      'studded belt',
      'hip chain',
      'logo web belt',
    ],
    Neck: [
      'bandana',
      'silver chain',
      'logo scarf',
      'thick gold chain with medallion',
      'thick silver chain with medallion',
      'Cuban link chain',
      'pearl necklace',
      'layered chains',
      'dog-tag necklace',
    ],
    Hands: [
      'fingerless gloves',
      'wrist warmers',
      'bracelet stack on left wrist',
      'bracelet stack on right wrist',
      'bracelets on both wrists',
      'gold bangle on left wrist',
      'gold bangle on right wrist',
      'Cuban link bracelet on left wrist',
      'Cuban link bracelet on right wrist',
      'rubber wristbands on both wrists',
      'boxing gloves',
      'black boxing gloves',
      'wristwatch on left wrist',
      'wristwatch on right wrist',
      'smartwatch on left wrist',
      'metal-band watch on right wrist',
    ],
    Head: [
      'beanie',
      'knit cap',
      'snapback cap',
      'baseball cap',
      'bucket hat',
      'corduroy bucket hat',
      'dad hat',
      'trucker cap',
      'ski mask rolled up',
      'durag',
      'clear eyeglasses',
      'round eyeglasses',
      'aviator sunglasses',
      'wayfarer sunglasses',
      'hoop earrings on both ears',
      'stud earring on left ear',
      'stud earring on right ear',
      'stud earrings on both ears',
      'dangling earring on left ear',
      'dangling earring on right ear',
    ],
  },
  techwear: {
    Body: ['modular tech jumpsuit', 'softshell coveralls', 'tactical onesie'],
    Chest: [
      'shell jacket',
      'modular hoodie',
      'waterproof anorak',
      'tactical vest',
      'softshell jacket',
      'zippered cargo shirt',
      'packable wind shell',
      'harness vest',
    ],
    Legs: [
      'cargo tech pants',
      'zippered joggers',
      'water-resistant trousers',
      'articulated tactical pants',
      'convertible cargo shorts',
      'stretch tech shorts',
      'gusseted trail pants',
    ],
    Shoes: [
      'trail hikers',
      'waterproof boots',
      'tech sneakers',
      'combat boots',
      'amphibious sandals',
      'approach shoes',
      'low hikers',
    ],
    Waist: ['utility belt', 'MOLLE waistband', 'magnetic buckle belt', 'holster belt'],
    Neck: ['neck gaiter', 'tech scarf', 'RFID badge lanyard', 'paracord necklace'],
    Hands: ['tactical gloves', 'touchscreen gloves', 'cut-resistant gloves', 'paracord bracelet on left wrist', 'paracord bracelet on right wrist', 'watch on left wrist'],
    Head: [
      'softshell hood',
      'cap with strap',
      'lightweight helmet',
      'boonie hat',
      'foldable bucket hat',
      'ear-flap knit cap',
      'tactical sunglasses',
      'clear safety glasses',
      'sport eyeglasses',
    ],
  },
  athletic: {
    Body: [
      'track jumpsuit',
      'warm-up onesie',
      'compression bodysuit',
      'team warm-up pajamas',
    ],
    Chest: [
      'compression top',
      'performance hoodie',
      'running jacket',
      'mesh training shirt',
      'sports jersey',
      'sleeveless muscle tee',
      'quarter-zip pullover',
      'warmup jacket',
    ],
    Legs: [
      'compression leggings',
      'running shorts',
      'basketball shorts',
      'bike shorts',
      'track pants',
      'athletic tights',
      'training joggers',
      'tennis shorts',
      'swim trunks',
    ],
    Shoes: [
      'running shoes',
      'training sneakers',
      'cleats',
      'cross-trainers',
      'court shoes',
      'sport sandals',
      'recovery slides',
      'turf shoes',
    ],
    Waist: ['elastic sports belt', 'race belt', 'hydration belt'],
    Neck: ['cooling towel', 'sweatband', 'race bib lanyard', 'whistle lanyard'],
    Hands: [
      'gym gloves',
      'wrist wraps',
      'batting gloves',
      'boxing gloves',
      'red boxing gloves',
      'black boxing gloves',
      'lace-up boxing gloves',
      'sweatband on left wrist',
      'sweatband on right wrist',
      'sweatbands on both wrists',
      'fitness tracker on left wrist',
      'fitness tracker on right wrist',
      'sport watch on left wrist',
      'sport watch on right wrist',
      'smartwatch on left wrist',
    ],
    Head: [
      'sports visor',
      'running cap',
      'baseball cap',
      'knit headband',
      'swim cap',
      'bucket hat',
      'sport sunglasses',
      'wraparound sunglasses',
      'clear sport eyeglasses',
      'swim goggles',
    ],
  },
  cyberpunk: {
    Body: [
      'neon tech jumpsuit',
      'holo coveralls',
      'circuit onesie',
      'chrome sleepwear pajamas',
    ],
    Chest: [
      'neon-trim jacket',
      'chrome plating vest',
      'holographic hoodie',
      'circuit-print coat',
      'armored street vest',
      'cropped cyber bomber',
      'LED mesh shirt',
    ],
    Legs: [
      'LED-stripe pants',
      'cyber cargo trousers',
      'chrome shin guards',
      'holographic leggings',
      'cut-off cyber shorts',
      'armored denim jeans',
    ],
    Shoes: [
      'neon sneakers',
      'mag-lock boots',
      'chrome combat boots',
      'holographic runners',
      'magnetic sandals',
      'glow-sole slippers',
    ],
    Waist: ['data-cable belt', 'neon web belt', 'chrome buckle sash', 'utility hip chain'],
    Neck: [
      'LED choker',
      'cyber implant collar',
      'fiber-optic scarf',
      'thick chrome chain with medallion',
      'hologram pendant',
    ],
    Hands: [
      'cyber gauntlets',
      'neon gloves',
      'plated fingerless gloves',
      'data-glove',
      'LED bracelet on left wrist',
      'LED bracelet on right wrist',
      'LED bracelets on both wrists',
      'chrome cuff on left wrist',
      'chrome cuff on right wrist',
      'boxing gloves with neon trim',
      'holo wristwatch on left wrist',
      'LED smartwatch on right wrist',
    ],
    Head: [
      'visor helm',
      'neon beanie',
      'knit cap',
      'AR headset crown',
      'chrome skullcap',
      'holographic bucket hat',
      'baseball cap with HUD brim',
      'cyberpunk sunglasses',
      'LED glasses',
      'neon hoop earrings on both ears',
      'circuit stud earring on left ear',
      'circuit stud earring on right ear',
      'holo dangling earrings on both ears',
    ],
  },
  formal: {
    Body: [
      'silk pajama set',
      'evening jumpsuit',
      'satin romper',
      'tailored dress jumpsuit',
    ],
    Chest: [
      'tailored blazer',
      'silk dress shirt',
      'wool waistcoat',
      'tuxedo jacket',
      'cashmere overcoat',
      'double-breasted jacket',
      'evening wrap',
    ],
    Legs: [
      'pressed trousers',
      'wool dress pants',
      'tuxedo trousers',
      'tailored slacks',
      'cropped formal pants',
      'palazzo formal trousers',
    ],
    Shoes: [
      'oxford shoes',
      'leather loafers',
      'patent dress shoes',
      'brogues',
      'dress sandals',
      'velvet slippers',
      'opera pumps',
    ],
    Waist: ['leather dress belt', 'silk cummerbund', 'thin formal belt', 'beaded sash'],
    Neck: [
      'silk necktie',
      'bow tie',
      'ascot scarf',
      'pearl necklace',
      'diamond pendant',
      'thick gold chain with medallion',
    ],
    Hands: [
      'dress gloves',
      'kidskin gloves',
      'opera gloves',
      'pearl bracelet on left wrist',
      'pearl bracelet on right wrist',
      'tennis bracelet on left wrist',
      'tennis bracelet on right wrist',
      'gold cufflinks bracelet on left wrist',
      'diamond tennis bracelets on both wrists',
      'dress watch on left wrist',
      'gold dress watch on right wrist',
      'thin metal wristwatch on left wrist',
    ],
    Head: [
      'fedora',
      'top hat',
      'fascinator',
      'formal beret',
      'cloche hat',
      'velvet bucket hat',
      'thin metal eyeglasses',
      'rimless eyeglasses',
      'pearl stud earrings on both ears',
      'diamond stud on left ear',
      'diamond stud on right ear',
      'chandelier earrings on both ears',
      'drop earring on left ear',
      'drop earring on right ear',
    ],
  },
  casual: {
    Body: [
      'cotton pajama set',
      'flannel pajamas',
      'lounge onesie',
      'soft jumpsuit',
      'romper',
      'housecoat over pajamas',
    ],
    Chest: [
      'linen shirt',
      'knit sweater',
      'denim jacket',
      'henley top',
      'soft cardigan',
      'polo shirt',
      'chambray shirt',
      'hoodie',
      'striped tee',
    ],
    Legs: [
      'chinos',
      'relaxed jeans',
      'denim jeans',
      'cotton shorts',
      'denim shorts',
      'bermuda shorts',
      'corduroy pants',
      'drawstring trousers',
      'capri pants',
      'lounge shorts',
    ],
    Shoes: [
      'canvas sneakers',
      'slip-ons',
      'chelsea boots',
      'sandals',
      'strappy sandals',
      'flip-flops',
      'house slippers',
      'moccasins',
      'boat shoes',
    ],
    Waist: ['woven belt', 'fabric sash', 'braided leather belt', 'canvas belt'],
    Neck: [
      'cotton scarf',
      'simple pendant',
      'thin silver chain',
      'beaded necklace',
      'thick silver chain with medallion',
      'friendship necklace',
    ],
    Hands: [
      'knit mittens',
      'light gloves',
      'friendship bracelets on both wrists',
      'bracelet on left wrist',
      'bracelet on right wrist',
      'beaded bracelet on left wrist',
      'beaded bracelet on right wrist',
      'leather wristband on left wrist',
      'leather wristband on right wrist',
      'watch on left wrist',
      'watch on right wrist',
      'wristwatch on left wrist',
      'smartwatch on left wrist',
      'leather-strap watch on right wrist',
    ],
    Head: [
      'baseball cap',
      'sun hat',
      'knit beanie',
      'knit cap',
      'bucket hat',
      'straw hat',
      'visor',
      'floppy beach hat',
      'clear eyeglasses',
      'round eyeglasses',
      'sunglasses',
      'stud earrings on both ears',
      'hoop earring on left ear',
      'hoop earring on right ear',
      'hoop earrings on both ears',
      'small dangling earrings on both ears',
    ],
  },
  default: STUDIO_CLOTHING_ITEM_POOL,
});

const STYLE_ADJECTIVES = Object.freeze({
  streetwear: ['matte black', 'oversized', 'urban', 'graffiti-print', 'vintage-wash', 'boxy'],
  techwear: ['waterproof', 'carbon-gray', 'modular', 'shell', 'ripstop'],
  casual: ['soft', 'faded', 'everyday', 'washed', 'sun-bleached', 'cozy'],
  athletic: ['performance', 'breathable', 'neon-accent', 'compression', 'moisture-wicking'],
  fantasy: ['ornate', 'embroidered', 'arcane', 'gilded', 'dragon-etched', 'battle-worn'],
  medieval: ['weathered', 'ironbound', 'heraldic', 'hand-forged', 'battle-scarred'],
  cyberpunk: ['neon-lit', 'chrome', 'holographic', 'circuit', 'glitch-print'],
  formal: ['tailored', 'charcoal', 'silk', 'pressed', 'evening'],
  default: ['matte', 'textured', 'layered', 'neutral', 'vintage'],
});

const STYLE_COLORS = Object.freeze({
  fantasy: ['burgundy', 'ember red', 'obsidian', 'gold-trimmed', 'forest green', 'royal purple', 'bronze'],
  medieval: ['iron gray', 'mud brown', 'heraldic red', 'oak brown', 'steel blue', 'parchment'],
  streetwear: ['navy', 'charcoal', 'ivory', 'olive', 'black', 'sand', 'washed blue', 'stone', 'burgundy'],
  techwear: ['carbon black', 'slate', 'olive drab', 'gun-metal', 'ash gray'],
  athletic: ['neon lime', 'cobalt', 'ember red', 'white', 'graphite', 'team orange'],
  cyberpunk: ['neon magenta', 'electric cyan', 'chrome silver', 'void black', 'acid green'],
  formal: ['charcoal', 'ivory', 'navy', 'black', 'champagne'],
  casual: ['denim blue', 'sand', 'olive', 'cream', 'heather gray', 'rust', 'sky blue'],
  default: [
    'navy',
    'charcoal',
    'ivory',
    'olive',
    'burgundy',
    'slate',
    'sand',
    'cobalt',
    'ember red',
    'forest green',
    'denim blue',
    'gold',
  ],
});

/** Ordered detectors: first match wins (more specific before generic). */
const STYLE_DETECT_RULES = Object.freeze([
  [
    'medieval',
    /\b(medieval|middle ages|crusader|viking|samurai|feudal|castle|squire|yeoman|blacksmith)\b/i,
  ],
  [
    'fantasy',
    /\b(fantasy|knight|dragon|armor|armour|mage|wizard|elf|dwarf|orc|paladin|warlock|sorcer|necromancer|fairy|fae|mythic|epic|realm|quest|sword|shield|rune)\b/i,
  ],
  [
    'cyberpunk',
    /\b(cyberpunk|cyber|neon|futur(?:e|istic)?|android|synth|hologram|matrix|dystopian|mecha)\b/i,
  ],
  ['techwear', /\b(techwear|gorpcore|tactical|modular|softshell|urban ninja)\b/i],
  [
    'athletic',
    /\b(athletic|gym|sport|sports|runner|running|fitness|training|athlete|soccer|football|basketball)\b/i,
  ],
  [
    'formal',
    /\b(formal|suit|tuxedo|office|business|gala|wedding|black.?tie|couture)\b/i,
  ],
  [
    'streetwear',
    /\b(streetwear|street style|skate|hip.?hop|graffiti|hypebeast|urban fashion)\b/i,
  ],
  ['casual', /\b(casual|everyday|weekend|relaxed|loungewear|cottagecore|pajama|pyjama|sleepwear|onesie)\b/i],
]);

/**
 * Pull distinctive theme words from the subject prompt to weave into labels
 * (e.g. "dragon" from "Medieval Dragon Knight").
 * @param {string} stylePrompt
 * @param {string} styleKey
 * @returns {string[]}
 */
export function extractClothingThemeTokens(stylePrompt = '', styleKey = 'default') {
  const text = String(stylePrompt || '').toLowerCase();
  if (!text.trim()) return [];
  const stop = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'of',
    'for',
    'with',
    'in',
    'on',
    'to',
    'body',
    'character',
    'avatar',
    'humanoid',
    'person',
    'man',
    'woman',
    'male',
    'female',
    'full',
    'pose',
    'style',
    'matching',
  ]);
  const tokens = text
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stop.has(t));
  // Prefer concrete nouns that aren't the style key itself.
  const preferred = tokens.filter(
    (t) =>
      t !== styleKey &&
      !['medieval', 'fantasy', 'casual', 'formal', 'athletic', 'streetwear', 'techwear', 'cyberpunk'].includes(
        t,
      ),
  );
  return [...new Set(preferred)].slice(0, 3);
}

function pickRandom(list, rng = Math.random) {
  if (!list?.length) return '';
  return list[Math.floor(rng() * list.length)];
}

/**
 * Infer a style key from the body subject prompt for adjective + item pools.
 * @param {string} [stylePrompt]
 * @returns {string}
 */
export function inferClothingStyleKey(stylePrompt = '') {
  const text = String(stylePrompt || '').trim();
  if (!text) return 'default';
  const lower = text.toLowerCase();
  // Exact style-name substring (user typed "fantasy streetwear").
  for (const key of Object.keys(STYLE_ADJECTIVES)) {
    if (key === 'default') continue;
    if (lower.includes(key)) return key;
  }
  for (const [key, re] of STYLE_DETECT_RULES) {
    if (re.test(text)) return key;
  }
  return 'default';
}

/**
 * Item pool for a slot under a style (falls back to default / global pool).
 * @param {string} styleKey
 * @param {string} slot
 * @returns {string[]}
 */
export function clothingItemPoolForStyle(styleKey, slot) {
  const keyed = STUDIO_CLOTHING_STYLE_ITEM_POOLS[styleKey]?.[slot];
  if (keyed?.length) return keyed;
  const fallback = STUDIO_CLOTHING_STYLE_ITEM_POOLS.default?.[slot];
  if (fallback?.length) return fallback;
  return STUDIO_CLOTHING_ITEM_POOL[slot] || [];
}

/**
 * Build a randomized clothing list (slot-prefixed lines) biased by subject prompt.
 * Applies smart layering + same-slot segmentation (e.g. Head can be hat + glasses + earrings).
 *
 * @param {{
 *   stylePrompt?: string,
 *   slots?: string[],
 *   rng?: () => number,
 *   fullBodyChance?: number,
 * }} [opts]
 * @returns {string}
 */
export function randomizeStudioClothingText(opts = {}) {
  const stylePrompt = String(opts.stylePrompt || '').trim();
  const styleKey = inferClothingStyleKey(stylePrompt);
  const adjectives = STYLE_ADJECTIVES[styleKey] || STYLE_ADJECTIVES.default;
  const colors = STYLE_COLORS[styleKey] || STYLE_COLORS.default;
  const themes = extractClothingThemeTokens(stylePrompt, styleKey);
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const fullBodyChance =
    typeof opts.fullBodyChance === 'number' ? opts.fullBodyChance : 0.22;
  const requestedSlots =
    Array.isArray(opts.slots) && opts.slots.length
      ? opts.slots
      : ['Chest', 'Legs', 'Shoes', 'Waist', 'Neck', 'Hands', 'Head'];

  const bodyPool = clothingItemPoolForStyle(styleKey, 'Body');
  const useFullBody = bodyPool.length > 0 && rng() < fullBodyChance;

  /** @type {string[]} */
  let slots;
  if (useFullBody) {
    slots = [
      'Body',
      ...requestedSlots.filter((s) => !FULLBODY_EXCLUDED_SLOTS.includes(s) && s !== 'Body'),
    ];
  } else {
    slots = requestedSlots.filter((s) => s !== 'Body');
  }

  const lines = [];
  for (const slot of slots) {
    let pool = clothingItemPoolForStyle(styleKey, slot);
    if (!pool?.length) continue;
    // Optional accessory slots: still skip sometimes, but when kept may emit multiple segments.
    if (slot === 'Hands' && rng() < 0.2) continue;
    if (slot === 'Head' && rng() < 0.12) continue;
    if (slot === 'Neck' && rng() < 0.15) continue;
    // Pajamas / onesies often pair with slippers — bias Shoes toward slippers lightly.
    if (useFullBody && slot === 'Shoes' && rng() < 0.45) {
      const slipperish = pool.filter((item) => /slipper|sandal|flip|slide|mule/i.test(item));
      if (slipperish.length) pool = slipperish;
    }

    const picks = MULTI_ACCESSORY_SLOTS.has(slot)
      ? pickCompatibleAccessoryItems(slot, pool, rng)
      : [{ item: pickRandom(pool, rng), segment: null }];

    for (const pick of picks) {
      if (!pick?.item) continue;
      let item = pick.item;
      if (themes.length && rng() < 0.5) {
        const theme = pickRandom(themes, rng);
        if (theme && !item.toLowerCase().includes(theme)) {
          item = `${theme} ${item}`;
        }
      }
      const color = pickRandom(colors, rng);
      const adj = pickRandom(adjectives, rng);
      lines.push(`${slot}: ${adj} ${color} ${item}`);
    }
  }

  const layered = parseClothingAccessoryLines(lines.join('\n'));
  return layered.map((r) => `${r.appearance_slot}: ${r.label}`).join('\n');
}

/**
 * Equip a completed appearance-component VRM into CharacterManager.
 * Tries segmented trait groups first (Head_Eyewear, Hat, …) so glasses can
 * sit beside a baseball cap without overwriting the Head slot.
 * @param {object} characterManager
 * @param {string} url - Absolute VRM (or GLB) URL
 * @param {string} appearanceSlot
 * @param {{ accessorySegment?: string|null }} [opts]
 * @returns {Promise<{ slot: string, equipped: boolean, error?: string }>}
 */
export async function equipAppearanceComponentTrait(
  characterManager,
  url,
  appearanceSlot,
  opts = {},
) {
  if (!characterManager?.loadCustomTrait) {
    return { slot: appearanceSlot, equipped: false, error: 'No characterManager' };
  }
  const preferred = normalizeAppearanceSlot(appearanceSlot) || appearanceSlot || 'Waist';
  const segment =
    opts.accessorySegment ||
    null;
  const candidates = equipTraitCandidatesForAccessory(preferred, segment);
  let lastError = null;
  for (const slot of candidates) {
    try {
      await characterManager.loadCustomTrait(slot, url);
      console.log(`[Appearance] Equipped custom clothing into ${slot}:`, url);
      return { slot, equipped: true };
    } catch (err) {
      lastError = err?.message || String(err);
      console.warn(`[Appearance] loadCustomTrait(${slot}) failed:`, lastError);
    }
  }
  return { slot: preferred, equipped: false, error: lastError || 'equip failed' };
}
