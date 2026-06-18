/**
 * Infer WebXR-style face weights from MediaPipe landmarks (0–1 space, before Kalidokit mutates them).
 */

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function remap(v, inMin, inMax) {
  if (inMax <= inMin) return 0;
  return clamp01((v - inMin) / (inMax - inMin));
}

function lmDist(lm, i, j) {
  const a = lm[i];
  const b = lm[j];
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const BROW_LEFT = [35, 244, 63, 105, 66, 229, 230, 231];
const BROW_RIGHT = [265, 464, 293, 334, 296, 449, 450, 451];

/** Running neutral snapshot for webcam-only baseline (does not touch XR native baseline). */
let webcamNeutral = null;
let webcamNeutralFrames = 0;
const NEUTRAL_CAPTURE_FRAMES = 24;

export function resetWebcamFaceNeutralBaseline() {
  webcamNeutral = null;
  webcamNeutralFrames = 0;
}

function ensureNormalized01(lm, imageSize) {
  if (!lm?.length) return lm;
  const w = imageSize?.width || 0;
  const h = imageSize?.height || 0;
  const maxX = lm.reduce((m, p) => Math.max(m, p?.x ?? 0), 0);
  const maxY = lm.reduce((m, p) => Math.max(m, p?.y ?? 0), 0);
  if (maxX <= 1.5 && maxY <= 1.5) return lm;
  if (w < 2 || h < 2) return lm;
  return lm.map((p) => ({
    x: p.x / w,
    y: p.y / h,
    z: p.z,
    visibility: p.visibility,
  }));
}

function browRaiseSide(lm, side) {
  const pts = side === 'left' ? BROW_LEFT : BROW_RIGHT;
  if (lm.length < 478) return 0;
  const p0 = lm[pts[0]];
  const p1 = lm[pts[1]];
  const p2 = lm[pts[2]];
  const p3 = lm[pts[3]];
  const p4 = lm[pts[4]];
  const p5 = lm[pts[5]];
  const p6 = lm[pts[6]];
  const p7 = lm[pts[7]];
  if (!p0 || !p7) return 0;

  const eyeW = Math.hypot(p0.x - p1.x, p0.y - p1.y) || 1e-6;
  const outer = Math.hypot(p0.x - p4.x, p0.y - p4.y);
  const mid = Math.hypot(p2.x - p5.x, p2.y - p5.y);
  const inner = Math.hypot(p3.x - p6.x, p3.y - p6.y);
  const avg = (outer + mid + inner) / 3;
  const ratio = avg / eyeW;
  const browRatio = ratio / 1.15 - 1;
  return remap(browRatio, 0.07, 0.125);
}

/** Smile = corners above lip center (image Y down). */
function lipCornerPullSide(lm, cornerIdx, eyeInner) {
  const centerY = (lm[13].y + lm[14].y) * 0.5;
  const d = (centerY - lm[cornerIdx].y) / Math.max(eyeInner, 1e-6);
  return remap(d, 0.045, 0.14);
}

function lipCornerDepressSide(lm, cornerIdx, eyeInner) {
  const centerY = (lm[13].y + lm[14].y) * 0.5;
  const d = (lm[cornerIdx].y - centerY) / Math.max(eyeInner, 1e-6);
  return remap(d, 0.03, 0.12);
}

function applyWebcamNeutralDelta(record) {
  if (!record || typeof record !== 'object') return record;

  if (webcamNeutralFrames < NEUTRAL_CAPTURE_FRAMES) {
    if (!webcamNeutral) webcamNeutral = {};
    for (const [k, v] of Object.entries(record)) {
      if (typeof v !== 'number' || Number.isNaN(v)) continue;
      webcamNeutral[k] = (webcamNeutral[k] ?? 0) + v;
    }
    webcamNeutralFrames += 1;
    if (webcamNeutralFrames >= NEUTRAL_CAPTURE_FRAMES) {
      for (const k of Object.keys(webcamNeutral)) {
        webcamNeutral[k] /= NEUTRAL_CAPTURE_FRAMES;
      }
    }
    return {};
  }

  if (!webcamNeutral) return record;

  const out = { ...record };
  for (const k of Object.keys(out)) {
    if (typeof out[k] !== 'number') continue;
    const base = webcamNeutral[k] ?? 0;
    out[k] = clamp01(out[k] - base);
  }
  return out;
}

/**
 * @param {Array<{x:number,y:number,z?:number}>} faceLm — clone in 0–1 space (before Face.solve).
 * @param {object|null} faceRig — Kalidokit Face.solve() (eyes, pupil, mouth.y).
 * @param {{ width?: number, height?: number }} [imageSize]
 */
export function inferMediaPipeFaceWeightRecord(faceLm, faceRig, imageSize = null) {
  if (!faceLm?.length || faceLm.length < 468) return {};

  const lm = ensureNormalized01(faceLm, imageSize);
  const eyeInner = lmDist(lm, 133, 362) || 0.08;
  const mouthOpen = lmDist(lm, 13, 14) / eyeInner;
  const mouthWidth = lmDist(lm, 61, 291) / eyeInner;

  const eyeOpenL = faceRig?.eye?.l ?? 1;
  const eyeOpenR = faceRig?.eye?.r ?? 1;
  const eyes_closed_left = clamp01(1 - eyeOpenL);
  const eyes_closed_right = clamp01(1 - eyeOpenR);

  const browL = browRaiseSide(lm, 'left');
  const browR = browRaiseSide(lm, 'right');

  const pullL = lipCornerPullSide(lm, 61, eyeInner);
  const pullR = lipCornerPullSide(lm, 291, eyeInner);
  const depL = lipCornerDepressSide(lm, 61, eyeInner);
  const depR = lipCornerDepressSide(lm, 291, eyeInner);

  const jaw_drop = remap(mouthOpen, 0.09, 0.42);
  const lip_stretcher = remap((mouthWidth - 0.52) * 2.5, 0, 1);

  const lips_toward = remap(faceRig?.mouth?.y ?? mouthOpen * 0.45, 0.15, 0.58);

  const cheek_raiser_left = clamp01(pullL * 0.72);
  const cheek_raiser_right = clamp01(pullR * 0.72);

  const noseTip = lm[1];
  const noseBridge = lm[6];
  const noseWrinkle =
    noseTip && noseBridge
      ? remap(Math.abs(noseTip.y - noseBridge.y) / eyeInner, 0.025, 0.1)
      : 0;

  const inner_brow_raiser_left = browL;
  const inner_brow_raiser_right = browR;
  const outer_brow_raiser_left = clamp01(browL * 1.02);
  const outer_brow_raiser_right = clamp01(browR * 1.02);

  const brow_lowerer_left = clamp01(remap(0.12 - browL, 0, 0.12) + depL * 0.35);
  const brow_lowerer_right = clamp01(remap(0.12 - browR, 0, 0.12) + depR * 0.35);

  const upper_lid_raiser_left = clamp01(outer_brow_raiser_left * 0.7);
  const upper_lid_raiser_right = clamp01(outer_brow_raiser_right * 0.7);

  const lid_tightener_left = clamp01(noseWrinkle * 0.45 + brow_lowerer_left * 0.25);
  const lid_tightener_right = clamp01(noseWrinkle * 0.45 + brow_lowerer_right * 0.25);

  const pupilX = faceRig?.pupil?.x ?? 0;
  const pupilY = faceRig?.pupil?.y ?? 0;
  const lookUp = remap(-pupilY, 0.1, 0.4);
  const lookDown = remap(pupilY, 0.1, 0.4);
  const lookLeft = remap(-pupilX, 0.1, 0.4);
  const lookRight = remap(pupilX, 0.1, 0.4);

  const raw = {
    eyes_closed_left,
    eyes_closed_right,
    jaw_drop,
    jaw_thrust: jaw_drop * 0.3,
    lips_toward,
    lip_stretcher_left: lip_stretcher,
    lip_stretcher_right: lip_stretcher,
    lip_corner_puller_left: pullL,
    lip_corner_puller_right: pullR,
    lip_corner_depressor_left: depL,
    lip_corner_depressor_right: depR,
    cheek_raiser_left,
    cheek_raiser_right,
    inner_brow_raiser_left,
    inner_brow_raiser_right,
    outer_brow_raiser_left,
    outer_brow_raiser_right,
    brow_lowerer_left,
    brow_lowerer_right,
    upper_lid_raiser_left,
    upper_lid_raiser_right,
    lid_tightener_left,
    lid_tightener_right,
    nose_wrinkler_left: noseWrinkle,
    nose_wrinkler_right: noseWrinkle,
    lip_pressor_left: clamp01(lips_toward * 0.35 * (1 - jaw_drop)),
    lip_pressor_right: clamp01(lips_toward * 0.35 * (1 - jaw_drop)),
    lip_tightener_left: clamp01(lips_toward * 0.25),
    lip_tightener_right: clamp01(lips_toward * 0.25),
    dimpler_left: clamp01(brow_lowerer_left * 0.3),
    dimpler_right: clamp01(brow_lowerer_right * 0.3),
    eyes_look_up_left: lookUp,
    eyes_look_up_right: lookUp,
    eyes_look_down_left: lookDown,
    eyes_look_down_right: lookDown,
    eyes_look_left_left: lookLeft,
    eyes_look_left_right: lookLeft,
    eyes_look_right_left: lookRight,
    eyes_look_right_right: lookRight,
  };

  return applyWebcamNeutralDelta(raw);
}
