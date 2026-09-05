/**
 * Text-to-image (Krea 2) prompt modifiers — appended to the user's subject prompt.
 */

import {
  HEAD_TRACK,
  normalizeHeadTrack,
} from './avatarPipelineCatalog.js';

export const TEXT_TO_IMAGE_VIEW_OPTIONS = [
  { id: '', label: 'Any view' },
  { id: 'front', label: 'Front view' },
  { id: 'back', label: 'Back view' },
  { id: 'side_left', label: 'Side view (left)' },
  { id: 'side_right', label: 'Side view (right)' },
  { id: 'top', label: 'Top view' },
  { id: 'bottom', label: 'Bottom view' },
];

/** Orthographic turnaround used for Studio → TRELLIS multiview (primary = front). */
export const STUDIO_ORTHOGRAPHIC_VIEW_IDS = Object.freeze([
  'front',
  'back',
  'side_left',
  'side_right',
  'top',
  'bottom',
]);

export const DEFAULT_TEXT_TO_IMAGE_PROMPT_OPTIONS = {
  remove_background: false,
  full_body: false,
  t_pose: false,
  a_pose: false,
  creature_rig_ready: false,
  head_forward: false,
  tail_clear: false,
  standing_pose: false,
  /** Open mouth / jaw-drop bias for face-visible character shots. */
  mouth_open: false,
  /** Neck-down body for Phase 5 template_wrap / composable avatar body. */
  headless_body: false,
  /** Isolated garment / accessory (no full body) for Appearance slots. */
  isolated_garment: false,
  /** Garment worn on a T-pose mannequin (Chest/Legs/Hands/Shoes/Waist). */
  worn_tpose_garment: false,
  /** Humanoid presentation: '' | 'male' | 'female'. */
  character_gender: '',
  /** GNM IdentitySampler ethnicity: '' | middle_eastern | asian | white | black. */
  character_ethnicity: '',
  /**
   * Body composition / silhouette bias for humanoid prompts.
   * '' | skinny | slim | athletic | curvy | muscular | chubby | fat | plus_size |
   * stocky | lanky | petite | average | skeletal | zombie
   */
  body_composition: '',
  /** Optional height in centimeters (null = omit). */
  body_height_cm: null,
  /** Optional weight in kilograms (null = omit). */
  body_weight_kg: null,
  /**
   * Humanoid wrap head track (same pipeline as Body+Cloth / template_wrap):
   * meshmonk | arc2avatar | both | none — see HEAD_TRACK in avatarPipelineCatalog.
   */
  head_track: HEAD_TRACK.MESHMONK,
  /**
   * MeshMonk likeness mesh source:
   * auto (selfie if uploaded, else body ROI) | selfie | body_roi
   */
  likeness_source: 'auto',
  /**
   * Optional complexion fragment from Face selfie swatch (Body+Cloth).
   * Ephemeral — set by Studio executor / preview when a selfie is present.
   */
  skin_tone_phrase: '',
  /** Optional #rrggbb from selfie face swatch (for UI / debug). */
  skin_tone_hex: '',
  camera_view: '',
  all_orthographic_views: false,
};

/** MeshMonk face_likeness source (selfie MediaPipe vs AIGC body head crop). */
export const LIKENESS_SOURCE_OPTIONS = Object.freeze([
  {
    id: 'auto',
    label: 'Auto',
    title: 'Use selfie for MeshMonk when uploaded; otherwise crop body mesh head ROI',
  },
  {
    id: 'selfie',
    label: 'Selfie',
    title: 'MediaPipe face mesh from the Face selfie upload (same photo as Arc2Avatar)',
  },
  {
    id: 'body_roi',
    label: 'Body ROI',
    title: 'Crop top of the TRELLIS body mesh (weak on neck-open Body+Cloth)',
  },
]);

export function normalizeLikenessSource(value) {
  const id = String(value || '').trim().toLowerCase();
  if (id === 'selfie' || id === 'body_roi' || id === 'auto') return id;
  return 'auto';
}

/** Male / female presentation for humanoid text-to-image. */
export const TEXT_TO_IMAGE_GENDER_OPTIONS = Object.freeze([
  { id: '', label: 'Any' },
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
]);

/** GNM ethnicity classes (prompt bias + template_wrap IdentitySampler). */
export const TEXT_TO_IMAGE_ETHNICITY_OPTIONS = Object.freeze([
  { id: '', label: 'Any' },
  { id: 'asian', label: 'Asian' },
  { id: 'black', label: 'Black' },
  { id: 'white', label: 'White' },
  { id: 'middle_eastern', label: 'Middle Eastern' },
]);

