/**
 * WebXR Expression Tracking / native face bridge → VRM expressions.
 * Feature descriptor: "expression-tracking" per WebXR Expression Tracking draft
 * (@see https://github.com/immersive-web/webxr-face-tracking-1 — index.bs).
 *
 * Weights use draft XRExpression-style keys (e.g. jaw_drop, eyes_closed_left). When the VRM
 * defines matching expression names (custom or preset), we drive them directly so each blend
 * can move independently. **`mouth_left` / `mouth_right`** also try common **`MouthSnare*`** names, and jaw openness is merged in so snare morphs open with the jaw when trackers under-report lateral mouth keys. Preset visemes (aa / ee / oh / …) are filled only when those shapes
 * exist and were not already targeted by a direct name match.
 *
 * **Neutral = first tracked snapshot:** the first non-empty weight record defines “zero” for each
 * channel (your relaxed headset pose). Later frames use deltas from that snapshot. Call
 * `resetFaceExpressionNeutralBaseline()` to capture again (e.g. after reload or when you re-relax).
 * **Mirror (lateral):** all `_left` / `_right` channel pairs are swapped so the avatar matches a
 * mirror view of your face (your left → model right). Toggle {@link MIRROR_FACE_TRACKING_LATERAL}.
 * Inner/outer brow raiser channels use tracker polarity as-is (raise → higher weight after neutral delta).
 * Jaw-sideways damp is **skipped** when openness exceeds [JAW_SIDEWAYS_OFF_WHEN_MOUTH_OPEN], or when strong sideways + modest jaw ([JAW_SIDEWAYS_OPEN_COMBO_*]) so open-mouth shrugs are not read as closed. When damp applies (mouth closed), **jaw_sideways_*** get [JAW_SIDEWAYS_CLOSED_MOUTH_GAIN]. Lip-tight “seal” only above a threshold.
 * Angry snarl without real jaw openness damps heuristic **aa** so closed angry is not read as open mouth; real jaw still wins.
 * Lip pucker / funneler dominance pulls down false jaw / lips_toward so the mouth stays **closed** for forward lips (not wide-open **aa**). **Purse hold** (lip tightener + pressor, jaw not clearly open) does the same when pucker is weak but forward lips still bleed into jaw / preset oh/ou.
 * Preset **oh** / **ou** are **not** driven by pucker average (pucker uses fine-grained shapes); **oh** stays jaw + lips_toward + stretch for real “O”.
 * Closed-lip smile bleeds less into **aa** / **ee** / **ih** when pressors / seal indicate the mouth is together.
 * **Lip sync:** {@link setXRDriverLipSyncVisemeOverride} merges A/E/I/O/U-style visemes when face tracking is active; {@link isFaceExpressionDriverFresh} lets LipSync skip double-writing.
 * **Bilabial / lip seal (OVR `pp` — p/b/m, “bb pp mm”):** {@link computeBilabialMouthClosureDominance} combines audio `pp`, tracked {@link inferConsonantVisemes} `pp`, and press/tight/pucker seal cues. When high, **vowel visemes** (aa/ee/ih/oh/ou) are crushed so closed lips win over open-mouth tracking or vowel lip-sync; **ff/th/dd/kk/ch/ss** attenuate under bilabial lead (not **nn** / **rr**). **oh/ou** get **rounded purse relief** when pucker+seal indicate a forward “O” purse. **pp** is boosted from dominance so the bilabial shape leads.
 * **Tuning baseline:** `docs/FACE_EXPRESSION_TUNING_REFERENCE.md`
 * Eye / lid / cheek / nose gains are modest; **brow raisers** use a dedicated gain (higher than **brow lowerer**).
 * **Inner/outer brow raisers** use dedicated gains + inner depth curve; **`browInnerUp` / `browOuterUp`** fill from matching channels only; **lookUp** is gaze-only (`eyes_look_up_*`); emotion presets are attenuated when brow morphs map directly; **upper lid** / **cheek puff** tuned separately.
 * When the VRM has both blinkLeft and blinkRight, eyes_closed_left/right drive them independently
 * (unified blink is skipped); contralateral blink bleed is stripped in preprocess.
 * Emotion presets (happy / sad / angry / surprised) are inferred from FACS-style combinations;
 * strength is reduced if the same cues already map to finer-grained expression names.
 *
 * Gaze: WebXR `eyes_look_*` keys feed VRM lookUp / lookDown / lookLeft / lookRight (per-eye max plus
 * same-eye diagonal magnitude so up-left / down-right etc. register). Look preset fill merges with
 * any direct expression binds via max so consolidated morphs still get diagonal boost.
 * **Blink:** weak contralateral `eyes_closed_*` is zeroed when the other eye dominates (reduces wink bleed).
 */

import { VRMExpressionPresetName } from '@pixiv/three-vrm';

/** Optional feature requested on immersive VR/AR sessions. */
export const XR_EXPRESSION_TRACKING_FEATURE = 'expression-tracking';

/**
 * Swap tracked **left** ↔ **right** channels so expressions match a mirror view of the user.
 * Set `false` only for debugging / regression against unmirrored tracker layout.
 */
export const MIRROR_FACE_TRACKING_LATERAL = true;

/** All XRExpression enum strings from the draft (subset used for weighted reads). */
const XRE_KEYS = Object.freeze([
  'brow_lowerer_left',
  'brow_lowerer_right',
  'cheek_puff_left',
  'cheek_puff_right',
  'cheek_raiser_left',
  'cheek_raiser_right',
  'cheek_suck_left',
  'cheek_suck_right',
  'chin_raiser_bottom',
  'chin_raiser_top',
  'dimpler_left',
  'dimpler_right',
  'eyes_closed_left',
  'eyes_closed_right',
  'eyes_look_down_left',
  'eyes_look_down_right',
  'eyes_look_left_left',
  'eyes_look_left_right',
  'eyes_look_right_left',
  'eyes_look_right_right',
  'eyes_look_up_left',
  'eyes_look_up_right',
  'inner_brow_raiser_left',
  'inner_brow_raiser_right',
  'jaw_drop',
  'jaw_sideways_left',
  'jaw_sideways_right',
  'jaw_thrust',
  'lid_tightener_left',
  'lid_tightener_right',
  'lip_corner_depressor_left',
  'lip_corner_depressor_right',
  'lip_corner_puller_left',
  'lip_corner_puller_right',
  'lip_funneler_left_bottom',
  'lip_funneler_left_top',
  'lip_funneler_right_bottom',
  'lip_funneler_right_top',
  'lip_pressor_left',
  'lip_pressor_right',
  'lip_pucker_left',
  'lip_pucker_right',
  'lip_stretcher_left',
  'lip_stretcher_right',
  'lip_suck_left_bottom',
  'lip_suck_left_top',
  'lip_suck_right_bottom',
  'lip_suck_right_top',
  'lip_tightener_left',
  'lip_tightener_right',
  'lips_toward',
  'lower_lip_depressor_left',
  'lower_lip_depressor_right',
  'mouth_left',
  'mouth_right',
  'nose_wrinkler_left',
  'nose_wrinkler_right',
  'outer_brow_raiser_left',
  'outer_brow_raiser_right',
  'upper_lid_raiser_left',
  'upper_lid_raiser_right',
  'upper_lip_raiser_left',
  'upper_lip_raiser_right',
]);

const PUSH_SKIP = new Set(['weights', 't', 'ts', 'openxrParameters']);

/** Jaw left/right often bleeds into jaw_drop / lips_toward; suppress only when mouth is not clearly open. */
const JAW_SIDEWAYS_MOUTH_GATE = 0.04;
const JAW_SIDEWAYS_MOUTH_SUPPRESS = 0.4;
/** If jaw/thrust/lips signal at least this much openness, skip sideways mouth damp entirely (shrug + open mouth). */
const JAW_SIDEWAYS_OFF_WHEN_MOUTH_OPEN = 0.095;
/**
 * Open-mouth shrug: trackers often keep jaw_drop just under [JAW_SIDEWAYS_OFF_WHEN_MOUTH_OPEN] while sideways is high.
 * If lateral jaw exceeds this and jaw/thrust exceeds [JAW_SIDEWAYS_OPEN_COMBO_JAW], skip mouth damp / shrink anyway.
 */
const JAW_SIDEWAYS_OPEN_COMBO_SIDEWAYS = 0.14;
/** Must exceed typical closed-mouth sideways bleed on jaw_drop (see sideways-shrink tests). */
const JAW_SIDEWAYS_OPEN_COMBO_JAW = 0.062;
/** When the mouth is not clearly open, scale lateral jaw keys so closed-mouth left/right shrug reads stronger. */
const JAW_SIDEWAYS_CLOSED_MOUTH_GAIN = 1.28;

/** Lip corner pullers: boost so smile reads higher on typical VRMs. @see docs/FACE_EXPRESSION_TUNING_REFERENCE.md */
const LIP_CORNER_PULLER_GAIN = 1.38;

/** Cheek puff: light gain after baseline; {@link CHEEK_PUFF_MAX} prevents pegging. */
const CHEEK_PUFF_GAIN = 1.05;
/** Post-gain ceiling so puff stays subtle on typical tracker bleed. */
const CHEEK_PUFF_MAX = 0.64;

/** Upper lid raiser (eye widen): own gain so widen reads clearly vs other periorbital keys. */
const UPPER_LID_WIDEN_GAIN = 1.42;

/** When inner/outer brow reads raised, optional tiny same-side inner nudge (kept low so depth curve owns proportion). */
const BROW_RAISE_INNER_AUX_MUL = 0;
const BROW_RAISE_INNER_AUX_MAX = 0;

/** Do not merge brow raise into lookUp — only {@link inferLookFromEyeWeights} (`eyes_look_up_*`) should drive lookUp. */
const LOOK_UP_FROM_BROW_RAISE_MUL = 0;

/** Dimpler + nose wrinkler drive “sneer” / snarl on many VRMs; boost so they track above noise. */
const SNEER_SHAPE_GAIN = 1.34;

/** Jaw openness blended into **MouthSnare**-style morphs when trackers under-report `mouth_left` / `mouth_right`. */
const MOUTH_SNARE_JAW_OPEN_COEFF = 0.9;

/** Pucker/funneler often bleeds into jaw_drop / lips_toward; pull those down only when pucker dominates and jaw is not clearly open. */
const LIP_PUCKER_SUPPRESS_OPEN_AT = 0.13;
const LIP_PUCKER_JAW_BLEED_MAX = 0.9;
const LIP_PUCKER_LIPS_TOWARD_BLEED = 0.48;
/** Jaw clearly winning over pucker → do not treat as pucker-only false bleed. */
const JAW_CLEAR_OPEN_FOR_PUCKER = 0.25;
const LIP_PUCKER_DOM_JAW_MUL = 1.35;
const LIP_PUCKER_DOM_JAW_BIAS = 0.06;

/** Closed purse / pressed lips: tightener+press composite; attenuate false open when jaw is still low. */
const PURSE_HOLD_ACTIVATE = 0.13;
const PURSE_HOLD_JAW_MAX = 0.26;
const PURSE_HOLD_JAW_ATTEN = 0.78;
const PURSE_HOLD_LIPS_TOWARD_ATTEN = 0.88;
const PURSE_HOLD_VISEME_LIPS = 0.86;
const PURSE_HOLD_VISEME_JAW = 0.52;
/** Stronger pull on lips_toward → preset oh/ou (main “open” read on pursed lips). */
const PURSE_HOLD_OH_OU_LIPS = 0.92;

/** Slight boost so lip_tightener reaches seal / purse gates on typical trackers. */
const LIP_TIGHTENER_TRACK_GAIN = 1.2;

