/**
 * Maps OpenXR **XR_ANDROID_face_tracking** blend indices (`XrFaceParameterIndicesANDROID`)
 * to WebXR Expression Tracking draft **string keys** used by
 * {@link inferVRMMorphTargets} in `xrExpressionTrackingDriver.js`.
 *
 * Spec: https://registry.khronos.org/OpenXR/specs/1.1/man/html/XrFaceParameterIndicesANDROID.html
 * Face state: https://registry.khronos.org/OpenXR/specs/1.1/man/html/XrFaceStateANDROID.html
 */

/** Count of scalar parameters (indices `0` … `67`); not including `MAX_ENUM`. */
export const XR_ANDROID_FACE_PARAMETER_COUNT = 68;

/**
 * WebXR key for each OpenXR parameter index, in order.
 * Indices 63–67 are tongue shapes (not in the WebXR draft list but safe to pass; heuristics ignore unknowns).
 */
export const OPENXR_ANDROID_FACE_PARAMETER_WEBXR_KEYS = Object.freeze([
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
  'tongue_out',
  'tongue_left',
  'tongue_right',
  'tongue_up',
  'tongue_down'
]);

/**
 * @param {ArrayLike<number | string>} parameters - `XrFaceStateANDROID.parameters` (length typically {@link XR_ANDROID_FACE_PARAMETER_COUNT})
 * @param {{ includeZero?: boolean }} [options] - default omits zero weights to keep records small
 * @returns {Record<string, number>}
 */
export function openxrFloatParametersToWebXRRecord(parameters, options = {}) {
  const includeZero = options.includeZero === true;
  /** @type {Record<string, number>} */
  const rec = {};
  if (!parameters || !parameters.length) return rec;

  const n = Math.min(parameters.length, OPENXR_ANDROID_FACE_PARAMETER_WEBXR_KEYS.length);
  for (let i = 0; i < n; i++) {
    const raw = parameters[i];
    const v = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isNaN(v)) continue;
    if (!includeZero && v === 0) continue;
    const key = OPENXR_ANDROID_FACE_PARAMETER_WEBXR_KEYS[i];
    if (key) rec[key] = v;
  }
  return rec;
}