/** Humanoid body composition / silhouette chips. */
export const TEXT_TO_IMAGE_BODY_COMPOSITION_OPTIONS = Object.freeze([
  { id: '', label: 'Any', title: 'No body-composition bias' },
  { id: 'skinny', label: 'Skinny', title: 'Very thin, low body fat, narrow frame' },
  { id: 'slim', label: 'Slim', title: 'Lean and slender without looking gaunt' },
  { id: 'athletic', label: 'Athletic', title: 'Fit, toned muscle, sporty proportions' },
  { id: 'muscular', label: 'Muscular', title: 'Heavily muscled, defined physique' },
  { id: 'curvy', label: 'Curvy', title: 'Hourglass / soft curves, fuller hips and chest' },
  { id: 'chubby', label: 'Chubby', title: 'Soft midsection, rounded limbs' },
  { id: 'fat', label: 'Fat', title: 'High body fat, heavyset silhouette' },
  { id: 'plus_size', label: 'Plus-size', title: 'Plus-size body, full figure' },
  { id: 'stocky', label: 'Stocky', title: 'Short-to-average, thick solid build' },
  { id: 'lanky', label: 'Lanky', title: 'Tall and thin with long limbs' },
  { id: 'petite', label: 'Petite', title: 'Small frame, shorter stature bias' },
  { id: 'average', label: 'Average', title: 'Typical balanced adult proportions' },
  { id: 'skeletal', label: 'Skeletal', title: 'Emaciated, bone-visible, extreme thinness' },
  { id: 'zombie', label: 'Zombie', title: 'Undead / decaying gaunt body' },
]);

/** Quick height presets (cm) for stature chips. */
export const TEXT_TO_IMAGE_STATURE_PRESETS = Object.freeze([
  { id: 'short', label: 'Short', cm: 155, title: '~155 cm (5′1″)' },
  { id: 'average', label: 'Average', cm: 170, title: '~170 cm (5′7″)' },
  { id: 'tall', label: 'Tall', cm: 185, title: '~185 cm (6′1″)' },
  { id: 'very_tall', label: 'Very tall', cm: 200, title: '~200 cm (6′7″)' },
]);

const BODY_COMPOSITION_IDS = new Set(
  TEXT_TO_IMAGE_BODY_COMPOSITION_OPTIONS.map((o) => o.id).filter(Boolean),
);

/**
 * Defaults for single-image Studio → TRELLIS.2 (mesh-ready framing, one camera).
 */
export const STUDIO_MESH_READY_TEXT_TO_IMAGE_OPTIONS = {
  remove_background: true,
  full_body: true,
  t_pose: true,
  a_pose: false,
  creature_rig_ready: false,
  head_forward: false,
  tail_clear: false,
  standing_pose: false,
  camera_view: 'front',
  all_orthographic_views: false,
};

/**
 * Defaults for orthographic turnaround → TRELLIS multiview (6 views, shared seed).
 */
export const STUDIO_MULTIVIEW_TEXT_TO_IMAGE_OPTIONS = {
  remove_background: true,
  full_body: true,
  t_pose: true,
  a_pose: false,
  creature_rig_ready: false,
  head_forward: false,
  tail_clear: false,
  standing_pose: false,
  camera_view: 'front',
  all_orthographic_views: true,
};

/**
 * Quadruped / creature image → Mesh2Motion creature template auto-rig.
 * Side profile, head along body axis, tail clear of hind legs.
 */
export const STUDIO_CREATURE_MESH_READY_TEXT_TO_IMAGE_OPTIONS = {
  remove_background: true,
  full_body: true,
  t_pose: false,
  a_pose: false,
  creature_rig_ready: true,
  head_forward: true,
  tail_clear: true,
  standing_pose: true,
  headless_body: false,
  isolated_garment: false,
  camera_view: 'side_left',
  all_orthographic_views: false,
};

/**
 * Neck-open humanoid body for Studio → TRELLIS.2 → template_wrap (head attach region).
 */
export const STUDIO_HEADLESS_BODY_TEXT_TO_IMAGE_OPTIONS = {
  remove_background: true,
  full_body: true,
  t_pose: true,
  a_pose: false,
  creature_rig_ready: false,
  head_forward: false,
  tail_clear: false,
  standing_pose: false,
  headless_body: true,
  isolated_garment: false,
  camera_view: 'front',
  all_orthographic_views: false,
};

/**
 * Isolated clothing / accessory for Appearance `appearance_component` slot fit.
 * Prefer true product isolation for Head/Neck; use worn T-pose for limb/torso slots
 * via STUDIO_GARMENT_WORN_TPOSE_OPTIONS.
 */
export const STUDIO_GARMENT_TEXT_TO_IMAGE_OPTIONS = {
  remove_background: true,
  full_body: false,
  t_pose: false,
  a_pose: false,
  creature_rig_ready: false,
  head_forward: false,
  tail_clear: false,
  standing_pose: false,
  headless_body: false,
  isolated_garment: true,
  worn_tpose_garment: false,
  camera_view: 'front',
  all_orthographic_views: false,
};