/** Cheek/corner smile without real jaw: don’t drive wide **aa** / smile-stretch visemes like an open mouth. */
const CLOSED_SMILE_AA_SUPPRESS_AT = 0.22;
const CLOSED_SMILE_JAW_CAP_FOR_BLEED = 0.14;
const CLOSED_SMILE_PRESS_GATE = 0.07;
const CLOSED_SMILE_SEAL_GATE = 0.12;
const CLOSED_SMILE_AA_BLEED_MAX = 0.78;
const CLOSED_SMILE_STRETCH_BLEED = 0.38;

/** After baseline removal, damp viseme “open mouth” (aa); exponent > 1 keeps small openings smaller. */
const AA_JAW_COEFF = 0.58;
const AA_LIPS_TOWARD_COEFF = 0.11;
const AA_UPPER_LIP_COEFF = 0.07;
const AA_OPEN_EXPONENT = 1.22;

/** Lip tighteners as “seal”; only strong values pull jaw/lips down (resting noise ignored). */
const LIP_SEAL_ACTIVATE_ABOVE = 0.15;
const LIP_SEAL_STRENGTH = 0.42;
const MOUTH_SEAL_JAW_SUPPRESS = 0.38;

/** Gaze channels: boost so look presets track diagonals and headset FACS. */
const EYE_LOOK_GAIN = 1.36;

/** Same-eye diagonal (e.g. up+left) feeds both axis magnitudes; scales hypot to 0..1. */
const LOOK_DIAGONAL_BLEND = 0.94;

/** Brow furrow / lowerer — modest boost (separate from raisers). */
const BROW_LOWERER_GAIN = 1.38;

/** Shared pre-curve gain for inner/outer brow raiser deltas (after neutral subtract). */
const BROW_RAISER_TRACK_GAIN = 1.48;

/** **Outer** brow raiser post-gain (linear — tracks raise depth faithfully). */
const OUTER_BROW_RAISER_TRACK_GAIN = 1.52;

/** **Inner** brow: light scale + ~linear curve so raise depth correlates with blend weight. */
const INNER_BROW_RAISER_DEPTH_SCALE = 0.82;
const INNER_BROW_RAISER_RESPONSE_EXP = 1.0;

/** **browInnerUp** / **browOuterUp** consolidated morphs: near-unity (channel values already curved). */
const BROW_INNER_UP_EXPR_GAIN = 1.0;
const BROW_OUTER_UP_EXPR_GAIN = 1.0;

/** Periorbital (lid tightener, upper lid, cheek raiser, nose) — modest boost. */
const PERIORBIT_GAIN = 1.16;

/** Blinks: unity gain after neutral delta (contralateral bleed is stripped separately). */
const EYE_CLOSED_GAIN = 1.0;

/** Keys that get EYE_LOOK_GAIN (all WebXR draft gaze weights). */
const EYE_LOOK_GAIN_KEYS = new Set([
  'eyes_look_up_left',
  'eyes_look_up_right',
  'eyes_look_down_left',
  'eyes_look_down_right',
  'eyes_look_left_left',
  'eyes_look_left_right',
  'eyes_look_right_left',
  'eyes_look_right_right',
]);

const EYE_CLOSED_GAIN_KEYS = new Set(['eyes_closed_left', 'eyes_closed_right']);

/** Lid tightener, cheek raiser, nose (upper lid uses {@link UPPER_LID_WIDEN_GAIN} separately). */
const EYE_BROW_GAIN_KEYS = new Set([
  'lid_tightener_left',
  'lid_tightener_right',
  'cheek_raiser_left',
  'cheek_raiser_right',
  'nose_wrinkler_left',
  'nose_wrinkler_right',
]);

/** Dominant-eye blink; zero weak side only when it is small (avoids killing deliberate asymmetry). */
const BLINK_CONTRA_MIN_DOMINANT = 0.11;
/** Easier to treat weak side as bleed when opposite eye winks (keeps non‑blinking eye open). */
const BLINK_CONTRA_SUPPRESS_RATIO = 0.46;
const BLINK_CONTRA_WEAK_CAP = 0.22;

/** Mouth openness inputs: resting neutral often biases these > 0. */
const MOUTH_BASELINE_KEYS = new Set(['jaw_drop', 'jaw_thrust', 'lips_toward']);

/**
 * Captured relaxed pose per channel (null = not yet captured — first non-empty preprocess fills it).
 * @type {Record<string, number> | null}
 */
let faceNeutralBaseline = null;

/** Normalized weight key → extra normalized expression-name candidates (Vroid / FCL / etc.). */
const WEIGHT_KEY_EXTRA_NORM = {
  eyesclosedleft: ['blinkleft', 'eyeblinkl', 'leftblink', 'fclipblinkl'],
  eyesclosedright: ['blinkright', 'eyeblinkr', 'rightblink', 'fclipblinkr'],
  eyeslookleftleft: ['lookleft'],
  eyeslookleftright: ['lookleft'],
  eyeslookrightleft: ['lookright'],
  eyeslookrightright: ['lookright'],
  eyeslookupleft: ['lookup'],
  eyeslookupright: ['lookup'],
  eyeslookdownleft: ['lookdown'],
  eyeslookdownright: ['lookdown'],
  /** Many VRMs label lateral mouth / snarl shapes `MouthSnareLeft` (not `mouth_left`). */
  mouthleft: [
    'mouthsnareleft',
    'mouth_snare_l',
    'mouth_snare_left',
    'mouthsnarel',
    'mouthleftsnare',
    'mouthsnare_l',
  ],
  mouthright: [
    'mouthsnareright',
    'mouth_snare_r',
    'mouth_snare_right',
    'mouthsnarer',
    'mouthrightsnare',
    'mouthsnare_r',
  ],
  /** Many rigs name the inner-brow-up shape `browInnerUp` / `Brow_Inner_Up` (normalized: browinnerup). */
  innerbrowraiserleft: ['browinnerup', 'browinnerupl', 'browinnerupleft'],
  innerbrowraiserright: ['browinnerup', 'browinnerupr', 'browinnerupright'],
  outerbrowraiserleft: ['browouterup', 'browouterupl', 'browouterupleft'],
  outerbrowraiserright: ['browouterup', 'browouterupr', 'browouterupright'],
};

/**
 * OVR-Lip-Sync style consonant visemes. VRM has no built-in preset enum for these;
 * we detect them as **custom expressions** when present and fill them from FACS
 * weights ({@link inferConsonantVisemes}).
 *
 * Each entry: canonical slug → list of common alternative naming conventions seen
 * across exporters (OVR, ARKit-derived viseme rigs, VRChat `vrc.v_*`, FCL `fcl_phn_*`,
 * Synthesizer-V “v_*”, etc.). Names are normalized via {@link normalizeExprKey}
 * (lowercase, no separators).
 *
 * @see https://developer.oculus.com/documentation/unity/audio-ovrlipsync-viseme-reference/
 */
const CONSONANT_VISEME_KEYS = Object.freeze([
  'sil',
  'pp',
  'ff',
  'th',
  'dd',
  'kk',
  'ch',
  'ss',
  'nn',
  'rr',
]);

/** Normalized canonical viseme slug → extra normalized expression-name aliases. */
const CONSONANT_VISEME_NAME_ALIASES = Object.freeze({
  sil: ['silence', 'vsil', 'vrcvsil', 'fclphnsil', 'visemesil', 'viseme_sil'],
  pp: ['vpp', 'pb', 'pbm', 'mbp', 'vrcvpp', 'fclphnpp', 'visemepp', 'viseme_pp', 'pp_pb_m', 'PP'],
  ff: ['vff', 'fv', 'vrcvff', 'fclphnff', 'visemeff', 'viseme_ff', 'FF'],
  th: ['vth', 'vrcvth', 'fclphnth', 'visemeth', 'viseme_th', 'TH'],
  dd: ['vdd', 'dt', 'dtl', 'vrcvdd', 'fclphndd', 'visemedd', 'viseme_dd', 'DD'],
  kk: ['vkk', 'kg', 'cg', 'vrcvkk', 'fclphnkk', 'visemekk', 'viseme_kk', 'KK'],
  ch: ['vch', 'shchj', 'chshj', 'vrcvch', 'fclphnch', 'visemech', 'viseme_ch', 'CH'],
  ss: ['vss', 'sz', 'vrcvss', 'fclphnss', 'visemess', 'viseme_ss', 'SS'],
  nn: ['vnn', 'nng', 'vrcvnn', 'fclphnnn', 'visemenn', 'viseme_nn', 'NN'],
  rr: ['vrr', 'vrcvrr', 'fclphnrr', 'visemerr', 'viseme_rr', 'RR'],
});

/**
 * Vowel / mouth-open visemes: VRM presets are usually `aa` / `ee` / … but imported rigs often
 * use single-letter names (`E`, `A`, …) or `Viseme_*` / `vrc.v_*` — same keys as user-listed
 * **aa, ih, oh, ou** plus **E** (mapped to preset `ee` internally).
 */
const VOWEL_VISEME_NAME_ALIASES = Object.freeze({
  aa: ['aa', 'ah', 'a', 'Aa', 'AA', 'A', 'Viseme_aa', 'Viseme_AA', 'v_aa', 'vrc.v_aa', 'FCL_PHN_aa'],
  ee: [
    'ee',
    'e',
    'E',
    'Viseme_ee',
    'Viseme_E',
    'Viseme_EE',
    'v_ee',
    'v_e',
    'vrc.v_ee',
    'vrc.v_e',
    'FCL_PHN_ee',
    'FCL_PHN_e',
  ],
  ih: ['ih', 'i', 'Ih', 'IH', 'I', 'Viseme_ih', 'Viseme_I', 'v_ih', 'vrc.v_ih', 'FCL_PHN_ih'],
  oh: ['oh', 'o', 'Oh', 'OH', 'O', 'Viseme_oh', 'Viseme_O', 'v_oh', 'vrc.v_oh', 'FCL_PHN_oh'],
  ou: [
    'ou',
    'u',
    'Oo',
    'OO',
    'uu',
    'UU',
    'uw',
    'Uw',
    'UW',
    'Ou',
    'OU',
    'U',
    'Viseme_ou',
    'Viseme_U',
    'Viseme_Oo',
    'Viseme_UU',
    'v_ou',
    'v_u',
    'v_oo',
    'vrc.v_ou',
    'vrc.v_u',
    'vrc.v_oo',
    'FCL_PHN_ou',
    'FCL_PHN_u',
  ],
});

