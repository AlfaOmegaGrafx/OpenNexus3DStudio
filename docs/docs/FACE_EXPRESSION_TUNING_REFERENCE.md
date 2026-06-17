# Face expression tuning reference (WebXR / native → VRM)

This document is the **checkpoint baseline** for `src/library/xrExpressionTrackingDriver.js`. When adjusting mouth, smile, or emotion composites, prefer small deltas from these values so results can be compared or reverted.

## Pipeline (unchanged concepts)

1. **Neutral baseline** — First snapshot or explicit `setFaceExpressionNeutralBaselineFromRecord`; subsequent frames are deltas.
2. **Lateral mirror** — All `_left` / `_right` tracker pairs are swapped (`MIRROR_FACE_TRACKING_LATERAL`) so the avatar matches a mirror view.
3. **Brow raiser polarity** — Inner/outer brow raiser weights are **not** flipped (`1−v`); raise → higher delta after neutral.
3. **Preprocess** — Sideways mouth damp (when mouth not clearly open), lip-seal gate, eye/brow/look gains, lip corner puller gain.
4. **`inferVRMMorphTargets`** — Blink + preset visemes (`aa`, `ee`, `ih`, `oh`, `ou`) with jaw vs sideways de-bleed, lip seal on jaw, angry-snarl gate on closed jaw.
5. **Emotion presets** — `happy` / `sad` / `angry` / `surprised` composites; `happy` is scaled down when fine-grained smile cues are already mapped.

## Constants (baseline snapshot)

| Symbol | Value | Role |
|--------|------:|------|
| `JAW_SIDEWAYS_MOUTH_GATE` | 0.04 | Sideways magnitude above which mouth damp starts |
| `JAW_SIDEWAYS_MOUTH_SUPPRESS` | 0.4 | Strength of damp on `MOUTH_BASELINE_KEYS` |
| `JAW_SIDEWAYS_OFF_WHEN_MOUTH_OPEN` | 0.095 | Skip sideways damp / shrink when `max(jaw_drop, jaw_thrust, lips_toward×0.62)` ≥ this |
| `JAW_SIDEWAYS_OPEN_COMBO_SIDEWAYS` | 0.14 | With jaw ≥ `OPEN_COMBO_JAW`, lateral jaw above this also skips damp (open-mouth shrug when jaw reads slightly low) |
| `JAW_SIDEWAYS_OPEN_COMBO_JAW` | 0.062 | Min processed jaw_drop/thrust for that combo (above closed-mouth bleed) |
| `JAW_SIDEWAYS_CLOSED_MOUTH_GAIN` | 1.28 | Multiply `jaw_sideways_left` / `right` only when damp applies (closed-mouth shrug boost) |
| `LIP_CORNER_PULLER_GAIN` | 1.38 | Post-delta multiplier on `lip_corner_puller_*` |
| `AA_JAW_COEFF` | 0.58 | `aa` linear mix from jaw |
| `AA_LIPS_TOWARD_COEFF` | 0.11 | `aa` from lips toward |
| `AA_UPPER_LIP_COEFF` | 0.07 | `aa` from upper lip raiser |
| `AA_OPEN_EXPONENT` | 1.22 | Curve on positive `aa` linear |
| `LIP_SEAL_ACTIVATE_ABOVE` | 0.26 | Lip tightener threshold for seal path |
| `LIP_SEAL_STRENGTH` | 0.42 | Seal blend strength |
| `MOUTH_SEAL_JAW_SUPPRESS` | 0.38 | How much lip seal pulls heuristic jaw |
| `EYE_BROW_GAIN` | 1.18 | Periorbital / brow |
| `EYE_LOOK_GAIN` | 1.32 | Gaze aggregation |

### Sideways shrink (inside `inferVRMMorphTargets`)

- If `jawRaw >= JAW_SIDEWAYS_OFF_WHEN_MOUTH_OPEN`, or **open-mouth shrug** (`sidewaysMag > OPEN_COMBO_SIDEWAYS` and `jawRaw >= OPEN_COMBO_JAW`): sideways does not shrink jaw.
- Else: `min(1, sidewaysMag × 0.88) × clamp01(1 − jawRaw × 2.15)`.

### Angry closed-mouth gate (inside `inferVRMMorphTargets`)

- `angrySnarl` = weighted mix of brow lowerer, nose wrinkler, lid tightener (pairs averaged).
- If `angrySnarl > 0.36` and `jawRaw < 0.17`: scale heuristic `jaw` down by up to ~52% at full snarl so preset `aa` does not read “open” on a closed angry mouth. Real openness (`jawRaw` high) skips this.

### Lip pucker vs open mouth (preprocess + `inferVRMMorphTargets`)

When average pucker/funneler ≥ `LIP_PUCKER_SUPPRESS_OPEN_AT` (0.13) and pucker **dominates** jaw (`puckerAvg > jaw × 1.35 + 0.06`), **unless** the mouth is clearly open (`jaw ≥ 0.25` and `jaw > puckerAvg × 1.02`), attenuate `jaw_drop`, `jaw_thrust`, and `lips_toward` in preprocess; in viseme inference use `jawForOpen` and reduced `lipsTowardAa` / `upperLipAa` for **`aa`** and for **`jawOh` / `jawOu`** so forward lips do not read as a wide jaw-down open mouth.

### Closed-lip smile vs open mouth (`inferVRMMorphTargets`)

When smile (corners / cheek) is above `CLOSED_SMILE_AA_SUPPRESS_AT` (0.22), `jawRaw` is below `CLOSED_SMILE_JAW_CAP_FOR_BLEED` (0.14), and either lip pressors or seal exceed small gates, **`aa`** and smile-driven **`ee` / `ih`** are scaled down so a closed smile does not read as a wide-open mouth.

### Preset `oh` / `ou` (no pucker term)

`oh` and `ou` use `lips_toward`, `jawOh` / `jawOu`, and `lip_stretcher` average only — **not** `puckerAvg`, so lip pucker does not fire the same blendshape as a spoken “O”, and real vowel **oh** stays jaw-driven.

### Lip sync merge (`setXRDriverLipSyncVisemeOverride` + `isFaceExpressionDriverFresh`)

FFT lip sync from `lipsync.js` writes per-VRM overrides; `applyVisemePresetFill` blends `xr * (1 − strength) + lip * strength` for `aa` / `ee` / `ih` / `oh` / `ou`. When face tracking is fresh (~140 ms), LipSync skips direct `setValue` on those presets so XR smoothing is not overwritten. While speaking, **`happy`** is multiplied down slightly from viseme activity so the mouth can move with vowels.

### Happy composite (inside `applyEmotionCompositePresets`)

- Smile from corners ×1.08 vs cheek ×0.95 max.
- `happy = clamp01(smile × 1.26 − frownMouth × 0.38 − lowerLip × 0.18)` before cross-emotion mixes.
- When fine-grained expressions already cover smile cues: `happy *= 0.72` (was lower before this baseline).

## Reverting

Use git history on `xrExpressionTrackingDriver.js` with this file as the **semantic** baseline: search for the constants above or for `FACE_EXPRESSION_TUNING_REFERENCE` in the driver file header.