/** Chest / Legs / Hands / Shoes / Waist — mannequin must be T-pose for bone fit. */
export const STUDIO_GARMENT_WORN_TPOSE_OPTIONS = {
  remove_background: true,
  full_body: true,
  t_pose: true,
  a_pose: false,
  creature_rig_ready: false,
  head_forward: false,
  tail_clear: false,
  standing_pose: false,
  headless_body: false,
  isolated_garment: false,
  worn_tpose_garment: true,
  camera_view: 'front',
  all_orthographic_views: false,
};

/** Slots that need a T-pose mannequin (vs isolated product for Head/Neck). */
export const APPEARANCE_SLOTS_NEED_WORN_TPOSE = new Set([
  'Chest',
  'Legs',
  'Hands',
  'Shoes',
  'Waist',
  'Body',
]);

/**
 * @param {string} [slot]
 * @param {{ body_composition?: string, character_gender?: string }} [physique]
 * @returns {object}
 */
export function studioGarmentTextToImageOptionsForSlot(slot, physique = {}) {
  const s = String(slot || '').trim();
  if (APPEARANCE_SLOTS_NEED_WORN_TPOSE.has(s)) {
    const opts = {
      ...STUDIO_GARMENT_WORN_TPOSE_OPTIONS,
      body_composition: physique.body_composition || '',
      character_gender: physique.character_gender || '',
    };
    // Slot tag so buildTextToImagePrompt can append Hands / Legs / Shoes cues.
    opts.appearance_slot = s;
    return opts;
  }
  return { ...STUDIO_GARMENT_TEXT_TO_IMAGE_OPTIONS, appearance_slot: s };
}

const VIEW_PROMPT_FRAGMENTS = {
  front: 'front view, facing camera, orthographic',
  back: 'back view, rear orthographic angle',
  side_left: 'left side profile view, orthographic',
  side_right: 'right side profile view, orthographic',
  top: 'top-down orthographic view, bird eye angle',
  bottom: 'bottom-up orthographic view, worm eye angle',
};

const T_POSE_FRAGMENT =
  'T-pose, arms extended horizontally to the sides, legs straight';
const A_POSE_FRAGMENT =
  'A-pose, arms slightly angled down from horizontal, legs straight';

/** Full creature auto-rig framing (quadruped / animal). */
const CREATURE_RIG_READY_FRAGMENT =
  'quadruped rest pose for 3D auto-rigging, standing on all four legs, ' +
  'body parallel to the ground, spine straight along the body length, ' +
  'neutral calm stance, no sitting, no curling, no jumping';

const HEAD_FORWARD_FRAGMENT =
  'head facing forward in the same direction as the body and spine ' +
  '(not turned toward camera, not looking over the shoulder), ' +
  'snout aligned with the spine axis, ears upright';

const TAIL_CLEAR_FRAGMENT =
  'tail extended straight behind the body, clearly separated from the hind legs ' +
  '(not tucked, not between the legs, not touching the haunches)';

const STANDING_POSE_FRAGMENT =
  'legs planted under the body with clear separation between front and hind limbs, ' +
  'paws on the ground, weight evenly distributed';

/** Face-visible mouth open — useful for jaw / lip-sync mesh readiness. */
const MOUTH_OPEN_FRAGMENT =
  'mouth open, lips parted, jaw slightly dropped, teeth or oral cavity visible, ' +
  'not closed mouth, not pressed lips';

const MULTIVIEW_CONSISTENCY_FRAGMENT =
  'character turnaround sheet, identical character identity outfit colors and proportions across all views, even studio lighting, no dramatic cinematic shadows';

/** Neck-down body: leave open collar for head stitch / template_wrap. */
const HEADLESS_BODY_FRAGMENT =
  'neck-down full body ONLY from collarbones to feet, ' +
  'NO HEAD whatsoever, no skull, no face, no hair, no ears, head completely omitted and cropped away, ' +
  'open neck stump with blank flat collar region for attaching a separate 3D head, ' +
  'bare skin mannequin body with NO clothing NO fabric NO garments NO outfit NO shoes, ' +
  'humanoid template proportions, clean neck stump ending at the shoulders, ' +
  'strict T-pose: BOTH arms fully extended horizontally straight out to the left and right at shoulder height, ' +
  'hands far from the torso, palms down, NOT crossed arms, NOT folded arms, NOT arms in front of chest, ' +
  'NOT arms down, NOT A-pose, NOT hands on hips, ' +
  'legs in a wide open stance with feet wider than shoulder-width, ' +
  'clear air gap between the thighs calves and knees, left and right legs must not touch';

/** Extra positive cues for models that ignore short bans (also mirrored in negative prompt). */
const HEADLESS_BODY_ANTI_FRAGMENT =
  'avoid: head, face, hair, crossed arms, folded arms, hugging pose, arms across chest, ' +
  'A-pose, arms at sides, clothing, outfit, shoes';