function clamp01(v) {
  const x = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** WebXR gaze: `eyes_look_<direction>_<eyeSide>` — swap eye side only, not the direction token (`left` in `eyes_look_left_left`). */
const EYES_LOOK_LATERAL_RE = /^eyes_look_(up|down|left|right)_(left|right)$/;

/**
 * Partner key for lateral mirror (`lip_funneler_left_top` ↔ `lip_funneler_right_top`, `eyes_closed_left` ↔ `eyes_closed_right`, …).
 * @param {string} key
 * @returns {string | null}
 */
function lateralMirrorPartnerKey(key) {
  if (typeof key !== 'string' || !key) return null;
  const gaze = key.match(EYES_LOOK_LATERAL_RE);
  if (gaze) {
    const dir = gaze[1];
    const side = gaze[2];
    const other = side === 'left' ? 'right' : 'left';
    return `eyes_look_${dir}_${other}`;
  }
  if (key.includes('_left_')) return key.replace('_left_', '_right_');
  if (key.includes('_right_')) return key.replace('_right_', '_left_');
  if (key.endsWith('_left')) return `${key.slice(0, -5)}_right`;
  if (key.endsWith('_right')) return `${key.slice(0, -6)}_left`;
  return null;
}

/**
 * Mirror every bilateral tracker channel (your left side → VRM right side, and vice versa).
 * @param {Record<string, number>} record
 * @returns {Record<string, number>}
 */
export function mirrorFaceWeightRecordLateral(record) {
  if (!record || typeof record !== 'object') return {};
  if (!MIRROR_FACE_TRACKING_LATERAL) return { ...record };
  /** @type {Record<string, number>} */
  const out = { ...record };
  const done = new Set();
  for (const k of Object.keys(record)) {
    if (PUSH_SKIP.has(k)) continue;
    const partner = lateralMirrorPartnerKey(k);
    if (!partner || partner === k) continue;
    const pairId = k < partner ? `${k}\0${partner}` : `${partner}\0${k}`;
    if (done.has(pairId)) continue;
    done.add(pairId);
    const a = record[k];
    const b = record[partner];
    const hasA = a !== undefined && !Number.isNaN(a);
    const hasB = b !== undefined && !Number.isNaN(b);
    if (!hasA && !hasB) continue;
    if (hasA && hasB) {
      out[k] = b;
      out[partner] = a;
    } else if (hasA) {
      out[k] = 0;
      out[partner] = a;
    } else {
      out[k] = b;
      out[partner] = 0;
    }
  }
  return out;
}

/** Trackers often report a small eyes_closed on the non-winking eye; strip when the other side dominates. */
function suppressContralateralEyeBlinkBleedInPlace(out) {
  const L = clamp01(out.eyes_closed_left ?? 0);
  const R = clamp01(out.eyes_closed_right ?? 0);
  const dom = Math.max(L, R);
  if (dom < BLINK_CONTRA_MIN_DOMINANT) return;
  if (
    R >= BLINK_CONTRA_MIN_DOMINANT &&
    L < R * BLINK_CONTRA_SUPPRESS_RATIO &&
    L <= BLINK_CONTRA_WEAK_CAP
  ) {
    out.eyes_closed_left = 0;
  }
  if (
    L >= BLINK_CONTRA_MIN_DOMINANT &&
    R < L * BLINK_CONTRA_SUPPRESS_RATIO &&
    R <= BLINK_CONTRA_WEAK_CAP
  ) {
    out.eyes_closed_right = 0;
  }
}

/** Map inner-brow raiser delta toward proportional display (tracker deltas often run hot). */
function applyInnerBrowRaiserResponseCurve(v) {
  const x = clamp01(v * INNER_BROW_RAISER_DEPTH_SCALE);
  return clamp01(Math.pow(x, INNER_BROW_RAISER_RESPONSE_EXP));
}

/** After gains, nudge inner brows when either inner/outer on that side reads raised (“brow in”). */
function applyBrowRaiseInnerAuxInPlace(out) {
  for (const side of ['left', 'right']) {
    const ik = `inner_brow_raiser_${side}`;
    const ok = `outer_brow_raiser_${side}`;
    const i = clamp01(out[ik] ?? 0);
    const o = clamp01(out[ok] ?? 0);
    const m = Math.max(i, o);
    if (m < 0.05) continue;
    const add = Math.min(BROW_RAISE_INNER_AUX_MAX, m * BROW_RAISE_INNER_AUX_MUL);
    out[ik] = clamp01(i + add);
  }
}

/**
 * Forget the relaxed snapshot so the **next** non-empty preprocess record becomes the new zero.
 */
export function resetFaceExpressionNeutralBaseline() {
  faceNeutralBaseline = null;
}

/**
 * Set the neutral snapshot explicitly (e.g. user tapped “calibrate” while holding a relaxed face).
 * Pass `{}` to treat raw 0 as neutral for every key (useful in tests).
 * @param {Record<string, number>} record
 */
export function setFaceExpressionNeutralBaselineFromRecord(record) {
  faceNeutralBaseline = {};
  if (!record || typeof record !== 'object') return;
  const mirrored = mirrorFaceWeightRecordLateral(record);
  for (const k of Object.keys(mirrored)) {
    if (PUSH_SKIP.has(k)) continue;
    const v = mirrored[k];
    let n = typeof v === 'number' ? v : Number(v);
    if (Number.isNaN(n)) continue;
    n = clamp01(n);
    faceNeutralBaseline[k] = n;
  }
}

/**
 * Deltas from captured headset neutral, then mouth heuristics and per-channel gains.
 * @param {Record<string, number>} record
 * @returns {Record<string, number>}
 */
export function preprocessFaceWeightRecord(record) {
  if (!record || typeof record !== 'object') return {};
  /** @type {Record<string, number>} */
  const out = { ...mirrorFaceWeightRecordLateral(record) };

  for (const k of Object.keys(out)) {
    if (PUSH_SKIP.has(k)) continue;
    out[k] = clamp01(out[k]);
  }

  if (faceNeutralBaseline === null) {
    const keys = Object.keys(out).filter(
      (k) => !PUSH_SKIP.has(k) && typeof out[k] === 'number' && !Number.isNaN(out[k])
    );
    if (keys.length === 0) {
      return out;
    }
    faceNeutralBaseline = {};
    for (const k of keys) {
      faceNeutralBaseline[k] = out[k];
      out[k] = 0;
    }
    return out;
  }

  for (const k of Object.keys(out)) {
    if (PUSH_SKIP.has(k)) continue;
    const n = faceNeutralBaseline[k];
    const base = typeof n === 'number' && !Number.isNaN(n) ? n : 0;
    out[k] = clamp01(out[k] - base);
  }

  for (const k of ['lip_tightener_left', 'lip_tightener_right']) {
    if (out[k] != null) out[k] = clamp01(out[k] * LIP_TIGHTENER_TRACK_GAIN);
  }

  const jawForSidewaysCombo = Math.max(out.jaw_drop ?? 0, out.jaw_thrust ?? 0);
  const mouthOpenForSideways = Math.max(jawForSidewaysCombo, (out.lips_toward ?? 0) * 0.62);
  const sideways = Math.max(out.jaw_sideways_left ?? 0, out.jaw_sideways_right ?? 0);
  const shrugWithOpenMouth =
    sideways > JAW_SIDEWAYS_OPEN_COMBO_SIDEWAYS && jawForSidewaysCombo >= JAW_SIDEWAYS_OPEN_COMBO_JAW;
  const skipSidewaysMouthDamp =
    mouthOpenForSideways >= JAW_SIDEWAYS_OFF_WHEN_MOUTH_OPEN || shrugWithOpenMouth;
  const sidewaysBlendMask = skipSidewaysMouthDamp ? 0 : clamp01(1 - mouthOpenForSideways * 0.94);

  if (sideways > JAW_SIDEWAYS_MOUTH_GATE && sidewaysBlendMask > 1e-4) {
    let damp = (sideways - JAW_SIDEWAYS_MOUTH_GATE) * JAW_SIDEWAYS_MOUTH_SUPPRESS;
    damp *= sidewaysBlendMask;
    for (const k of MOUTH_BASELINE_KEYS) {
      if (out[k] == null) continue;
      const lipScale = k === 'lips_toward' ? 0.38 : 1;
      out[k] = clamp01(Math.max(0, out[k] - damp * lipScale));
    }
  }

  if (!skipSidewaysMouthDamp && mouthOpenForSideways < JAW_SIDEWAYS_OFF_WHEN_MOUTH_OPEN) {
    for (const k of ['jaw_sideways_left', 'jaw_sideways_right']) {
      if (out[k] == null) continue;
      out[k] = clamp01(out[k] * JAW_SIDEWAYS_CLOSED_MOUTH_GAIN);
    }
  }

  const lipSeal = ((out.lip_tightener_left ?? 0) + (out.lip_tightener_right ?? 0)) / 2;
  if (lipSeal > LIP_SEAL_ACTIVATE_ABOVE) {
    const sealNorm = clamp01((lipSeal - LIP_SEAL_ACTIVATE_ABOVE) / Math.max(1e-6, 1 - LIP_SEAL_ACTIVATE_ABOVE));
    const seal = clamp01(sealNorm * LIP_SEAL_STRENGTH);
    const sealMouthOpen = Math.max(out.jaw_drop ?? 0, out.jaw_thrust ?? 0);
    const sealAtten = clamp01(1 - sealMouthOpen * 0.88);
    const effectiveSeal = seal * sealAtten;
    for (const k of MOUTH_BASELINE_KEYS) {
      if (out[k] == null) continue;
      out[k] = clamp01(out[k] * (1 - effectiveSeal * (k === 'lips_toward' ? 0.32 : 0.52)));
    }
  }

  const puckerAvgPre =
    ((out.lip_pucker_left ?? 0) +
      (out.lip_pucker_right ?? 0) +
      (out.lip_funneler_left_bottom ?? 0) +
      (out.lip_funneler_right_bottom ?? 0) +
      (out.lip_funneler_left_top ?? 0) +
      (out.lip_funneler_right_top ?? 0)) /
    6;
  const jawOpenPre = Math.max(out.jaw_drop ?? 0, out.jaw_thrust ?? 0);
  const mouthClearlyOpenVsPucker =
    jawOpenPre >= JAW_CLEAR_OPEN_FOR_PUCKER && jawOpenPre > puckerAvgPre * 1.02;
  const puckerDominatesJaw =
    puckerAvgPre >= LIP_PUCKER_SUPPRESS_OPEN_AT &&
    !mouthClearlyOpenVsPucker &&
    puckerAvgPre > jawOpenPre * LIP_PUCKER_DOM_JAW_MUL + LIP_PUCKER_DOM_JAW_BIAS;
  if (puckerDominatesJaw) {
    const blend = clamp01((puckerAvgPre - LIP_PUCKER_SUPPRESS_OPEN_AT) / (1 - LIP_PUCKER_SUPPRESS_OPEN_AT));
    const jawAtten = clamp01(1 - blend * LIP_PUCKER_JAW_BLEED_MAX);
    out.jaw_drop = clamp01((out.jaw_drop ?? 0) * jawAtten);
    out.jaw_thrust = clamp01((out.jaw_thrust ?? 0) * jawAtten);
    out.lips_toward = clamp01((out.lips_toward ?? 0) * clamp01(1 - blend * LIP_PUCKER_LIPS_TOWARD_BLEED));
  }

  const lipTightPost = ((out.lip_tightener_left ?? 0) + (out.lip_tightener_right ?? 0)) / 2;
  const pressPost = ((out.lip_pressor_left ?? 0) + (out.lip_pressor_right ?? 0)) / 2;
  const puckerPostAvg =
    ((out.lip_pucker_left ?? 0) +
      (out.lip_pucker_right ?? 0) +
      (out.lip_funneler_left_bottom ?? 0) +
      (out.lip_funneler_right_bottom ?? 0) +
      (out.lip_funneler_left_top ?? 0) +
      (out.lip_funneler_right_top ?? 0)) /
    6;
  const jawOpenPost = Math.max(out.jaw_drop ?? 0, out.jaw_thrust ?? 0);
  const mouthClearlyOpenPostPucker =
    jawOpenPost >= JAW_CLEAR_OPEN_FOR_PUCKER && jawOpenPost > puckerPostAvg * 1.02;
  const purseSig = clamp01(lipTightPost * 0.52 + pressPost * 0.48);
  const purseHold =
    purseSig >= PURSE_HOLD_ACTIVATE &&
    jawOpenPost < PURSE_HOLD_JAW_MAX &&
    !mouthClearlyOpenPostPucker;
  if (purseHold) {
    const b = clamp01((purseSig - PURSE_HOLD_ACTIVATE) / Math.max(1e-6, 1 - PURSE_HOLD_ACTIVATE));
    const jA = clamp01(1 - b * PURSE_HOLD_JAW_ATTEN);
    const ltA = clamp01(1 - b * PURSE_HOLD_LIPS_TOWARD_ATTEN);
    out.jaw_drop = clamp01((out.jaw_drop ?? 0) * jA);
    out.jaw_thrust = clamp01((out.jaw_thrust ?? 0) * jA);
    out.lips_toward = clamp01((out.lips_toward ?? 0) * ltA);
  }

  suppressContralateralEyeBlinkBleedInPlace(out);

  for (const k of Object.keys(out)) {
    if (PUSH_SKIP.has(k)) continue;
    if (EYE_LOOK_GAIN_KEYS.has(k)) {
      out[k] = clamp01(out[k] * EYE_LOOK_GAIN);
    } else if (k === 'inner_brow_raiser_left' || k === 'inner_brow_raiser_right') {
      const boosted = clamp01(out[k] * BROW_RAISER_TRACK_GAIN);
      out[k] = applyInnerBrowRaiserResponseCurve(boosted);
    } else if (k === 'outer_brow_raiser_left' || k === 'outer_brow_raiser_right') {
      out[k] = clamp01(out[k] * OUTER_BROW_RAISER_TRACK_GAIN);
    } else if (k === 'brow_lowerer_left' || k === 'brow_lowerer_right') {
      out[k] = clamp01(out[k] * BROW_LOWERER_GAIN);
    } else if (EYE_CLOSED_GAIN_KEYS.has(k)) {
      out[k] = clamp01(out[k] * EYE_CLOSED_GAIN);
    } else if (EYE_BROW_GAIN_KEYS.has(k)) {
      out[k] = clamp01(out[k] * PERIORBIT_GAIN);
    }
  }
  for (const k of ['lip_corner_puller_left', 'lip_corner_puller_right']) {
    if (out[k] == null) continue;
    out[k] = clamp01(out[k] * LIP_CORNER_PULLER_GAIN);
  }
  for (const k of ['cheek_puff_left', 'cheek_puff_right']) {
    if (out[k] == null) continue;
    out[k] = Math.min(CHEEK_PUFF_MAX, clamp01(out[k] * CHEEK_PUFF_GAIN));
  }
  for (const k of [
    'dimpler_left',
    'dimpler_right',
    'nose_wrinkler_left',
    'nose_wrinkler_right',
  ]) {
    if (out[k] == null) continue;
    out[k] = clamp01(out[k] * SNEER_SHAPE_GAIN);
  }
  for (const k of ['upper_lid_raiser_left', 'upper_lid_raiser_right']) {
    if (out[k] == null) continue;
    out[k] = clamp01(out[k] * UPPER_LID_WIDEN_GAIN);
  }
  applyBrowRaiseInnerAuxInPlace(out);
  return out;
}

/**
 * Normalize draft XRExpressions / browser-specific iterable into plain record.
 * @param {unknown} xrExpressions — XRFrame.expressions
 * @returns {Record<string, number>}
 */
export function extractExpressionRecord(xrExpressions) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!xrExpressions) return out;

  if (typeof xrExpressions.get === 'function') {
    for (const k of XRE_KEYS) {
      try {
        const v = xrExpressions.get(k);
        if (typeof v === 'number' && !Number.isNaN(v)) out[k] = v;
      } catch (_) {
        /* UA may omit keys */
      }
    }
    return out;
  }

  try {
    if (typeof xrExpressions[Symbol.iterator] === 'function') {
      for (const entry of xrExpressions) {
        if (Array.isArray(entry) && entry.length >= 2) {
          const [k, v] = entry;
          if (typeof k === 'string' && typeof v === 'number' && !Number.isNaN(v)) {
            out[k] = v;
          }
        }
      }
      return out;
    }
  } catch (_) {
    /* ignore */
  }

  return out;
}

/**
 * Infer standard VRM **preset** mouth + blink scalars when the model has no finer-grained shapes.
 * Uses preset ids from @pixiv/three-vrm v3 (`aa`, not legacy `ah`).
 */
export function inferVRMMorphTargets(weights) {
  const g = (k) => clamp01(weights[k] ?? 0);
  const ap = (a, b) => (g(a) + g(b)) / 2;

  const blink = Math.max(g('eyes_closed_left'), g('eyes_closed_right'));
  const jawRaw = Math.max(g('jaw_drop'), g('jaw_thrust'));
  const sidewaysMag = Math.max(g('jaw_sideways_left'), g('jaw_sideways_right'));
  const shrugWithOpenMouthVis =
    sidewaysMag > JAW_SIDEWAYS_OPEN_COMBO_SIDEWAYS && jawRaw >= JAW_SIDEWAYS_OPEN_COMBO_JAW;
  const skipSidewaysShrink =
    jawRaw >= JAW_SIDEWAYS_OFF_WHEN_MOUTH_OPEN || shrugWithOpenMouthVis;
  const sidewaysShrink = skipSidewaysShrink
    ? 0
    : Math.min(1, sidewaysMag * 0.88) * clamp01(1 - jawRaw * 2.15);
  const jawFromSidewaysBleed = jawRaw * (1 - sidewaysShrink);
  const lipSeal = (g('lip_tightener_left') + g('lip_tightener_right')) / 2;
  const lipPressAvg = (g('lip_pressor_left') + g('lip_pressor_right')) / 2;
  const lipSealOnJaw = lipSeal * MOUTH_SEAL_JAW_SUPPRESS * clamp01(1 - jawRaw * 0.92);
  let jaw = clamp01(jawFromSidewaysBleed * (1 - lipSealOnJaw));

  const angrySnarl = clamp01(
    ap('brow_lowerer_left', 'brow_lowerer_right') * 0.48 +
      ap('nose_wrinkler_left', 'nose_wrinkler_right') * 0.32 +
      ap('lid_tightener_left', 'lid_tightener_right') * 0.2
  );
  if (angrySnarl > 0.36 && jawRaw < 0.17) {
    const over = clamp01((angrySnarl - 0.36) / 0.64);
    jaw *= clamp01(1 - over * 0.52);
  }
  jaw = clamp01(jaw);

  const puckerAvg =
    (g('lip_pucker_left') +
      g('lip_pucker_right') +
      g('lip_funneler_left_bottom') +
      g('lip_funneler_right_bottom') +
      g('lip_funneler_left_top') +
      g('lip_funneler_right_top')) /
    6;

  const mouthClearlyOpenVsPucker =
    jawRaw >= JAW_CLEAR_OPEN_FOR_PUCKER && jawRaw > puckerAvg * 1.02;
  const puckerDominates =
    puckerAvg >= LIP_PUCKER_SUPPRESS_OPEN_AT &&
    !mouthClearlyOpenVsPucker &&
    puckerAvg > jawRaw * LIP_PUCKER_DOM_JAW_MUL + LIP_PUCKER_DOM_JAW_BIAS;
  const puckerBlend = puckerDominates
    ? clamp01((puckerAvg - LIP_PUCKER_SUPPRESS_OPEN_AT) / (1 - LIP_PUCKER_SUPPRESS_OPEN_AT))
    : 0;
  const purseSigInfer = clamp01(lipSeal * 0.52 + lipPressAvg * 0.48);
  const purseClearOpen =
    jawRaw >= JAW_CLEAR_OPEN_FOR_PUCKER && jawRaw > puckerAvg * 1.02;
  const purseHoldBlendInfer =
    purseSigInfer >= PURSE_HOLD_ACTIVATE && jawRaw < PURSE_HOLD_JAW_MAX && !purseClearOpen
      ? clamp01((purseSigInfer - PURSE_HOLD_ACTIVATE) / Math.max(1e-6, 1 - PURSE_HOLD_ACTIVATE))
      : 0;
  const jawForOpen = clamp01(
    jaw * (1 - puckerBlend * LIP_PUCKER_JAW_BLEED_MAX) * (1 - purseHoldBlendInfer * PURSE_HOLD_VISEME_JAW)
  );

  const stretchAvg = (g('lip_stretcher_left') + g('lip_stretcher_right')) / 2;

  const lipsToward = g('lips_toward');

  const upperLip = (g('upper_lip_raiser_left') + g('upper_lip_raiser_right')) / 2;

  const lipsTowardAa = clamp01(
    lipsToward *
      (1 - puckerBlend * LIP_PUCKER_LIPS_TOWARD_BLEED) *
      (1 - purseHoldBlendInfer * PURSE_HOLD_VISEME_LIPS)
  );
  const upperLipAa = clamp01(upperLip * (1 - puckerBlend * 0.32));
  const lipsTowardOhOu = clamp01(
    lipsToward *
      clamp01(1 - puckerBlend * 0.32) *
      (1 - purseHoldBlendInfer * PURSE_HOLD_OH_OU_LIPS)
  );

  const aaLinear = clamp01(
    jawForOpen * AA_JAW_COEFF + lipsTowardAa * AA_LIPS_TOWARD_COEFF + upperLipAa * AA_UPPER_LIP_COEFF
  );
  const aa = clamp01(aaLinear > 0 ? Math.pow(aaLinear, AA_OPEN_EXPONENT) : 0);
  const ee = clamp01(stretchAvg * 1.05 + upperLip * 0.32);
  const ih = clamp01(stretchAvg * 0.8 + upperLip * 0.18);

  const smileCornersG = (g('lip_corner_puller_left') + g('lip_corner_puller_right')) / 2;
  const cheekSG = (g('cheek_raiser_left') + g('cheek_raiser_right')) / 2;
  const smileHi = clamp01(Math.max(smileCornersG * 1.02, cheekSG * 0.92));
  const lipPressG = (g('lip_pressor_left') + g('lip_pressor_right')) / 2;
  const lipSealG = lipSeal;
  const closedLipSmile =
    smileHi > CLOSED_SMILE_AA_SUPPRESS_AT &&
    jawRaw < CLOSED_SMILE_JAW_CAP_FOR_BLEED &&
    (lipPressG > CLOSED_SMILE_PRESS_GATE || lipSealG > CLOSED_SMILE_SEAL_GATE);
  let aaOut = aa;
  let eeOut = ee;
  let ihOut = ih;
  if (closedLipSmile) {
    const bleed =
      clamp01((smileHi - CLOSED_SMILE_AA_SUPPRESS_AT) / 0.5) *
      clamp01(1 - jawRaw / Math.max(1e-6, CLOSED_SMILE_JAW_CAP_FOR_BLEED));
    aaOut = clamp01(aa * (1 - bleed * CLOSED_SMILE_AA_BLEED_MAX));
    const sBleed = bleed * CLOSED_SMILE_STRETCH_BLEED;
    eeOut = clamp01(ee * (1 - sBleed * 0.85));
    ihOut = clamp01(ih * (1 - sBleed * 0.75));
  }

  const jawOh = jawForOpen * 0.22;
  const jawOu = jawForOpen * 0.12;
  const oh = clamp01(lipsTowardOhOu * 0.38 + jawOh * 1.08 + stretchAvg * 0.2);
  const ou = clamp01(lipsTowardOhOu * 0.58 + jawOu * 1.12 + stretchAvg * 0.14);

  return {
    blink,
    aa: aaOut,
    ee: eeOut,
    ih: ihOut,
    oh,
    ou,
  };
}