/** Krea / diffusers negative_prompt for neck-open Body+Cloth bodies. */
export const HEADLESS_BODY_NEGATIVE_PROMPT =
  'head, face, skull, hair, ears, eyes, nose, mouth, lips, chin, jaw, neck up, portrait, bust, ' +
  'crossed arms, folded arms, arms across chest, hugging pose, hands on hips, A-pose, arms at sides, ' +
  'clothing, outfit, fabric, garments, shoes, boots, hat, helmet, accessories';

/**
 * Body+Cloth Krea subject: physique comes from the character concept; clothing is fan-out only.
 * @param {string} characterConcept
 * @param {''|'male'|'female'} [gender]
 */
export function buildHeadlessBodySubjectPrompt(characterConcept, gender = '') {
  const g = normalizeCharacterGender(gender);
  const genderLead =
    g === 'male'
      ? 'adult male neck-open humanoid mannequin body'
      : g === 'female'
        ? 'adult female neck-open humanoid mannequin body'
        : 'bare neck-open humanoid mannequin body';
  const concept = String(characterConcept || '').trim();
  if (!concept) {
    return `${genderLead} for compositing`;
  }
  return (
    `${genderLead} for compositing, physique and proportions inspired by: ${concept}, ` +
    'render NO clothing NO fabric NO garments NO outfit NO shoes on the body — all garments are added separately in Appearance slots'
  );
}

/** Single garment / accessory product shot for Appearance slots. */
const ISOLATED_GARMENT_FRAGMENT =
  'single isolated garment or accessory only, product shot on plain background, ' +
  'no person wearing it, no full human body, no head, no face';

/**
 * Worn clothing on a T-pose mannequin — required for Chest/Legs/Hands/Shoes/Waist
 * so appearance_component can align mesh pose to appearance_base bones.
 * Stance is deliberately wider than a closed T-pose so left/right limbs do not weld
 * (critical for boots, greaves, and thick body compositions).
 */
const WORN_TPOSE_GARMENT_FRAGMENT =
  'garment worn on a featureless T-pose mannequin, arms extended horizontally to the sides, ' +
  'legs straight in a wide open stance with feet planted wider than the hips and wider than shoulder-width, ' +
  'large clear air gap between the thighs calves and knees, left and right legs must not touch at any point, ' +
  'feet not touching, mannequin facing camera, garment correctly fitted and sized to the mannequin, ' +
  'no face details, no hair, neutral grey mannequin';

/** Extra worn-mannequin cues when Hands need finger topology for TRELLIS. */
export const TPOSE_HAND_ORIENTATION_FRAGMENT =
  'standard T-pose hand orientation matching humanoid bone bind: ' +
  'palms facing straight down toward the floor, thumbs pointing forward toward the camera, ' +
  'NOT palms facing forward, NOT palms facing the camera, NOT thumbs pointing up, NOT a thumbs-up pose';

const WORN_HANDS_FINGER_FRAGMENT =
  `${TPOSE_HAND_ORIENTATION_FRAGMENT}, ` +
  'hands with fingers clearly separated, visible gaps between thumb index and middle fingers, ' +
  'distinct individual fingers not a fused blob; for mittens a separate thumb pouch with fused finger shell is OK';

/** Body compositions that need an extra-wide stance for skin-weight separation. */
export const WIDE_LEG_STANCE_BODY_COMPOSITIONS = Object.freeze(
  new Set(['fat', 'chubby', 'plus_size', 'stocky', 'curvy', 'muscular']),
);

const GENDER_FRAGMENTS = Object.freeze({
  male: 'male presentation, masculine proportions',
  female: 'female presentation, feminine proportions',
});

/** Strong mannequin gender cues for neck-open Body+Cloth (no face — silhouette must carry gender). */
const HEADLESS_MANNEQUIN_GENDER_FRAGMENTS = Object.freeze({
  male:
    'adult male mannequin body, masculine proportions, broad shoulders, narrow hips, flat chest, ' +
    'male torso silhouette, NOT female, NOT feminine, NOT breasts, NOT woman',
  female:
    'adult female mannequin body, feminine proportions, female torso silhouette, ' +
    'NOT male, NOT masculine, NOT man',
});

const MANNEQUIN_GENDER_FRAGMENTS = Object.freeze({
  male: 'male mannequin proportions',
  female: 'female mannequin proportions',
});

const ETHNICITY_FRAGMENTS = Object.freeze({
  asian: 'East Asian or Southeast Asian facial features',
  black: 'Black or African facial features',
  white: 'White or Caucasian facial features',
  middle_eastern: 'Middle Eastern facial features',
});

const BODY_COMPOSITION_FRAGMENTS = Object.freeze({
  skinny: 'skinny body composition, very thin frame, low body fat, narrow waist and limbs',
  slim: 'slim body composition, lean slender build',
  athletic: 'athletic body composition, toned muscle, fit sporty physique',
  muscular: 'muscular body composition, heavily muscled defined physique',
  curvy: 'curvy body composition, soft hourglass silhouette, fuller hips and chest',
  chubby: 'chubby body composition, soft rounded midsection and limbs',
  fat: 'fat body composition, high body fat, heavyset silhouette',
  plus_size: 'plus-size body composition, full figure, generous proportions',
  stocky: 'stocky body composition, thick solid compact build',
  lanky: 'lanky body composition, long thin limbs, narrow torso',
  petite: 'petite body composition, small delicate frame',
  average: 'average body composition, balanced everyday adult proportions',
  skeletal: 'skeletal body composition, emaciated gaunt figure, bones visible under skin',
  zombie:
    'zombie undead body composition, decaying gaunt flesh, hollow sunken features, thin rotting limbs',
});

/**
 * @param {unknown} value
 * @returns {''|'male'|'female'}
 */
export function normalizeCharacterGender(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'male' || raw === 'man' || raw === 'm') return 'male';
  if (raw === 'female' || raw === 'woman' || raw === 'f') return 'female';
  return '';
}

/**
 * @param {unknown} value
 * @returns {''|'asian'|'black'|'white'|'middle_eastern'}
 */
export function normalizeCharacterEthnicity(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (raw === 'asian' || raw === 'east_asian') return 'asian';
  if (raw === 'black' || raw === 'african') return 'black';
  if (raw === 'white' || raw === 'caucasian') return 'white';
  if (raw === 'middle_eastern' || raw === 'mideast' || raw === 'middleeast') {
    return 'middle_eastern';
  }
  return '';
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeBodyComposition(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!raw) return '';
  const aliases = {
    thin: 'skinny',
    skinny: 'skinny',
    slim: 'slim',
    slender: 'slim',
    lean: 'slim',
    athletic: 'athletic',
    fit: 'athletic',
    sporty: 'athletic',
    muscular: 'muscular',
    muscle: 'muscular',
    bodybuilder: 'muscular',
    buff: 'muscular',
    curvy: 'curvy',
    hourglass: 'curvy',
    chubby: 'chubby',
    soft: 'chubby',
    fat: 'fat',
    obese: 'fat',
    heavyset: 'fat',
    plus_size: 'plus_size',
    plussize: 'plus_size',
    stocky: 'stocky',
    thick: 'stocky',
    lanky: 'lanky',
    gangly: 'lanky',
    petite: 'petite',
    average: 'average',
    medium: 'average',
    normal: 'average',
    skeletal: 'skeletal',
    emaciated: 'skeletal',
    gaunt: 'skeletal',
    zombie: 'zombie',
    undead: 'zombie',
    rotting: 'zombie',
  };
  const id = aliases[raw] || raw;
  return BODY_COMPOSITION_IDS.has(id) ? id : '';
}

/**
 * Extra stance cues for Legs / Shoes / Body so left and right limbs never touch
 * (merged knees/ankles break skin-weight segmentation).
 * Shoes keep footwear language; Legs/Body insist on bare feet so pants do not grow boots.
 * @param {{ body_composition?: string, appearance_slot?: string }} [opts]
 * @returns {string}
 */
export function wornLegStanceFragment(opts = {}) {
  const composition = normalizeBodyComposition(opts.body_composition);
  const wide = WIDE_LEG_STANCE_BODY_COMPOSITIONS.has(composition);
  const slot = String(opts.appearance_slot || '').trim();
  const footwearSlot = slot === 'Shoes';

  if (footwearSlot) {
    if (wide) {
      return (
        'extra-wide straddle stance for a thick heavyset body, ' +
        'feet planted about 1.5 to 2× shoulder-width apart, ' +
        'very large clear air gap between the thighs calves knees and any boots or greaves, ' +
        'left and right footwear plates must not touch or overlap at the knees or ankles, ' +
        'NOT a narrow stance, NOT feet together, NOT knees touching'
      );
    }
    return (
      'wide footwear stance for clean left/right mesh separation, ' +
      'feet planted about 1.25 to 1.5× shoulder-width apart, ' +
      'clear visible air gap between the thighs calves and knees, ' +
      'left and right shoes or boots must not touch or overlap at the knees shins or ankles, ' +
      'each boot independently readable for 3D skin-weight segmentation, ' +
      'NOT feet together, NOT a closed narrow stance, NOT knees touching'
    );
  }

  if (wide) {
    return (
      'extra-wide straddle stance for a thick heavyset body, ' +
      'bare mannequin feet planted about 1.5 to 2× shoulder-width apart, ' +
      'very large clear air gap between the thighs calves and knees, ' +
      'NO shoes, NO boots, NO sneakers, NO footwear attached to the garment, ' +
      'NOT a narrow stance, NOT feet together, NOT knees touching'
    );
  }
  return (
    'wide open stance for clean left/right mesh separation, ' +
    'bare mannequin feet planted about 1.25 to 1.5× shoulder-width apart, ' +
    'clear visible air gap between the thighs calves and knees, ' +
    'NO shoes, NO boots, NO sneakers, NO footwear — garment ends at the hem with bare ankles, ' +
    'NOT feet together, NOT a closed narrow stance, NOT knees touching'
  );
}