/**
 * Approximate **OVR Lip-Sync-style consonant visemes** from FACS-style face-tracking
 * weights. The standard VRM preset enum only covers vowels (`aa / ih / ee / oh / ou`);
 * many higher-end rigs ship extra consonant blend shapes (`PP / FF / TH / DD / kk /
 * CH / SS / nn / RR / sil`). Face trackers do not emit phoneme labels directly, so we
 * derive each consonant from the same mouth-shape cues a viseme designer would use:
 *
 * - **PP** (p / b / m, bilabial): lips pressed + tightened + brought together, no real jaw / pucker.
 * - **FF** (f / v, labiodental): lower lip tucked (lip suck bottom or lower-lip depressor without jaw),
 *   chin raise, mild upper-lip raise.
 * - **TH** (th, dental): upper chin raise + slight opening, no pucker / closure.
 * - **DD** (d / t / l, alveolar): mild jaw open + mild stretch / upper-lip raise, no pucker.
 * - **kk** (k / g, velar): slightly less stretch than DD with similar mild opening.
 * - **CH** (ch / sh / j, postalveolar): forward squared lips (pucker + stretch) without wide jaw.
 * - **SS** (s / z, sibilant): stretched lips with small opening, no pucker.
 * - **nn** (n / ng, nasal): mild closure + small opening.
 * - **RR** (r, rhotic): mild pucker without strong opening.
 * - **sil** (silence): close to neutral mouth. Stays at 0 here because face tracking alone
 *   cannot distinguish a still / relaxed mouth from a deliberate silence pose — the lip-sync
 *   path can drive `sil` from audio volume via {@link setXRDriverLipSyncVisemeOverride}.
 *
 * Output is conservative: each consonant subtracts the others’ dominant cues so only the
 * matching mouth shape activates strongly, and explicit jaw / pucker drowns out the wrong
 * consonant guesses. Values are clamped to [0, 1].
 *
 * @param {Record<string, number>} weights — preprocessed (delta-from-neutral) FACS record.
 * @returns {{ pp: number, ff: number, th: number, dd: number, kk: number, ch: number, ss: number, nn: number, rr: number, sil: number }}
 */
export function inferConsonantVisemes(weights) {
  const g = (k) => clamp01(weights[k] ?? 0);
  const ap = (a, b) => (g(a) + g(b)) / 2;

  const jawOpen = Math.max(g('jaw_drop'), g('jaw_thrust'));
  const lipsToward = g('lips_toward');
  const pressAvg = ap('lip_pressor_left', 'lip_pressor_right');
  const tightAvg = ap('lip_tightener_left', 'lip_tightener_right');
  const puckerAvg =
    (g('lip_pucker_left') +
      g('lip_pucker_right') +
      g('lip_funneler_left_bottom') +
      g('lip_funneler_right_bottom') +
      g('lip_funneler_left_top') +
      g('lip_funneler_right_top')) /
    6;
  const stretchAvg = ap('lip_stretcher_left', 'lip_stretcher_right');
  const upperLipAvg = ap('upper_lip_raiser_left', 'upper_lip_raiser_right');
  const lowerLipDep = ap('lower_lip_depressor_left', 'lower_lip_depressor_right');
  const lipSuckTopAvg = ap('lip_suck_left_top', 'lip_suck_right_top');
  const lipSuckBotAvg = ap('lip_suck_left_bottom', 'lip_suck_right_bottom');
  const chinTop = g('chin_raiser_top');
  const chinBot = g('chin_raiser_bottom');

  const closure = clamp01((tightAvg + pressAvg) * 0.55 + lipsToward * 0.35);
  const openness = clamp01(jawOpen * 0.7 + Math.max(0, lowerLipDep - 0.05) * 0.25);
  const sibilance = clamp01(stretchAvg * 0.82 + upperLipAvg * 0.18 - puckerAvg * 0.45);

  const sealCore = (pressAvg + tightAvg) / 2;
  const jawForPpGate = clamp01(1 - jawOpen * 1.08);
  /** Wide lip stretch + pucker is usually CH/SS, not bilabial — gate pucker→pp so purse still reads. */
  const stretchForPpGate = clamp01(1 - Math.max(0, stretchAvg - 0.2) / 0.5);
  const chWideStretch = stretchAvg > 0.42 && puckerAvg > 0.38;
  const puckerSealBoost = chWideStretch
    ? 0
    : clamp01(
        puckerAvg *
          sealCore *
          1.38 *
          stretchForPpGate *
          jawForPpGate *
          clamp01(1 - Math.max(0, stretchAvg - 0.48) * 2.2)
      );
  const ppClosureLine = clamp01(
    (closure - 0.1) * 1.68 -
      openness * 0.56 -
      lipSuckBotAvg * 0.36 -
      puckerAvg * 0.2 * clamp01(1 - sealCore * 1.15)
  );
  const ppPressTight = clamp01(
    sealCore * sealCore * 1.48 * (1 + lipsToward * 0.38) * jawForPpGate - openness * 0.32
  );
  const pp = clamp01(
    Math.max(
      ppClosureLine,
      ppPressTight * 0.96 + puckerSealBoost * 0.94,
      closure * 0.52 + puckerSealBoost * 1.05
    )
  );

  const labiodental =
    lipSuckBotAvg * 0.74 + chinBot * 0.22 + lowerLipDep * 0.28 + upperLipAvg * 0.12;
  const ff = clamp01(labiodental * (1 - jawOpen * 0.65) * (1 - puckerAvg * 0.55) - closure * 0.25);

  const th = clamp01(
    chinTop * 0.78 + Math.min(jawOpen, 0.32) * 0.24 - closure * 0.5 - puckerAvg * 0.5
  );

  const ddBase = jawOpen * 0.48 + stretchAvg * 0.28 + upperLipAvg * 0.14;
  const dd = clamp01(ddBase * (1 - closure * 0.7) * (1 - puckerAvg * 0.65));

  const kkBase = jawOpen * 0.46 + stretchAvg * 0.16;
  const kk = clamp01(kkBase * (1 - closure * 0.7) * (1 - puckerAvg * 0.65));

  const ch = clamp01(
    puckerAvg * 0.62 + stretchAvg * 0.3 - Math.max(0, jawOpen - 0.12) * 0.6 - closure * 0.35
  );

  const ss = clamp01(sibilance * 0.95 + jawOpen * 0.1 - closure * 0.6 - puckerAvg * 0.65);

  const nn = clamp01(
    (jawOpen * 0.28 + lipsToward * 0.22 + closure * 0.18) * (1 - puckerAvg * 0.5) -
      stretchAvg * 0.18
  );

  const rr = clamp01(
    puckerAvg * 0.58 - Math.max(0, jawOpen - 0.18) * 0.55 - sibilance * 0.32 - closure * 0.25
  );

  return { sil: 0, pp, ff, th, dd, kk, ch, ss, nn, rr };
}

/**
 * Aggregate per-eye WebXR gaze weights into single look directions (VRM look* presets).
 * @param {Record<string, number>} weights
 * @returns {{ lookUp: number, lookDown: number, lookLeft: number, lookRight: number }}
 */
export function inferLookFromEyeWeights(weights) {
  const g = (k) => clamp01(weights[k] ?? 0);
  const upL = g('eyes_look_up_left');
  const upR = g('eyes_look_up_right');
  const dnL = g('eyes_look_down_left');
  const dnR = g('eyes_look_down_right');
  const leftL = g('eyes_look_left_left');
  const leftR = g('eyes_look_left_right');
  const rightL = g('eyes_look_right_left');
  const rightR = g('eyes_look_right_right');
  const d = LOOK_DIAGONAL_BLEND;
  const dUL = Math.min(1, Math.hypot(upL, leftL) * d);
  const dUR = Math.min(1, Math.hypot(upR, rightR) * d);
  const dDL = Math.min(1, Math.hypot(dnL, leftL) * d);
  const dDR = Math.min(1, Math.hypot(dnR, rightR) * d);
  const lookUp = clamp01(Math.max(upL, upR, dUL, dUR));
  const lookDown = clamp01(Math.max(dnL, dnR, dDL, dDR));
  const lookLeft = clamp01(Math.max(leftL, leftR, dUL, dDL));
  const lookRight = clamp01(Math.max(rightL, rightR, dUR, dDR));
  return { lookUp, lookDown, lookLeft, lookRight };
}

/** @param {string} s */
function normalizeExprKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
}

/**
 * @param {import('@pixiv/three-vrm').VRM['expressionManager']} em
 * @returns {Map<string, string>} normalized name → canonical expression name on this VRM
 */
function buildExpressionNormIndex(em) {
  /** @type {Map<string, string>} */
  const index = new Map();
  const map = em?.expressionMap;
  if (!map || typeof map !== 'object') return index;
  for (const name of Object.keys(map)) {
    index.set(normalizeExprKey(name), name);
  }
  return index;
}

/**
 * @param {Map<string, string>} index
 * @param {string} weightKey
 * @returns {string | null} canonical expression name
 */
function resolveWeightKeyToExpression(index, weightKey) {
  const nk = normalizeExprKey(weightKey);
  const tryList = [nk, ...(WEIGHT_KEY_EXTRA_NORM[nk] || [])];
  for (const cand of tryList) {
    if (index.has(cand)) return index.get(cand);
  }
  return null;
}

/** @param {Map<string, string>} index */
function anyWeightKeyMapsToExpression(index, keys) {
  for (const k of keys) {
    if (resolveWeightKeyToExpression(index, k)) return true;
  }
  return false;
}

/** Canonical expression name for `browInnerUp` (any common export spelling). */
function resolveBrowInnerUpExpressionName(index) {
  for (const nk of ['browinnerup', 'browinnerupl', 'browinnerupleft', 'browinnerupr', 'browinnerupright']) {
    if (index.has(nk)) return index.get(nk);
  }
  return null;
}

/** Canonical expression name for `browOuterUp` (any common export spelling). */
function resolveBrowOuterUpExpressionName(index) {
  for (const nk of ['browouterup', 'browouterupl', 'browouterupleft', 'browouterupr', 'browouterupright']) {
    if (index.has(nk)) return index.get(nk);
  }
  return null;
}

/**
 * Fill consolidated **browInnerUp** from **inner** raiser channels only (no outer bleed).
 * @param {Map<string, string>} index
 * @param {Record<string, number>} processed
 * @param {Map<string, number>} goalByExpr
 */
function applyBrowInnerUpExpressionFill(index, processed, goalByExpr) {
  const name = resolveBrowInnerUpExpressionName(index);
  if (!name) return;
  const innerL = clamp01(processed.inner_brow_raiser_left ?? 0);
  const innerR = clamp01(processed.inner_brow_raiser_right ?? 0);
  const raise = clamp01(Math.max(innerL, innerR));
  const prev = clamp01(goalByExpr.get(name) ?? 0);
  goalByExpr.set(name, clamp01(Math.max(prev, raise) * BROW_INNER_UP_EXPR_GAIN));
}

/**
 * Fill consolidated **browOuterUp** from **outer** raiser channels only (no inner bleed).
 * @param {Map<string, string>} index
 * @param {Record<string, number>} processed
 * @param {Map<string, number>} goalByExpr
 */
function applyBrowOuterUpExpressionFill(index, processed, goalByExpr) {
  const name = resolveBrowOuterUpExpressionName(index);
  if (!name) return;
  const outerL = clamp01(processed.outer_brow_raiser_left ?? 0);
  const outerR = clamp01(processed.outer_brow_raiser_right ?? 0);
  const raise = clamp01(Math.max(outerL, outerR));
  const prev = clamp01(goalByExpr.get(name) ?? 0);
  goalByExpr.set(name, clamp01(Math.max(prev, raise) * BROW_OUTER_UP_EXPR_GAIN));
}

const MOUTH_SNARE_NORMS_LEFT = Object.freeze([
  'mouthsnareleft',
  'mouth_snare_l',
  'mouth_snare_left',
  'mouthsnarel',
  'mouthleftsnare',
  'mouthsnare_l',
]);
const MOUTH_SNARE_NORMS_RIGHT = Object.freeze([
  'mouthsnareright',
  'mouth_snare_r',
  'mouth_snare_right',
  'mouthsnarer',
  'mouthrightsnare',
  'mouthsnare_r',
]);

/** @param {Map<string, string>} index */
function resolveMouthSnareExpressionName(index, side) {
  const norms = side === 'left' ? MOUTH_SNARE_NORMS_LEFT : MOUTH_SNARE_NORMS_RIGHT;
  for (const nk of norms) {
    if (index.has(nk)) return index.get(nk);
  }
  return null;
}

/**
 * Open **MouthSnare**-style morphs from jaw when trackers report jaw open but weak `mouth_left` / `mouth_right`.
 * @param {Map<string, string>} index
 * @param {Record<string, number>} processed
 * @param {Map<string, number>} goalByExpr
 */
function applyMouthSnareJawOpenFill(index, processed, goalByExpr) {
  const jaw = clamp01(Math.max(processed.jaw_drop ?? 0, processed.jaw_thrust ?? 0));
  if (jaw < 0.035) return;
  const jawLine = clamp01(jaw * MOUTH_SNARE_JAW_OPEN_COEFF);

  for (const side of ['left', 'right']) {
    const nk = side === 'left' ? 'mouth_left' : 'mouth_right';
    const snareName = resolveMouthSnareExpressionName(index, side);
    if (!snareName) continue;
    const track = clamp01(processed[nk] ?? 0);
    const prev = clamp01(goalByExpr.get(snareName) ?? 0);
    goalByExpr.set(snareName, clamp01(Math.max(prev, track, jawLine)));
  }
}

/**
 * @param {import('@pixiv/three-vrm').VRM['expressionManager']} em
 * @param {Map<string, string>} index
 * @param {string} presetValue — e.g. VRMExpressionPresetName.Aa → "aa"
 */
function presetExists(em, index, presetValue) {
  const slug = typeof presetValue === 'string' ? presetValue : String(presetValue);
  const n = normalizeExprKey(slug);
  if (!index.has(n)) return null;
  const canonical = index.get(n);
  if (typeof em.getExpression === 'function' && !em.getExpression(canonical)) return null;
  return canonical;
}

function setExpressionValue(em, name, value) {
  try {
    if (typeof em.getExpression === 'function' && em.getExpression(name) && typeof em.setValue === 'function') {
      em.setValue(name, clamp01(value));
      return true;
    }
  } catch (_) {
    /* missing */
  }
  return false;
}

const expressionSmoothByVrm = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const prevDrivenByVrm = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

/** Lip-sync FFT vowels merged into XR viseme presets when {@link isFaceExpressionDriverFresh}. */
const lipSyncVisemeOverrideByVrm = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

/** Below this, bilabial dominance does not reshape vowel / consonant viseme merges. */
const BILABIAL_DOM_GATE = 0.078;
/** At dominance 1, open vowel viseme weights are multiplied by about `(1 - BILABIAL_VOWEL_CRUSH)` (aa/ee/ih; oh/ou get purse relief in merge). */
const BILABIAL_VOWEL_CRUSH = 0.84;
/** Labiodental / dental / alveolar / velar / sibilant consonants attenuate under bilabial lead — not **nn** / **rr** (nasal + rhotic read on nose/corners). */
const BILABIAL_CONSONANT_ATTEN = 0.34;
const BILABIAL_ATTEN_CONSONANT_SLUGS = new Set(['ff', 'th', 'dd', 'kk', 'ch', 'ss']);
/** Tracked seal auxiliary is scaled by this before entering max() with `inferConsonantVisemes().pp`. */
const BILABIAL_AUX_SEAL_SCALE = 0.97;

const VOWEL_VISEME_MERGE_KEYS = new Set(['aa', 'ee', 'ih', 'oh', 'ou', 'ah']);
let lastFaceDriverApplyMs = 0;

export function markFaceExpressionDriverApplied() {
  lastFaceDriverApplyMs =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
}

/**
 * True if {@link markFaceExpressionDriverApplied} ran recently (face / native expression drive active).
 * Lip-sync can skip writing the same presets directly to avoid fighting the smoothed XR path.
 */
export function isFaceExpressionDriverFresh(withinMs = 140) {
  const t =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  return t - lastFaceDriverApplyMs < withinMs;
}

/**
 * Keys allowed on lip-sync override objects (canonical lowercase slugs after {@link normalizeLipSyncPartialKey}).
 * Single-letter **E** maps to `ee`. Uppercase viseme ids (**CH**, **DD**, …) normalize to lowercase slugs.
 */
const LIP_SYNC_OVERRIDE_CANON_KEYS = new Set([
  'aa',
  'ah',
  'ee',
  'ih',
  'oh',
  'ou',
  'sil',
  'pp',
  'ff',
  'th',
  'dd',
  'kk',
  'ch',
  'ss',
  'nn',
  'rr',
]);

/** @param {string} k */
function normalizeLipSyncPartialKey(k) {
  const raw = String(k || '').trim();
  const low = raw.toLowerCase().replace(/[\s._-]+/g, '');
  if (low === 'e') return 'ee';
  if (low === 'a') return 'aa';
  if (low === 'i') return 'ih';
  if (low === 'o') return 'oh';
  /** Single-letter / alternate spellings for rounded back vowel (OVR **ou** / “oo” / “u”). */
  if (low === 'u') return 'ou';
  if (low === 'oo' || low === 'uu' || low === 'uw') return 'ou';
  if (low === 'visemeou' || low === 'visemeoo' || low === 'visemeuu' || low === 'vrcvou' || low === 'vrcvoo')
    return 'ou';
  return low;
}

/**
 * Merge audio-driven viseme weights into the XR face-tracking output. Vowel keys
 * (`aa` / `ee` / `ih` / `oh` / `ou`, legacy `ah`, or **`E`/`e` → ee**) blend with XR; consonant keys
 * (`sil` / `pp` / `ff` / `th` / `dd` / `kk` / `ch` / `ss` / `nn` / `rr`, including **CH**, **DD**, …) merge when those shapes exist on the VRM.
 * `strength` scales the blend; values below 0.03 are treated as no override for jitter control.
 *
 * @param {import('@pixiv/three-vrm').VRM} vrm
 * @param {Record<string, number> & { strength?: number }} partial
 */
export function setXRDriverLipSyncVisemeOverride(vrm, partial) {
  if (!vrm || !lipSyncVisemeOverrideByVrm) return;
  const prev = lipSyncVisemeOverrideByVrm.get(vrm) || {};
  /** @type {Record<string, number>} */
  const merged = { ...prev };
  if (partial && typeof partial === 'object') {
    for (const [k, v] of Object.entries(partial)) {
      if (k === 'strength' || k === 'weights' || k === 't' || k === 'ts' || k === 'openxrParameters') {
        merged[k] = v;
        continue;
      }
      const canon = normalizeLipSyncPartialKey(k);
      if (!LIP_SYNC_OVERRIDE_CANON_KEYS.has(canon)) continue;
      merged[canon] = v;
    }
  }
  lipSyncVisemeOverrideByVrm.set(vrm, merged);
}

/** @param {import('@pixiv/three-vrm').VRM} vrm */
export function clearXRDriverLipSyncVisemeOverride(vrm) {
  if (!vrm || !lipSyncVisemeOverrideByVrm) return;
  lipSyncVisemeOverrideByVrm.delete(vrm);
}

/**
 * Press / tight / pucker / lips_toward with low jaw — bilabial “seal & purse” without relying only on {@link inferConsonantVisemes} `pp`.
 * @param {Record<string, number>} weights
 */
function bilabialSealAuxiliaryFromWeights(weights) {
  if (!weights || typeof weights !== 'object') return 0;
  const g = (k) => clamp01(weights[k] ?? 0);
  const jaw = Math.max(g('jaw_drop'), g('jaw_thrust'));
  const press = (g('lip_pressor_left') + g('lip_pressor_right')) / 2;
  const tight = (g('lip_tightener_left') + g('lip_tightener_right')) / 2;
  const pucker =
    (g('lip_pucker_left') +
      g('lip_pucker_right') +
      g('lip_funneler_left_bottom') +
      g('lip_funneler_right_bottom') +
      g('lip_funneler_left_top') +
      g('lip_funneler_right_top')) /
    6;
  const lipsToward = g('lips_toward');
  const seal = clamp01(press * 0.54 + tight * 0.54 + lipsToward * 0.34);
  const purse = clamp01(pucker * 0.92 * clamp01(1 - jaw * 0.88));
  const notWide = clamp01(1 - jaw * 0.72);
  return clamp01(
    Math.max(
      seal * notWide * 0.96 + purse * 0.72,
      seal * 0.74 * notWide + press * tight * 1.55 * notWide
    )
  );
}

/**
 * 0..1 how strongly bilabial closure / lip seal should override competing mouth visemes (tracked + lip-sync vowels).
 *
 * @param {import('@pixiv/three-vrm').VRM | null | undefined} vrm
 * @param {Record<string, number> | null | undefined} preprocessedWeights — same space as {@link inferConsonantVisemes} input
 */
export function computeBilabialMouthClosureDominance(vrm, preprocessedWeights) {
  let d = 0;
  if (preprocessedWeights && typeof preprocessedWeights === 'object') {
    const cons = inferConsonantVisemes(preprocessedWeights);
    d = Math.max(d, cons.pp);
    d = Math.max(d, bilabialSealAuxiliaryFromWeights(preprocessedWeights) * BILABIAL_AUX_SEAL_SCALE);
  }
  const o = vrm && lipSyncVisemeOverrideByVrm ? lipSyncVisemeOverrideByVrm.get(vrm) : null;
  if (o) {
    const s = clamp01(typeof o.strength === 'number' ? o.strength : 0);
    if (s >= 0.03) {
      const lipPp = clamp01(typeof o.pp === 'number' ? o.pp : 0);
      d = Math.max(d, lipPp * s);
    }
    /** Strong mic vowels without strong mic **pp** → do not let resting webcam “seal” crush the mouth (web). */
    if (s >= 0.04) {
      const lipPpMic = clamp01(typeof o.pp === 'number' ? o.pp : 0) * s;
      const maxVowel = Math.max(
        clamp01(typeof o.aa === 'number' ? o.aa : 0),
        clamp01(typeof o.ah === 'number' ? o.ah : 0),
        clamp01(typeof o.ee === 'number' ? o.ee : 0),
        clamp01(typeof o.e === 'number' ? o.e : 0),
        clamp01(typeof o.ih === 'number' ? o.ih : 0),
        clamp01(typeof o.oh === 'number' ? o.oh : 0),
        clamp01(typeof o.ou === 'number' ? o.ou : 0),
        clamp01(typeof o.u === 'number' ? o.u : 0),
        clamp01(typeof o.oo === 'number' ? o.oo : 0)
      );
      const vowelMic = maxVowel * s;
      if (vowelMic > 0.055 && lipPpMic < 0.28) {
        d = clamp01(d * clamp01(1 - vowelMic * 0.92));
      }
    }
  }
  return clamp01(d);
}

/**
 * @param {Record<string, number>} o
 * @param {'aa'|'ee'|'ih'|'oh'|'ou'|'sil'|'pp'|'ff'|'th'|'dd'|'kk'|'ch'|'ss'|'nn'|'rr'} visemeKey
 */
function lipSyncOverridePick(o, visemeKey) {
  const v =
    o[visemeKey] ??
    (visemeKey === 'aa' ? (o.ah ?? o.a) : null) ??
    (visemeKey === 'ee' ? o.e : null) ??
    (visemeKey === 'ou' ? (o.u ?? o.oo ?? o.uw) : null);
  return typeof v === 'number' && !Number.isNaN(v) ? clamp01(v) : null;
}