/**
 * @param {unknown} value
 * @param {{ min?: number, max?: number }} [range]
 * @returns {number|null}
 */
export function normalizeBodyMetricNumber(value, range = {}) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  const min = range.min ?? 0;
  const max = range.max ?? Number.POSITIVE_INFINITY;
  if (n < min || n > max) return null;
  return Math.round(n * 10) / 10;
}

/** @param {number} cm */
export function cmToFeetInches(cm) {
  let totalIn = Math.round(cm / 2.54);
  let feet = Math.floor(totalIn / 12);
  let inches = totalIn - feet * 12;
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

/** @param {number} feet @param {number} inches */
export function feetInchesToCm(feet, inches) {
  return Math.round((Number(feet) * 12 + Number(inches)) * 2.54 * 10) / 10;
}

/** @param {number} kg */
export function kgToLb(kg) {
  return Math.round(kg * 2.20462 * 10) / 10;
}

/** @param {number} lb */
export function lbToKg(lb) {
  return Math.round((lb / 2.20462) * 10) / 10;
}

/**
 * Parse a weight field draft into kg only when the value is in the accepted range.
 * Incomplete drafts (e.g. typing "1" while aiming for 180 lb) return committed:false
 * so the UI can keep the draft without wiping via normalizeBodyMetricNumber(min:20).
 *
 * @param {string} raw
 * @param {'kg'|'lb'} unit
 * @returns {{ kg: number|null, committed: boolean }}
 */
export function commitBodyWeightInput(raw, unit = 'kg') {
  const text = String(raw ?? '').trim();
  if (!text) return { kg: null, committed: true };
  const n = Number(text);
  if (!Number.isFinite(n)) return { kg: null, committed: false };
  const kg = unit === 'lb' ? lbToKg(n) : n;
  if (kg < 20 || kg > 400) return { kg: null, committed: false };
  return { kg, committed: true };
}

/**
 * Parse height draft into cm when in range (80–280).
 * @param {{ cm?: string, feet?: string, inches?: string }} draft
 * @param {'cm'|'ft'} unit
 * @returns {{ cm: number|null, committed: boolean }}
 */
export function commitBodyHeightInput(draft, unit = 'cm') {
  if (unit === 'cm') {
    const text = String(draft?.cm ?? '').trim();
    if (!text) return { cm: null, committed: true };
    const n = Number(text);
    if (!Number.isFinite(n)) return { cm: null, committed: false };
    if (n < 80 || n > 280) return { cm: null, committed: false };
    return { cm: Math.round(n * 10) / 10, committed: true };
  }
  const feetText = String(draft?.feet ?? '').trim();
  const inchesText = String(draft?.inches ?? '').trim();
  if (!feetText && !inchesText) return { cm: null, committed: true };
  const feet = feetText === '' ? 0 : Number(feetText);
  const inches = inchesText === '' ? 0 : Number(inchesText);
  if (!Number.isFinite(feet) || !Number.isFinite(inches)) {
    return { cm: null, committed: false };
  }
  // Wait until feet is entered before committing (inches-only is incomplete).
  if (feetText === '') return { cm: null, committed: false };
  const cm = feetInchesToCm(feet, inches);
  if (cm < 80 || cm > 280) return { cm: null, committed: false };
  return { cm, committed: true };
}

/**
 * Prompt fragments for height / weight / composition (humanoid body path).
 * @param {object} opts - already normalized
 * @returns {string[]}
 */
export function buildBodyPhysiquePromptParts(opts) {
  const parts = [];
  const composition = opts.body_composition;
  if (composition && BODY_COMPOSITION_FRAGMENTS[composition]) {
    parts.push(BODY_COMPOSITION_FRAGMENTS[composition]);
  }
  if (typeof opts.body_height_cm === 'number') {
    const { feet, inches } = cmToFeetInches(opts.body_height_cm);
    parts.push(
      `approximately ${Math.round(opts.body_height_cm)} cm tall (${feet}'${inches}")`,
    );
  }
  if (typeof opts.body_weight_kg === 'number') {
    parts.push(
      `approximately ${Math.round(opts.body_weight_kg)} kg body weight (${kgToLb(opts.body_weight_kg)} lb)`,
    );
  }
  return parts;
}

/**
 * Ensures pose presets do not conflict (T/A-pose vs creature rig helpers).
 * @param {object|null|undefined} options
 * @returns {object}
 */
export function normalizeTextToImagePromptOptions(options) {
  const opts = { ...DEFAULT_TEXT_TO_IMAGE_PROMPT_OPTIONS, ...(options || {}) };
  opts.creature_rig_ready = Boolean(opts.creature_rig_ready);
  opts.head_forward = Boolean(opts.head_forward);
  opts.tail_clear = Boolean(opts.tail_clear);
  opts.standing_pose = Boolean(opts.standing_pose);
  opts.mouth_open = Boolean(opts.mouth_open);
  opts.headless_body = Boolean(opts.headless_body);
  opts.isolated_garment = Boolean(opts.isolated_garment);
  opts.worn_tpose_garment = Boolean(opts.worn_tpose_garment);
  opts.character_gender = normalizeCharacterGender(opts.character_gender);
  opts.character_ethnicity = normalizeCharacterEthnicity(opts.character_ethnicity);
  opts.body_composition = normalizeBodyComposition(opts.body_composition);
  opts.body_height_cm = normalizeBodyMetricNumber(opts.body_height_cm, {
    min: 80,
    max: 280,
  });
  opts.body_weight_kg = normalizeBodyMetricNumber(opts.body_weight_kg, {
    min: 20,
    max: 400,
  });
  opts.head_track = normalizeHeadTrack(opts.head_track);
  opts.likeness_source = normalizeLikenessSource(opts.likeness_source);
  opts.skin_tone_phrase = String(opts.skin_tone_phrase || '').trim();
  const hexRaw = String(opts.skin_tone_hex || '').trim().toLowerCase();
  opts.skin_tone_hex = /^#[0-9a-f]{6}$/.test(hexRaw) ? hexRaw : '';

  if (opts.worn_tpose_garment) {
    opts.isolated_garment = false;
    opts.headless_body = false;
    opts.creature_rig_ready = false;
    opts.full_body = true;
    opts.t_pose = true;
    opts.a_pose = false;
    opts.head_forward = false;
    opts.tail_clear = false;
    opts.standing_pose = false;
    if (!opts.camera_view) {
      opts.camera_view = 'front';
    }
  } else if (opts.isolated_garment) {
    opts.headless_body = false;
    opts.creature_rig_ready = false;
    opts.full_body = false;
    opts.t_pose = false;
    opts.a_pose = false;
    opts.head_forward = false;
    opts.tail_clear = false;
    opts.standing_pose = false;
  } else if (opts.headless_body) {
    opts.isolated_garment = false;
    opts.creature_rig_ready = false;
    opts.full_body = true;
    opts.t_pose = true;
    opts.a_pose = false;
    opts.head_forward = false;
    opts.tail_clear = false;
    opts.standing_pose = false;
    if (!opts.camera_view) {
      opts.camera_view = 'front';
    }
  } else if (opts.creature_rig_ready) {
    // Humanoid arm poses fight quadruped silhouette — force off.
    opts.t_pose = false;
    opts.a_pose = false;
    opts.head_forward = true;
    opts.tail_clear = true;
    opts.standing_pose = true;
    opts.full_body = true;
    // Creature path: gender / ethnicity / physique / humanoid head track are N/A.
    opts.character_gender = '';
    opts.character_ethnicity = '';
    opts.body_composition = '';
    opts.body_height_cm = null;
    opts.body_weight_kg = null;
    opts.head_track = HEAD_TRACK.MESHMONK;
    if (!opts.camera_view) {
      opts.camera_view = 'side_left';
    }
  } else if (opts.t_pose && opts.a_pose) {
    opts.a_pose = false;
  }

  opts.all_orthographic_views = Boolean(opts.all_orthographic_views);
  if (opts.all_orthographic_views && !opts.camera_view) {
    opts.camera_view = 'front';
  }
  return opts;
}

/**
 * @param {string} basePrompt
 * @param {object|null|undefined} options
 * @param {{ forMultiviewSet?: boolean }} [extra]
 * @returns {string}
 */
export function buildTextToImagePrompt(basePrompt, options, extra = {}) {
  const opts = normalizeTextToImagePromptOptions(options);
  const subject = opts.headless_body
    ? buildHeadlessBodySubjectPrompt(basePrompt, opts.character_gender)
    : String(basePrompt || '').trim();
  if (!subject) return '';

  const parts = [subject];

  if (opts.character_gender && GENDER_FRAGMENTS[opts.character_gender]) {
    if (opts.headless_body) {
      parts.push(HEADLESS_MANNEQUIN_GENDER_FRAGMENTS[opts.character_gender]);
    } else if (opts.worn_tpose_garment) {
      parts.push(MANNEQUIN_GENDER_FRAGMENTS[opts.character_gender]);
    } else if (!opts.isolated_garment) {
      parts.push(GENDER_FRAGMENTS[opts.character_gender]);
    }
  }
  if (
    opts.character_ethnicity &&
    ETHNICITY_FRAGMENTS[opts.character_ethnicity] &&
    !opts.isolated_garment &&
    !opts.worn_tpose_garment
  ) {
    parts.push(ETHNICITY_FRAGMENTS[opts.character_ethnicity]);
  }
  if (
    opts.skin_tone_phrase &&
    !opts.isolated_garment &&
    !opts.worn_tpose_garment
  ) {
    parts.push(opts.skin_tone_phrase);
  }
  // Physique (composition / height / weight) — body + neck-open + worn mannequin; not isolated garments.
  if (!opts.isolated_garment && !opts.creature_rig_ready) {
    parts.push(...buildBodyPhysiquePromptParts(opts));
  }

  if (opts.worn_tpose_garment) {
    parts.push(WORN_TPOSE_GARMENT_FRAGMENT);
    const slot = String(opts.appearance_slot || '');
    if (slot === 'Hands') {
      parts.push(WORN_HANDS_FINGER_FRAGMENT);
    } else if (slot === 'Shoes' || slot === 'Legs' || slot === 'Body') {
      parts.push(
        wornLegStanceFragment({
          ...opts,
          appearance_slot: slot || opts.appearance_slot,
        }),
      );
    }
  } else if (opts.headless_body) {
    parts.push(HEADLESS_BODY_FRAGMENT);
    parts.push(HEADLESS_BODY_ANTI_FRAGMENT);
    parts.push(TPOSE_HAND_ORIENTATION_FRAGMENT);
    parts.push(
      wornLegStanceFragment({
        ...opts,
        appearance_slot: opts.appearance_slot || 'Body',
      }),
    );
  } else if (opts.isolated_garment) {
    parts.push(ISOLATED_GARMENT_FRAGMENT);
  } else if (opts.full_body) {
    parts.push('full body shot, head to toe visible');
  }
  if (opts.creature_rig_ready) {
    parts.push(CREATURE_RIG_READY_FRAGMENT);
  } else if (opts.worn_tpose_garment) {
    // Fragment already includes T-pose wording; skip duplicate T_POSE_FRAGMENT.
  } else if (opts.t_pose) {
    parts.push(T_POSE_FRAGMENT);
  } else if (opts.a_pose) {
    parts.push(A_POSE_FRAGMENT);
  }
  if (opts.standing_pose) {
    parts.push(STANDING_POSE_FRAGMENT);
  }
  if (opts.head_forward) {
    parts.push(HEAD_FORWARD_FRAGMENT);
  }
  if (opts.tail_clear) {
    parts.push(TAIL_CLEAR_FRAGMENT);
  }
  // Face cue — skip neck-open / garment / mannequin paths (no usable face).
  if (
    opts.mouth_open &&
    !opts.headless_body &&
    !opts.isolated_garment &&
    !opts.worn_tpose_garment
  ) {
    parts.push(MOUTH_OPEN_FRAGMENT);
  }
  if (opts.remove_background) {
    parts.push('plain white background, isolated subject, no scenery');
  }
  if (extra.forMultiviewSet || opts.all_orthographic_views) {
    parts.push(MULTIVIEW_CONSISTENCY_FRAGMENT);
  }
  const viewFrag = VIEW_PROMPT_FRAGMENTS[opts.camera_view];
  if (viewFrag) {
    parts.push(viewFrag);
  }

  return parts.join(', ');
}

/**
 * Optional negative prompt for Krea when headless_body is set (passed via model_parameters).
 * @param {object|null|undefined} options
 * @returns {string}
 */
export function buildTextToImageNegativePrompt(options) {
  const opts = normalizeTextToImagePromptOptions(options);
  if (opts.headless_body) {
    return HEADLESS_BODY_NEGATIVE_PROMPT;
  }
  return '';
}

/**
 * Build one composed prompt per orthographic view (same subject + modifiers, different camera).
 * @param {string} basePrompt
 * @param {object|null|undefined} options
 * @returns {{ viewId: string, label: string, prompt: string }[]}
 */
export function buildOrthographicMultiviewPrompts(basePrompt, options) {
  const baseOpts = normalizeTextToImagePromptOptions(options);
  return STUDIO_ORTHOGRAPHIC_VIEW_IDS.map((viewId) => {
    const label =
      TEXT_TO_IMAGE_VIEW_OPTIONS.find((v) => v.id === viewId)?.label || viewId;
    return {
      viewId,
      label,
      prompt: buildTextToImagePrompt(
        basePrompt,
        { ...baseOpts, camera_view: viewId, all_orthographic_views: true },
        { forMultiviewSet: true },
      ),
    };
  });
}

/**
 * @param {string} basePrompt
 * @param {object|null|undefined} options
 * @returns {string|null}
 */
export function previewTextToImagePrompt(basePrompt, options) {
  const opts = normalizeTextToImagePromptOptions(options);
  if (opts.all_orthographic_views) {
    const views = buildOrthographicMultiviewPrompts(basePrompt, opts);
    if (!views.length || !views[0].prompt) return null;
    return `6 views (same seed): ${views.map((v) => v.viewId).join(', ')} — e.g. ${views[0].prompt}`;
  }
  const built = buildTextToImagePrompt(basePrompt, opts);
  const subject = String(basePrompt || '').trim();
  if (!subject || built === subject) return null;
  return built;
}

/**
 * Shared RNG seed for a multiview batch (identity lock across camera angles).
 * @returns {number}
 */
export function createMultiviewSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}