/**
 * When the mouth is **forward-rounded** (pucker + seal) with modest jaw, ease bilabial **vowel crush**
 * on **oh / ou** so rounded “purse” shapes on vowel rigs are not wiped to zero.
 */
function roundedPurseVowelRelief(record) {
  if (!record || typeof record !== 'object') return 0;
  const g = (k) => clamp01(record[k] ?? 0);
  const jaw = Math.max(g('jaw_drop'), g('jaw_thrust'));
  const stretch = (g('lip_stretcher_left') + g('lip_stretcher_right')) / 2;
  const pucker =
    (g('lip_pucker_left') +
      g('lip_pucker_right') +
      g('lip_funneler_left_bottom') +
      g('lip_funneler_right_bottom') +
      g('lip_funneler_left_top') +
      g('lip_funneler_right_top')) /
    6;
  const seal =
    (g('lip_pressor_left') +
      g('lip_pressor_right') +
      g('lip_tightener_left') +
      g('lip_tightener_right')) /
    4;
  if (jaw > 0.34 || stretch > 0.55) return 0;
  return clamp01(pucker * seal * 1.15 * (1 - jaw * 1.02) * (1 - stretch * 0.42));
}

/**
 * @param {import('@pixiv/three-vrm').VRM | null | undefined} vrm
 * @param {string} visemeKey
 * @param {number} xrVal
 * @param {number} [bilabialDom] from {@link computeBilabialMouthClosureDominance}
 * @param {number} [roundedPurseRelief] 0..1 softens vowel crush for oh/ou
 */
function mergeXRVisemeWithLipSync(vrm, visemeKey, xrVal, bilabialDom = 0, roundedPurseRelief = 0) {
  const dom = clamp01(typeof bilabialDom === 'number' ? bilabialDom : 0);
  const relief = clamp01(typeof roundedPurseRelief === 'number' ? roundedPurseRelief : 0);
  const o = lipSyncVisemeOverrideByVrm?.get(vrm);
  const s = o ? clamp01(typeof o.strength === 'number' ? o.strength : 0) : 0;
  const lipPick = o && s >= 0.03 ? lipSyncOverridePick(o, visemeKey) : null;

  const lipPpMic = o && s >= 0.03 ? clamp01(typeof o.pp === 'number' ? o.pp : 0) * s : 0;
  let effectiveDom = dom;
  if (
    lipPick != null &&
    VOWEL_VISEME_MERGE_KEYS.has(visemeKey) &&
    s >= 0.04 &&
    clamp01(lipPick) > 0.045 &&
    lipPpMic < 0.3
  ) {
    effectiveDom = clamp01(dom * (1 - clamp01(lipPick * s) * 0.9));
  }

  let crushMul = 1;
  if (effectiveDom > BILABIAL_DOM_GATE && VOWEL_VISEME_MERGE_KEYS.has(visemeKey)) {
    crushMul = clamp01(1 - effectiveDom * BILABIAL_VOWEL_CRUSH);
    if ((visemeKey === 'oh' || visemeKey === 'ou') && relief > 0.08) {
      crushMul = clamp01(1 - (1 - crushMul) * (1 - relief * 0.72));
    }
  }

  if (!o) {
    return clamp01(clamp01(xrVal) * crushMul);
  }
  if (s < 0.03) {
    return clamp01(clamp01(xrVal) * crushMul);
  }
  const lip = lipPick;
  if (lip == null) {
    return clamp01(clamp01(xrVal) * crushMul);
  }
  const blend = clamp01(clamp01(xrVal) * (1 - s) + lip * s);
  return clamp01(blend * crushMul);
}

/**
 * @param {import('@pixiv/three-vrm').VRM} vrm
 * @param {import('@pixiv/three-vrm').VRM['expressionManager']} em
 * @param {Map<string, number>} goalByExpr
 * @param {number} lerp
 */
function applySmoothedGoals(vrm, em, goalByExpr, lerp) {
  if (!expressionSmoothByVrm) return;
  let smooth = expressionSmoothByVrm.get(vrm);
  if (!smooth) {
    smooth = new Map();
    expressionSmoothByVrm.set(vrm, smooth);
  }

  for (const [name, goal] of goalByExpr) {
    const prev = smooth.get(name) ?? 0;
    const next = prev + (goal - prev) * lerp;
    smooth.set(name, next);
    setExpressionValue(em, name, next);
  }

  for (const [name, val] of [...smooth.entries()]) {
    if (!goalByExpr.has(name) && val < 1e-4) smooth.delete(name);
  }

  try {
    em.update?.();
  } catch (_) {
    /* ignore */
  }
}

/**
 * @param {import('@pixiv/three-vrm').VRM['expressionManager']} em
 * @param {Map<string, string>} index
 * @returns {null | { left: string, right: string }}
 */
function resolveBlinkSplitNames(em, index) {
  const left =
    presetExists(em, index, VRMExpressionPresetName.BlinkLeft) ||
    resolveWeightKeyToExpression(index, 'blinkLeft') ||
    resolveWeightKeyToExpression(index, 'blink_left') ||
    resolveWeightKeyToExpression(index, 'BlinkLeft');
  const right =
    presetExists(em, index, VRMExpressionPresetName.BlinkRight) ||
    resolveWeightKeyToExpression(index, 'blinkRight') ||
    resolveWeightKeyToExpression(index, 'blink_right') ||
    resolveWeightKeyToExpression(index, 'BlinkRight');
  if (!left || !right) return null;
  return { left, right };
}

/**
 * Drive blinkLeft / blinkRight from eyes_closed_left / eyes_closed_right when both exist.
 * @returns {boolean} true when per-eye blink owns the channel (unified blink preset is skipped).
 */
function applySplitBlink(names, record, goalByExpr) {
  if (!names) return false;
  const l = clamp01(record.eyes_closed_left ?? 0);
  const r = clamp01(record.eyes_closed_right ?? 0);
  goalByExpr.set(names.left, l);
  goalByExpr.set(names.right, r);
  return true;
}

function avgPair(record, a, b) {
  return (clamp01(record[a] ?? 0) + clamp01(record[b] ?? 0)) / 2;
}

/**
 * Drive VRM **emotion** presets (happy / sad / angry / surprised) from ARKit-style weights
 * when those expressions exist on the model and are not already stronger from direct binds.
 * @param {import('@pixiv/three-vrm').VRM | null} [vrm]
 */
function applyEmotionCompositePresets(em, index, record, goalByExpr, vrm = null) {
  const smileCorners = avgPair(record, 'lip_corner_puller_left', 'lip_corner_puller_right');
  const cheekSmile = avgPair(record, 'cheek_raiser_left', 'cheek_raiser_right');
  const smile = clamp01(Math.max(smileCorners * 1.08, cheekSmile * 0.95));

  const frownMouth = avgPair(record, 'lip_corner_depressor_left', 'lip_corner_depressor_right');
  const lowerLip = avgPair(record, 'lower_lip_depressor_left', 'lower_lip_depressor_right');
  const innerBrow = avgPair(record, 'inner_brow_raiser_left', 'inner_brow_raiser_right');
  const browLow = avgPair(record, 'brow_lowerer_left', 'brow_lowerer_right');
  const outerBrow = avgPair(record, 'outer_brow_raiser_left', 'outer_brow_raiser_right');
  const upperLid = avgPair(record, 'upper_lid_raiser_left', 'upper_lid_raiser_right');
  const noseW = avgPair(record, 'nose_wrinkler_left', 'nose_wrinkler_right');
  const lidTight = avgPair(record, 'lid_tightener_left', 'lid_tightener_right');
  const dimpler = avgPair(record, 'dimpler_left', 'dimpler_right');

  let happy = clamp01(smile * 1.26 - frownMouth * 0.38 - lowerLip * 0.18);
  let sad = clamp01(frownMouth * 0.9 + lowerLip * 0.38 + innerBrow * 0.52 + browLow * 0.22 - smile * 0.48);
  let angry = clamp01(browLow * 0.88 + noseW * 0.72 + lidTight * 0.38 + dimpler * 0.22 - smile * 0.38);
  let surprised = clamp01(outerBrow * 0.92 + upperLid * 0.68 - browLow * 0.4);

  happy *= 1 - sad * 0.55;
  happy *= 1 - angry * 0.35;
  sad *= 1 - happy * 0.58;
  sad *= 1 - angry * 0.22;
  angry *= 1 - happy * 0.42;
  surprised *= 1 - browLow * 0.48;

  happy = clamp01(happy);
  sad = clamp01(sad);
  angry = clamp01(angry);
  surprised = clamp01(surprised);

  if (
    anyWeightKeyMapsToExpression(index, [
      'lip_corner_puller_left',
      'lip_corner_puller_right',
      'cheek_raiser_left',
      'cheek_raiser_right',
    ])
  ) {
    happy *= 0.72;
  }
  if (
    anyWeightKeyMapsToExpression(index, [
      'lip_corner_depressor_left',
      'lip_corner_depressor_right',
      'lower_lip_depressor_left',
      'lower_lip_depressor_right',
    ])
  ) {
    sad *= 0.55;
  }
  if (
    anyWeightKeyMapsToExpression(index, [
      'brow_lowerer_left',
      'brow_lowerer_right',
      'nose_wrinkler_left',
      'nose_wrinkler_right',
      'lid_tightener_left',
      'lid_tightener_right',
    ])
  ) {
    angry *= 0.68;
  }
  if (
    anyWeightKeyMapsToExpression(index, [
      'inner_brow_raiser_left',
      'inner_brow_raiser_right',
    ])
  ) {
    sad *= 0.32;
  }
  if (
    anyWeightKeyMapsToExpression(index, [
      'outer_brow_raiser_left',
      'outer_brow_raiser_right',
      'upper_lid_raiser_left',
      'upper_lid_raiser_right',
    ])
  ) {
    surprised *= 0.32;
  }

  happy = clamp01(happy);
  sad = clamp01(sad);
  angry = clamp01(angry);
  surprised = clamp01(surprised);

  if (vrm && lipSyncVisemeOverrideByVrm) {
    const o = lipSyncVisemeOverrideByVrm.get(vrm);
    if (o && (o.strength ?? 0) > 0.08) {
      const s = clamp01(o.strength ?? 0);
      const act = Math.max(o.aa ?? 0, o.ee ?? 0, o.e ?? 0, o.ih ?? 0, o.oh ?? 0, o.ou ?? 0, o.ah ?? 0);
      happy = clamp01(happy * clamp01(1 - s * act * 0.38));
    }
  }

  const emotions = [
    [VRMExpressionPresetName.Happy, happy],
    [VRMExpressionPresetName.Sad, sad],
    [VRMExpressionPresetName.Angry, angry],
    [VRMExpressionPresetName.Surprised, surprised],
  ];
  for (const [preset, val] of emotions) {
    const name = presetExists(em, index, preset);
    if (!name || val < 0.03) continue;
    goalByExpr.set(name, Math.max(goalByExpr.get(name) ?? 0, val));
  }
}

/**
 * Drive VRM lookUp / lookDown / lookLeft / lookRight from aggregated gaze when presets exist
 * and no per-key expression mapping already consumed those weights.
 */
function applyLookPresetFill(em, index, record, goalByExpr) {
  const lk = inferLookFromEyeWeights(record);
  const browRaise = Math.max(
    clamp01(record.inner_brow_raiser_left ?? 0),
    clamp01(record.inner_brow_raiser_right ?? 0),
    clamp01(record.outer_brow_raiser_left ?? 0),
    clamp01(record.outer_brow_raiser_right ?? 0)
  );
  const lookUpMerged = clamp01(Math.max(lk.lookUp, browRaise * LOOK_UP_FROM_BROW_RAISE_MUL));
  const specs = [
    [VRMExpressionPresetName.LookUp, ['eyes_look_up_left', 'eyes_look_up_right'], lookUpMerged],
    [VRMExpressionPresetName.LookDown, ['eyes_look_down_left', 'eyes_look_down_right'], lk.lookDown],
    [VRMExpressionPresetName.LookLeft, ['eyes_look_left_left', 'eyes_look_left_right'], lk.lookLeft],
    [VRMExpressionPresetName.LookRight, ['eyes_look_right_left', 'eyes_look_right_right'], lk.lookRight],
  ];
  for (const [preset, , val] of specs) {
    const name = presetExists(em, index, preset);
    if (!name || val < 0.02) continue;
    const prev = goalByExpr.get(name) ?? 0;
    goalByExpr.set(name, clamp01(Math.max(prev, val)));
  }
}

/**
 * Resolve vowel viseme slug (`aa` / `ee` / …) to the expression name on this VRM, including
 * single-letter **E** / **A** / … rigs that do not use standard preset ids.
 * @param {Map<string, string>} index
 * @param {'aa'|'ee'|'ih'|'oh'|'ou'} slug
 * @returns {string | null}
 */
function resolveVowelVisemeName(index, slug) {
  const aliases = VOWEL_VISEME_NAME_ALIASES[slug];
  if (!aliases) return null;
  for (const cand of aliases) {
    const n = normalizeExprKey(cand);
    if (index.has(n)) return index.get(n);
  }
  return null;
}

/**
 * Resolve an OVR-style consonant viseme slug (e.g. `'pp'`) to whatever the VRM
 * actually named it (`PP`, `v_pp`, `vrc.v_pp`, `Viseme_PP`, `FCL_PHN_PP`, …).
 * @param {Map<string, string>} index
 * @param {string} slug
 * @returns {string | null}
 */
function resolveConsonantVisemeName(index, slug) {
  const candidates = [slug, ...(CONSONANT_VISEME_NAME_ALIASES[slug] || [])];
  for (const cand of candidates) {
    const n = normalizeExprKey(cand);
    if (index.has(n)) return index.get(n);
  }
  return null;
}

/**
 * Fill OVR Lip-Sync-style consonant viseme expressions (`PP / FF / TH / DD / kk /
 * CH / SS / nn / RR / sil`) when the VRM has them. Values are inferred from FACS
 * shapes by {@link inferConsonantVisemes} and merged with any audio-driven lip-sync
 * override registered via {@link setXRDriverLipSyncVisemeOverride}, so high-quality
 * VRMs with consonant blends move during real-time tracking — vowel-only rigs are
 * unaffected.
 */
function applyConsonantVisemePresetFill(em, index, record, goalByExpr, vrm, bilabialDom) {
  const dom = clamp01(typeof bilabialDom === 'number' ? bilabialDom : 0);
  const cons = inferConsonantVisemes(record);
  for (const slug of CONSONANT_VISEME_KEYS) {
    const name = resolveConsonantVisemeName(index, slug);
    if (!name) continue;
    if (typeof em.getExpression === 'function' && !em.getExpression(name)) continue;
    let merged = mergeXRVisemeWithLipSync(vrm, slug, cons[slug] ?? 0, dom, 0);

    if (slug === 'pp') {
      const o = lipSyncVisemeOverrideByVrm?.get(vrm);
      if (o) {
        const s = clamp01(typeof o.strength === 'number' ? o.strength : 0);
        const lip = lipSyncOverridePick(o, 'pp');
        if (lip != null && s >= 0.03) {
          merged = clamp01(Math.max(merged, lip * s));
        }
      }
      merged = clamp01(Math.max(merged, dom * 1.04));
    } else if (BILABIAL_ATTEN_CONSONANT_SLUGS.has(slug) && dom > BILABIAL_DOM_GATE) {
      merged *= clamp01(1 - dom * BILABIAL_CONSONANT_ATTEN);
    }

    if (goalByExpr.has(name)) {
      goalByExpr.set(name, Math.max(goalByExpr.get(name) ?? 0, merged));
    } else {
      goalByExpr.set(name, merged);
    }
  }
}

/**
 * Fill standard viseme presets only when they exist on the model and were not already assigned.
 * @param {boolean} usedSplitBlink
 * @param {import('@pixiv/three-vrm').VRM} vrm
 */
function applyVisemePresetFill(em, index, record, goalByExpr, usedSplitBlink, vrm) {
  const bilabialDom = computeBilabialMouthClosureDominance(vrm, record);
  const roundedRelief = roundedPurseVowelRelief(record);
  const vis = inferVRMMorphTargets(record);

  const blinkName = presetExists(em, index, VRMExpressionPresetName.Blink);
  if (blinkName && !usedSplitBlink && !goalByExpr.has(blinkName)) {
    goalByExpr.set(blinkName, vis.blink);
  }

  const visByKey = {
    aa: mergeXRVisemeWithLipSync(vrm, 'aa', vis.aa, bilabialDom, roundedRelief),
    ee: mergeXRVisemeWithLipSync(vrm, 'ee', vis.ee, bilabialDom, roundedRelief),
    ih: mergeXRVisemeWithLipSync(vrm, 'ih', vis.ih, bilabialDom, roundedRelief),
    oh: mergeXRVisemeWithLipSync(vrm, 'oh', vis.oh, bilabialDom, roundedRelief),
    ou: mergeXRVisemeWithLipSync(vrm, 'ou', vis.ou, bilabialDom, roundedRelief),
  };

  const vowelSlugs = [
    ['aa', VRMExpressionPresetName.Aa, visByKey.aa],
    ['ih', VRMExpressionPresetName.Ih, visByKey.ih],
    ['ee', VRMExpressionPresetName.Ee, visByKey.ee],
    ['oh', VRMExpressionPresetName.Oh, visByKey.oh],
    ['ou', VRMExpressionPresetName.Ou, visByKey.ou],
  ];
  /** @type {Set<string>} */
  const vowelExprFilled = new Set();
  for (const [slug, preset, val] of vowelSlugs) {
    /** @type {string[]} */
    const names = [];
    const presetName = presetExists(em, index, preset);
    if (presetName) names.push(presetName);
    const customName = resolveVowelVisemeName(index, slug);
    if (customName && !names.includes(customName)) names.push(customName);
    for (const name of names) {
      if (vowelExprFilled.has(name)) continue;
      if (goalByExpr.has(name)) continue;
      if (typeof em.getExpression === 'function' && !em.getExpression(name)) continue;
      goalByExpr.set(name, clamp01(val));
      vowelExprFilled.add(name);
    }
  }

  const aaName = presetExists(em, index, VRMExpressionPresetName.Aa);
  const ahPreset = /** @type {any} */ (VRMExpressionPresetName).Ah;
  if (typeof ahPreset === 'string') {
    const ahName = presetExists(em, index, ahPreset);
    if (ahName && ahName !== aaName && !goalByExpr.has(ahName)) {
      goalByExpr.set(ahName, visByKey.aa);
    }
  }

  applyConsonantVisemePresetFill(em, index, record, goalByExpr, vrm, bilabialDom);
}

/**
 * @param {import('@pixiv/three-vrm').VRM[]} vrms
 * @param {Record<string, number>} record
 * @param {number} lerp
 */
function driveFromWeightRecord(vrms, record, lerp) {
  if (!vrms?.length || !record || typeof record !== 'object') return;
  if (Object.keys(record).length === 0) return;

  const processed = preprocessFaceWeightRecord(record);

  for (const vrm of vrms) {
    if (!vrm?.expressionManager) continue;
    const em = vrm.expressionManager;
    const index = buildExpressionNormIndex(em);
    const goalByExpr = new Map();
    const splitBlinkNames = resolveBlinkSplitNames(em, index);

    for (const [weightKey, raw] of Object.entries(processed)) {
      if (PUSH_SKIP.has(weightKey)) continue;
      if (splitBlinkNames && (weightKey === 'eyes_closed_left' || weightKey === 'eyes_closed_right')) {
        continue;
      }
      const v = clamp01(raw);
      const exprName = resolveWeightKeyToExpression(index, weightKey);
      if (!exprName) continue;
      goalByExpr.set(exprName, Math.max(goalByExpr.get(exprName) ?? 0, v));
    }

    applyBrowInnerUpExpressionFill(index, processed, goalByExpr);
    applyBrowOuterUpExpressionFill(index, processed, goalByExpr);
    applyMouthSnareJawOpenFill(index, processed, goalByExpr);

    const usedSplitBlink = applySplitBlink(splitBlinkNames, processed, goalByExpr);
    applyVisemePresetFill(em, index, processed, goalByExpr, usedSplitBlink, vrm);
    applyEmotionCompositePresets(em, index, processed, goalByExpr, vrm);
    applyLookPresetFill(em, index, processed, goalByExpr);

    const prev = prevDrivenByVrm?.get(vrm);
    if (prev) {
      for (const name of prev) {
        if (!goalByExpr.has(name)) goalByExpr.set(name, 0);
      }
    }
    if (prevDrivenByVrm) prevDrivenByVrm.set(vrm, new Set(goalByExpr.keys()));

    applySmoothedGoals(vrm, em, goalByExpr, lerp);
  }
  markFaceExpressionDriverApplied();
}

/**
 * Apply WebXR-draft / native-bridge expression weights (same key names as XRExpression) to VRMs.
 * Used when OpenXR data is forwarded as a plain record (see nativeFaceBridge).
 *
 * @param {import('@pixiv/three-vrm').VRM[]} vrms
 * @param {Record<string, number>} record
 * @param {{ lerpFactor?: number }} options
 */
export function applyExpressionWeightRecordToVRMS(vrms, record, options = {}) {
  const lerp = typeof options.lerpFactor === 'number' ? options.lerpFactor : 0.28;
  driveFromWeightRecord(vrms, record, lerp);
}

/**
 * Pull XRFrame.expressions (if present) and drive VRM expressionManager.
 *
 * @param {import('@pixiv/three-vrm').VRM[]} vrms
 * @param {XRFrame|null|undefined} frame
 * @param {{ lerpFactor?: number }} options
 */
export function applyXRFrameExpressionsToVRMS(vrms, frame, options = {}) {
  const lerp = typeof options.lerpFactor === 'number' ? options.lerpFactor : 0.28;
  if (!vrms?.length || !frame) return;

  const xrExpr = /** @type {any} */ (frame).expressions;
  const rec = extractExpressionRecord(xrExpr);
  if (!xrExpr || Object.keys(rec).length === 0) return;

  driveFromWeightRecord(vrms, rec, lerp);
}

/** Optional one-shot console probe when ?xrExpressionProbe=1 */
let probeXRFrameLogged = false;

/**
 * Diagnostic: log XRFrame introspection once (helps validate Galaxy XR / Chrome previews).
 */
export function maybeProbeXRFrame(frame, session) {
  if (probeXRFrameLogged || typeof window === 'undefined') return;
  try {
    if (!/\bxrExpressionProbe=1\b/.test(window.location.search || '')) return;
    probeXRFrameLogged = true;

    console.info('[XR][expression probe]', {
      hasExpressions: !!(frame && 'expressions' in frame),
      expressionsType:
        /** @type {any} */
        frame?.expressions != null ? typeof /** @type {any} */ (frame).expressions : 'none',
      enabledFeatures:
        typeof session?.enabledFeatures?.includes === 'function'
          ? Array.from(session.enabledFeatures || [])
          : session?.enabledFeatures,
    });

    /** @type {any} */
    const f = frame;
    console.info('[XR][expression probe] ownKeys(frame)', Reflect.ownKeys(Object(f)));
  } catch (_) {
    /* noop */
  }
}
