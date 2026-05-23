import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractExpressionRecord,
  inferVRMMorphTargets,
  inferConsonantVisemes,
  inferLookFromEyeWeights,
  preprocessFaceWeightRecord,
  mirrorFaceWeightRecordLateral,
  resetFaceExpressionNeutralBaseline,
  setFaceExpressionNeutralBaselineFromRecord,
  applyXRFrameExpressionsToVRMS,
  applyExpressionWeightRecordToVRMS,
  setXRDriverLipSyncVisemeOverride,
  clearXRDriverLipSyncVisemeOverride,
  computeBilabialMouthClosureDominance,
} from '../library/xrExpressionTrackingDriver.js';

describe('xrExpressionTrackingDriver', () => {
  beforeEach(() => {
    resetFaceExpressionNeutralBaseline();
    setFaceExpressionNeutralBaselineFromRecord({});
  });

  it('extractExpressionRecord reads .get()', () => {
    const xr = {
      get: vi.fn((k) =>
        k === 'jaw_drop' ? 0.8 : k === 'eyes_closed_left' ? 0.5 : undefined
      )
    };
    const rec = extractExpressionRecord(xr);
    expect(rec.jaw_drop).toBeCloseTo(0.8);
    expect(rec.eyes_closed_left).toBeCloseTo(0.5);
  });

  it('first preprocess captures headset neutral and outputs zeros', () => {
    resetFaceExpressionNeutralBaseline();
    const p0 = preprocessFaceWeightRecord({
      jaw_drop: 0.22,
      brow_lowerer_left: 0.1,
      eyes_closed_left: 0.05,
    });
    expect(p0.jaw_drop).toBe(0);
    expect(p0.brow_lowerer_left).toBe(0);
    const p1 = preprocessFaceWeightRecord({
      jaw_drop: 0.52,
      brow_lowerer_left: 0.1,
      eyes_closed_left: 0.05,
    });
    expect(p1.jaw_drop).toBeCloseTo(0.3);
  });

  it('preprocessFaceWeightRecord uses deltas from explicit neutral for jaw and eyes', () => {
    setFaceExpressionNeutralBaselineFromRecord({
      jaw_drop: 0.17,
      eyes_closed_left: 0.1,
      lip_tightener_left: 0,
      lip_tightener_right: 0,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      jaw_thrust: 0,
      lips_toward: 0
    });
    const p = preprocessFaceWeightRecord({
      jaw_drop: 0.14,
      eyes_closed_left: 0.4,
      lip_tightener_left: 0,
      lip_tightener_right: 0,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      jaw_thrust: 0,
      lips_toward: 0
    });
    expect(p.jaw_drop).toBeLessThan(0.05);
    expect(p.eyes_closed_right).toBeGreaterThan(0.28);
  });

  it('mirrorFaceWeightRecordLateral swaps left and right channels', () => {
    const m = mirrorFaceWeightRecordLateral({
      eyes_closed_left: 0.2,
      eyes_closed_right: 0.9,
      inner_brow_raiser_left: 0.4,
      lip_funneler_left_top: 0.7,
      eyes_look_left_left: 0.8,
      eyes_look_left_right: 0.1,
    });
    expect(m.eyes_closed_left).toBeCloseTo(0.9);
    expect(m.eyes_closed_right).toBeCloseTo(0.2);
    expect(m.inner_brow_raiser_right).toBeCloseTo(0.4);
    expect(m.lip_funneler_right_top).toBeCloseTo(0.7);
    expect(m.eyes_look_left_left).toBeCloseTo(0.1);
    expect(m.eyes_look_left_right).toBeCloseTo(0.8);
  });

  it('preprocessFaceWeightRecord strips weak contralateral blink when the other eye dominates', () => {
    setFaceExpressionNeutralBaselineFromRecord({
      eyes_closed_left: 0,
      eyes_closed_right: 0,
      jaw_drop: 0,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      jaw_thrust: 0,
      lips_toward: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0,
      lip_pressor_left: 0,
      lip_pressor_right: 0,
    });
    const p = preprocessFaceWeightRecord({
      eyes_closed_left: 0.11,
      eyes_closed_right: 0.88,
      jaw_drop: 0,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      jaw_thrust: 0,
      lips_toward: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0,
      lip_pressor_left: 0,
      lip_pressor_right: 0,
    });
    expect(p.eyes_closed_right).toBeLessThan(0.04);
    expect(p.eyes_closed_left).toBeGreaterThan(0.55);
  });

  it('preprocessFaceWeightRecord pulls down low jaw when sideways is high (closed mouth / bleed)', () => {
    setFaceExpressionNeutralBaselineFromRecord({
      jaw_drop: 0,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      jaw_thrust: 0,
      lips_toward: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0
    });
    const p = preprocessFaceWeightRecord({
      jaw_drop: 0.05,
      jaw_sideways_left: 0.55,
      jaw_sideways_right: 0,
      jaw_thrust: 0,
      lips_toward: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0
    });
    expect(p.jaw_drop).toBeLessThan(0.04);
  });

  it('preprocessFaceWeightRecord keeps modest jaw open during strong sideways (open-mouth shrug combo)', () => {
    setFaceExpressionNeutralBaselineFromRecord({
      jaw_drop: 0,
      jaw_thrust: 0,
      lips_toward: 0,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0,
    });
    const p = preprocessFaceWeightRecord({
      jaw_drop: 0.09,
      jaw_thrust: 0,
      lips_toward: 0,
      jaw_sideways_left: 0.52,
      jaw_sideways_right: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0,
    });
    expect(p.jaw_drop).toBeGreaterThan(0.065);
  });

  it('preprocessFaceWeightRecord does not crush open mouth when jaw moves sideways', () => {
    setFaceExpressionNeutralBaselineFromRecord({
      jaw_drop: 0,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      jaw_thrust: 0,
      lips_toward: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0
    });
    const p = preprocessFaceWeightRecord({
      jaw_drop: 0.95,
      jaw_sideways_left: 0.6,
      jaw_sideways_right: 0,
      jaw_thrust: 0,
      lips_toward: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0
    });
    expect(p.jaw_drop).toBeGreaterThan(0.45);
  });

  it('preprocessFaceWeightRecord brow raiser rises when tracker weight increases (no polarity flip)', () => {
    setFaceExpressionNeutralBaselineFromRecord({
      inner_brow_raiser_left: 0.12,
      outer_brow_raiser_right: 0.15
    });
    const raised = preprocessFaceWeightRecord({
      inner_brow_raiser_left: 0.55,
      outer_brow_raiser_right: 0.72
    });
    expect(raised.inner_brow_raiser_right).toBeGreaterThan(0.28);
    expect(raised.outer_brow_raiser_left).toBeGreaterThan(0.35);

    const lowered = preprocessFaceWeightRecord({
      inner_brow_raiser_left: 0.05,
      outer_brow_raiser_right: 0.06
    });
    expect(lowered.inner_brow_raiser_right).toBeLessThan(0.06);
    expect(lowered.outer_brow_raiser_left).toBeLessThan(0.06);
  });

  it('preprocessFaceWeightRecord brow lowerer delta near zero when unchanged from neutral', () => {
    setFaceExpressionNeutralBaselineFromRecord({
      brow_lowerer_left: 0.14,
      brow_lowerer_right: 0.15
    });
    const p = preprocessFaceWeightRecord({
      brow_lowerer_left: 0.14,
      brow_lowerer_right: 0.15
    });
    expect(p.brow_lowerer_left).toBeLessThan(0.02);
    expect(p.brow_lowerer_right).toBeLessThan(0.02);
  });

  it('inferLookFromEyeWeights aggregates per-eye gaze into four directions', () => {
    const lk = inferLookFromEyeWeights({
      eyes_look_up_left: 0.2,
      eyes_look_up_right: 0.6,
      eyes_look_left_left: 0.4,
      eyes_look_left_right: 0.55,
      eyes_look_right_left: 0.1,
      eyes_look_right_right: 0.05,
      eyes_look_down_left: 0.3,
      eyes_look_down_right: 0.25
    });
    expect(lk.lookUp).toBeCloseTo(0.6);
    expect(lk.lookLeft).toBeCloseTo(0.55);
    expect(lk.lookDown).toBeCloseTo(Math.hypot(0.3, 0.4) * 0.94);
    expect(lk.lookRight).toBeCloseTo(Math.hypot(0.6, 0.05) * 0.94);
  });

  it('inferLookFromEyeWeights boosts diagonal gaze (e.g. up-left) on same eye', () => {
    const lk = inferLookFromEyeWeights({
      eyes_look_up_left: 0.48,
      eyes_look_left_left: 0.52,
      eyes_look_up_right: 0.04,
      eyes_look_left_right: 0.05,
      eyes_look_down_left: 0,
      eyes_look_down_right: 0,
      eyes_look_right_left: 0,
      eyes_look_right_right: 0
    });
    const diag = Math.hypot(0.48, 0.52) * 0.94;
    expect(Math.max(0.48, 0.04, diag)).toBe(diag);
    expect(lk.lookUp).toBeCloseTo(diag, 5);
    expect(lk.lookLeft).toBeCloseTo(diag, 5);
  });

  it('inferVRMMorphTargets maps blink and mouth heuristically', () => {
    const t = inferVRMMorphTargets({
      eyes_closed_left: 1,
      eyes_closed_right: 0,
      jaw_drop: 0.4,
      lip_pucker_left: 0.2,
      lip_pucker_right: 0.2,
      lip_stretcher_left: 0.3,
      lip_stretcher_right: 0.3,
      lips_toward: 0.1
    });
    expect(t.blink).toBe(1);
    expect(t.aa).toBeGreaterThan(0);
    expect(t.ee).toBeGreaterThan(0);
    expect(t.oh).toBeGreaterThan(0);
  });

  it('inferVRMMorphTargets reduces aa for angry snarl when jaw is actually closed', () => {
    const open = inferVRMMorphTargets({
      jaw_drop: 0.35,
      brow_lowerer_left: 0.7,
      brow_lowerer_right: 0.7,
      nose_wrinkler_left: 0.55,
      nose_wrinkler_right: 0.55,
      lid_tightener_left: 0.5,
      lid_tightener_right: 0.5
    });
    const closed = inferVRMMorphTargets({
      jaw_drop: 0.06,
      brow_lowerer_left: 0.72,
      brow_lowerer_right: 0.72,
      nose_wrinkler_left: 0.58,
      nose_wrinkler_right: 0.58,
      lid_tightener_left: 0.52,
      lid_tightener_right: 0.52
    });
    expect(open.aa).toBeGreaterThan(closed.aa);
    expect(closed.aa).toBeLessThan(open.aa * 0.75);
  });

  it('preprocessFaceWeightRecord attenuates jaw when lip pucker dominates (closed forward lips)', () => {
    setFaceExpressionNeutralBaselineFromRecord({
      jaw_drop: 0,
      jaw_thrust: 0,
      lips_toward: 0,
      lip_pucker_left: 0,
      lip_pucker_right: 0,
      lip_funneler_left_bottom: 0,
      lip_funneler_right_bottom: 0,
      lip_funneler_left_top: 0,
      lip_funneler_right_top: 0,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0
    });
    const p = preprocessFaceWeightRecord({
      jaw_drop: 0.28,
      jaw_thrust: 0,
      lips_toward: 0.35,
      lip_pucker_left: 0.72,
      lip_pucker_right: 0.7,
      lip_funneler_left_bottom: 0.55,
      lip_funneler_right_bottom: 0.58,
      lip_funneler_left_top: 0.52,
      lip_funneler_right_top: 0.54,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0
    });
    expect(p.jaw_drop).toBeLessThan(0.16);
    expect(p.lips_toward).toBeLessThan(0.28);
  });

  it('preprocess + infer damp false open mouth on pursed lips (tightener + press, weak pucker)', () => {
    setFaceExpressionNeutralBaselineFromRecord({
      jaw_drop: 0,
      jaw_thrust: 0,
      lips_toward: 0,
      lip_pucker_left: 0,
      lip_pucker_right: 0,
      lip_funneler_left_bottom: 0,
      lip_funneler_right_bottom: 0,
      lip_funneler_left_top: 0,
      lip_funneler_right_top: 0,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0,
      lip_pressor_left: 0,
      lip_pressor_right: 0,
    });
    const pursed = preprocessFaceWeightRecord({
      jaw_drop: 0.12,
      jaw_thrust: 0,
      lips_toward: 0.52,
      lip_pucker_left: 0.07,
      lip_pucker_right: 0.07,
      lip_funneler_left_bottom: 0.05,
      lip_funneler_right_bottom: 0.05,
      lip_funneler_left_top: 0.05,
      lip_funneler_right_top: 0.05,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      lip_tightener_left: 0.36,
      lip_tightener_right: 0.34,
      lip_pressor_left: 0.3,
      lip_pressor_right: 0.28,
    });
    expect(pursed.jaw_drop).toBeLessThan(0.09);
    expect(pursed.lips_toward).toBeLessThan(0.44);
    const visPursed = inferVRMMorphTargets(pursed);
    const visLoose = inferVRMMorphTargets({
      jaw_drop: pursed.jaw_drop,
      jaw_thrust: pursed.jaw_thrust,
      lips_toward: pursed.lips_toward,
      lip_pucker_left: 0.07,
      lip_pucker_right: 0.07,
      lip_funneler_left_bottom: 0.05,
      lip_funneler_right_bottom: 0.05,
      lip_funneler_left_top: 0.05,
      lip_funneler_right_top: 0.05,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0,
      lip_pressor_left: 0,
      lip_pressor_right: 0,
    });
    expect(visPursed.oh).toBeLessThan(visLoose.oh);
    expect(visPursed.aa).toBeLessThan(visLoose.aa * 0.78);
    expect(visPursed.oh).toBeLessThan(visLoose.oh * 0.8);
  });

  it('preprocessFaceWeightRecord does not crush jaw when mouth is clearly open with pucker', () => {
    setFaceExpressionNeutralBaselineFromRecord({
      jaw_drop: 0,
      jaw_thrust: 0,
      lips_toward: 0,
      lip_pucker_left: 0,
      lip_pucker_right: 0,
      lip_funneler_left_bottom: 0,
      lip_funneler_right_bottom: 0,
      lip_funneler_left_top: 0,
      lip_funneler_right_top: 0,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0
    });
    const p = preprocessFaceWeightRecord({
      jaw_drop: 0.45,
      jaw_thrust: 0,
      lips_toward: 0.1,
      lip_pucker_left: 0.35,
      lip_pucker_right: 0.35,
      lip_funneler_left_bottom: 0.2,
      lip_funneler_right_bottom: 0.2,
      lip_funneler_left_top: 0.2,
      lip_funneler_right_top: 0.2,
      jaw_sideways_left: 0,
      jaw_sideways_right: 0,
      lip_tightener_left: 0,
      lip_tightener_right: 0
    });
    expect(p.jaw_drop).toBeGreaterThan(0.35);
  });

  it('inferVRMMorphTargets keeps aa when jaw is open despite sideways', () => {
    const t = inferVRMMorphTargets({
      jaw_drop: 0.42,
      jaw_sideways_left: 0.62,
      jaw_sideways_right: 0,
      lips_toward: 0.05
    });
    const closedSideways = inferVRMMorphTargets({
      jaw_drop: 0.05,
      jaw_sideways_left: 0.62,
      jaw_sideways_right: 0,
      lips_toward: 0.05
    });
    expect(t.aa).toBeGreaterThan(closedSideways.aa * 2);
  });

  it('inferVRMMorphTargets keeps aa low when pucker dominates closed mouth', () => {
    const pucker = inferVRMMorphTargets({
      jaw_drop: 0.18,
      jaw_thrust: 0,
      lip_pucker_left: 0.75,
      lip_pucker_right: 0.75,
      lip_funneler_left_bottom: 0.55,
      lip_funneler_right_bottom: 0.55,
      lip_funneler_left_top: 0.5,
      lip_funneler_right_top: 0.5,
      lips_toward: 0.25,
      upper_lip_raiser_left: 0.1,
      upper_lip_raiser_right: 0.1
    });
    const open = inferVRMMorphTargets({
      jaw_drop: 0.45,
      jaw_thrust: 0,
      lip_pucker_left: 0.05,
      lip_pucker_right: 0.05,
      lip_funneler_left_bottom: 0,
      lip_funneler_right_bottom: 0,
      lip_funneler_left_top: 0,
      lip_funneler_right_top: 0,
      lips_toward: 0.05
    });
    expect(pucker.aa).toBeLessThan(open.aa * 0.35);
    expect(pucker.oh).toBeLessThan(0.22);
  });

  it('inferVRMMorphTargets lowers aa for closed-lip smile vs open mouth smile', () => {
    const closed = inferVRMMorphTargets({
      jaw_drop: 0.04,
      jaw_thrust: 0,
      lip_corner_puller_left: 0.62,
      lip_corner_puller_right: 0.62,
      cheek_raiser_left: 0.55,
      cheek_raiser_right: 0.55,
      lip_pressor_left: 0.18,
      lip_pressor_right: 0.18,
      lip_tightener_left: 0.22,
      lip_tightener_right: 0.22,
      lip_stretcher_left: 0.35,
      lip_stretcher_right: 0.35,
      lips_toward: 0.05,
    });
    const openSmile = inferVRMMorphTargets({
      jaw_drop: 0.38,
      jaw_thrust: 0,
      lip_corner_puller_left: 0.55,
      lip_corner_puller_right: 0.55,
      cheek_raiser_left: 0.5,
      cheek_raiser_right: 0.5,
      lip_pressor_left: 0,
      lip_pressor_right: 0,
      lip_tightener_left: 0.05,
      lip_tightener_right: 0.05,
      lip_stretcher_left: 0.3,
      lip_stretcher_right: 0.3,
      lips_toward: 0.08,
    });
    expect(closed.aa).toBeLessThan(openSmile.aa * 0.55);
  });

  it('applyXRFrameExpressionsToVRMS invokes setValue through expression manager', () => {
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { aa: {}, blink: {}, ee: {}, oh: {}, ou: {}, ih: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update,
    };

    /** @type {any} */
    const frame = {
      expressions: new Map([
        ['jaw_drop', 1],
        ['eyes_closed_left', 1],
        ['eyes_closed_right', 1]
      ])
    };

    /** @type {any} */
    const vrm = { expressionManager: em };

    applyXRFrameExpressionsToVRMS([vrm], frame, { lerpFactor: 1 });

    expect(setValue.mock.calls.length).toBeGreaterThan(3);
    expect(update).toHaveBeenCalled();
  });

  it('applyExpressionWeightRecordToVRMS blends lip sync vowels into ee when override is set', () => {
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { aa: {}, blink: {}, ee: {}, oh: {}, ou: {}, ih: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update,
    };
    /** @type {any} */
    const vrm = { expressionManager: em };
    setXRDriverLipSyncVisemeOverride(vrm, { strength: 0.9, ee: 0.75, aa: 0.02, ih: 0.1, oh: 0.05, ou: 0.04 });
    applyExpressionWeightRecordToVRMS(
      [vrm],
      {
        jaw_drop: 0.06,
        eyes_closed_left: 0,
        eyes_closed_right: 0,
        lip_stretcher_left: 0.12,
        lip_stretcher_right: 0.12,
        upper_lip_raiser_left: 0.05,
        upper_lip_raiser_right: 0.05,
      },
      { lerpFactor: 1 }
    );
    const eeArg = setValue.mock.calls.find((c) => c[0] === 'ee')?.[1];
    expect(typeof eeArg === 'number' ? eeArg : 0).toBeGreaterThan(0.35);
    clearXRDriverLipSyncVisemeOverride(vrm);
  });

  it('applyExpressionWeightRecordToVRMS invokes setValue from plain record', () => {
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { aa: {}, blink: {}, ee: {}, oh: {}, ou: {}, ih: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update,
    };

    /** @type {any} */
    const vrm = { expressionManager: em };

    applyExpressionWeightRecordToVRMS([vrm], {
      jaw_drop: 1,
      eyes_closed_left: 1,
      eyes_closed_right: 1
    }, { lerpFactor: 1 });

    expect(setValue.mock.calls.length).toBeGreaterThan(3);
    expect(update).toHaveBeenCalled();
  });

  it('applyExpressionWeightRecordToVRMS no-ops on empty record', () => {
    const setValue = vi.fn();
    const em = { getExpression: () => null, setValue, update: vi.fn() };
    /** @type {any} */
    const vrm = { expressionManager: em };
    applyExpressionWeightRecordToVRMS([vrm], {}, { lerpFactor: 1 });
    expect(setValue).not.toHaveBeenCalled();
  });

  it('applyExpressionWeightRecordToVRMS drives happy preset from smile cues', () => {
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { happy: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update
    };
    /** @type {any} */
    const vrm = { expressionManager: em };

    applyExpressionWeightRecordToVRMS(
      [vrm],
      {
        lip_corner_puller_left: 0.95,
        lip_corner_puller_right: 0.95,
        cheek_raiser_left: 0.85,
        cheek_raiser_right: 0.85
      },
      { lerpFactor: 1 }
    );

    const happyCall = setValue.mock.calls.find((c) => c[0] === 'happy');
    expect(happyCall).toBeDefined();
    expect(happyCall[1]).toBeGreaterThan(0.35);
  });

  it('applyExpressionWeightRecordToVRMS drives blinkLeft and blinkRight independently', () => {
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { blinkLeft: {}, blinkRight: {}, aa: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update
    };
    /** @type {any} */
    const vrm = { expressionManager: em };

    applyExpressionWeightRecordToVRMS(
      [vrm],
      {
        eyes_closed_left: 0.85,
        eyes_closed_right: 0.15,
        jaw_drop: 0.05
      },
      { lerpFactor: 1 }
    );

    const leftCall = setValue.mock.calls.find((c) => c[0] === 'blinkLeft');
    const rightCall = setValue.mock.calls.find((c) => c[0] === 'blinkRight');
    expect(leftCall).toBeDefined();
    expect(rightCall).toBeDefined();
    expect(rightCall[1]).toBeGreaterThan(0.75);
    expect(leftCall[1]).toBeLessThan(0.35);
  });

  it('applyExpressionWeightRecordToVRMS keeps right wink from lifting left blink (contralateral strip)', () => {
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { blinkLeft: {}, blinkRight: {}, aa: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update
    };
    /** @type {any} */
    const vrm = { expressionManager: em };

    applyExpressionWeightRecordToVRMS(
      [vrm],
      {
        eyes_closed_left: 0.1,
        eyes_closed_right: 0.92,
        jaw_drop: 0.05
      },
      { lerpFactor: 1 }
    );

    const leftCall = setValue.mock.calls.find((c) => c[0] === 'blinkLeft');
    const rightCall = setValue.mock.calls.find((c) => c[0] === 'blinkRight');
    expect(leftCall).toBeDefined();
    expect(rightCall).toBeDefined();
    expect(rightCall[1]).toBeLessThan(0.08);
    expect(leftCall[1]).toBeGreaterThan(0.65);
  });

  it('inferConsonantVisemes activates PP when lips are pressed and closed', () => {
    const c = inferConsonantVisemes({
      lip_pressor_left: 0.7,
      lip_pressor_right: 0.7,
      lip_tightener_left: 0.55,
      lip_tightener_right: 0.55,
      lips_toward: 0.6,
      jaw_drop: 0.02,
    });
    expect(c.pp).toBeGreaterThan(0.3);
    expect(c.ss).toBeLessThan(0.05);
    expect(c.ch).toBeLessThan(0.1);
    expect(c.dd).toBeLessThan(0.1);
    expect(c.sil).toBe(0);
  });

  it('inferConsonantVisemes boosts PP when lips pucker with seal (pursed closure), without CH-wide stretch', () => {
    const c = inferConsonantVisemes({
      lip_pucker_left: 0.58,
      lip_pucker_right: 0.58,
      lip_funneler_left_bottom: 0.35,
      lip_funneler_right_bottom: 0.35,
      lip_funneler_left_top: 0.32,
      lip_funneler_right_top: 0.32,
      lip_pressor_left: 0.42,
      lip_pressor_right: 0.42,
      lip_tightener_left: 0.38,
      lip_tightener_right: 0.38,
      lip_stretcher_left: 0.12,
      lip_stretcher_right: 0.12,
      jaw_drop: 0.05,
    });
    expect(c.pp).toBeGreaterThan(0.38);
    expect(c.ch).toBeLessThan(0.55);
  });

  it('inferConsonantVisemes activates SS when lips stretch wide without pucker', () => {
    const c = inferConsonantVisemes({
      lip_stretcher_left: 0.85,
      lip_stretcher_right: 0.85,
      upper_lip_raiser_left: 0.18,
      upper_lip_raiser_right: 0.18,
      jaw_drop: 0.08,
    });
    expect(c.ss).toBeGreaterThan(0.45);
    expect(c.pp).toBe(0);
    expect(c.ch).toBeLessThan(0.4);
  });

  it('inferConsonantVisemes activates CH when lips pucker and stretch together', () => {
    const c = inferConsonantVisemes({
      lip_pucker_left: 0.65,
      lip_pucker_right: 0.65,
      lip_funneler_left_bottom: 0.5,
      lip_funneler_right_bottom: 0.5,
      lip_funneler_left_top: 0.45,
      lip_funneler_right_top: 0.45,
      lip_stretcher_left: 0.35,
      lip_stretcher_right: 0.35,
      jaw_drop: 0.06,
    });
    expect(c.ch).toBeGreaterThan(0.25);
    expect(c.ss).toBeLessThan(0.2);
    expect(c.pp).toBe(0);
  });

  it('inferConsonantVisemes activates FF when lower lip is tucked / depressed', () => {
    const c = inferConsonantVisemes({
      lip_suck_left_bottom: 0.7,
      lip_suck_right_bottom: 0.7,
      chin_raiser_bottom: 0.45,
      lower_lip_depressor_left: 0.18,
      lower_lip_depressor_right: 0.18,
      jaw_drop: 0.05,
    });
    expect(c.ff).toBeGreaterThan(0.35);
    expect(c.pp).toBeLessThan(0.15);
  });

  it('inferConsonantVisemes keeps sil at zero (audio path owns silence)', () => {
    const c = inferConsonantVisemes({});
    expect(c.sil).toBe(0);
    for (const k of ['pp', 'ff', 'th', 'dd', 'kk', 'ch', 'ss', 'nn', 'rr']) {
      expect(c[k]).toBe(0);
    }
  });

  it('applyExpressionWeightRecordToVRMS fills consonant viseme blends when the VRM defines them', () => {
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { pp: {}, ss: {}, ch: {}, aa: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update,
    };
    /** @type {any} */
    const vrm = { expressionManager: em };

    applyExpressionWeightRecordToVRMS(
      [vrm],
      {
        lip_pressor_left: 0.85,
        lip_pressor_right: 0.85,
        lip_tightener_left: 0.7,
        lip_tightener_right: 0.7,
        lips_toward: 0.6,
        jaw_drop: 0.02,
      },
      { lerpFactor: 1 }
    );

    const ppCall = setValue.mock.calls.find((c) => c[0] === 'pp');
    expect(ppCall).toBeDefined();
    expect(ppCall[1]).toBeGreaterThan(0.2);
    const ssCall = setValue.mock.calls.find((c) => c[0] === 'ss');
    if (ssCall) expect(ssCall[1]).toBeLessThan(0.1);
  });

  it('applyExpressionWeightRecordToVRMS resolves OVR-style alias names (Viseme_PP, vrc.v_ch, FCL_PHN_SS)', () => {
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { Viseme_PP: {}, 'vrc.v_ch': {}, FCL_PHN_SS: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update,
    };
    /** @type {any} */
    const vrm = { expressionManager: em };

    applyExpressionWeightRecordToVRMS(
      [vrm],
      {
        lip_pressor_left: 0.8,
        lip_pressor_right: 0.8,
        lip_tightener_left: 0.6,
        lip_tightener_right: 0.6,
        lips_toward: 0.6,
        jaw_drop: 0.02,
      },
      { lerpFactor: 1 }
    );

    const ppCall = setValue.mock.calls.find((c) => c[0] === 'Viseme_PP');
    expect(ppCall).toBeDefined();
    expect(ppCall[1]).toBeGreaterThan(0.1);
  });

  it('computeBilabialMouthClosureDominance rises with tracked seal and with lip-sync pp', () => {
    const vrm = {};
    expect(
      computeBilabialMouthClosureDominance(vrm, {
        lip_pressor_left: 0.9,
        lip_pressor_right: 0.9,
        lip_tightener_left: 0.75,
        lip_tightener_right: 0.75,
        lips_toward: 0.55,
        jaw_drop: 0.04,
      })
    ).toBeGreaterThan(0.35);

    /** @type {any} */
    const vrm2 = {};
    setXRDriverLipSyncVisemeOverride(vrm2, { pp: 0.9, strength: 0.95 });
    expect(computeBilabialMouthClosureDominance(vrm2, {})).toBeGreaterThan(0.8);
    clearXRDriverLipSyncVisemeOverride(vrm2);
  });

  it('bilabial dominance suppresses vowel aa when lip-sync pushes strong pp (OVR bb/pp/mm class)', () => {
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { aa: {}, pp: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update,
    };
    /** @type {any} */
    const vrm = { expressionManager: em };
    setXRDriverLipSyncVisemeOverride(vrm, {
      pp: 0.92,
      aa: 0.88,
      strength: 0.95,
    });
    applyExpressionWeightRecordToVRMS(
      [vrm],
      {
        jaw_drop: 0.62,
        lips_toward: 0.42,
        lip_stretcher_left: 0.35,
        lip_stretcher_right: 0.35,
      },
      { lerpFactor: 1 }
    );
    const aaCall = setValue.mock.calls.find((c) => c[0] === 'aa');
    const ppCall = setValue.mock.calls.find((c) => c[0] === 'pp');
    expect(ppCall).toBeDefined();
    expect(ppCall[1]).toBeGreaterThan(0.55);
    expect(aaCall).toBeDefined();
    expect(aaCall[1]).toBeLessThan(0.45);
    clearXRDriverLipSyncVisemeOverride(vrm);
  });

  it('applyExpressionWeightRecordToVRMS does not write consonant blends when the VRM lacks them (vowel-only rig)', () => {
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { aa: {}, ee: {}, ih: {}, oh: {}, ou: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update,
    };
    /** @type {any} */
    const vrm = { expressionManager: em };

    applyExpressionWeightRecordToVRMS(
      [vrm],
      {
        lip_pressor_left: 0.9,
        lip_pressor_right: 0.9,
        lip_tightener_left: 0.7,
        lip_tightener_right: 0.7,
        lips_toward: 0.6,
        jaw_drop: 0,
        lip_stretcher_left: 0.85,
        lip_stretcher_right: 0.85,
      },
      { lerpFactor: 1 }
    );

    const consonantSlugs = ['pp', 'ff', 'th', 'dd', 'kk', 'ch', 'ss', 'nn', 'rr', 'sil'];
    for (const slug of consonantSlugs) {
      expect(setValue.mock.calls.find((c) => c[0] === slug)).toBeUndefined();
    }
  });

  it('applyExpressionWeightRecordToVRMS drives custom vowel E and consonant CH when only those names exist', () => {
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { E: {}, CH: {}, DD: {}, aa: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update,
    };
    /** @type {any} */
    const vrm = { expressionManager: em };

    applyExpressionWeightRecordToVRMS(
      [vrm],
      {
        lip_stretcher_left: 0.55,
        lip_stretcher_right: 0.55,
        lip_pucker_left: 0.45,
        lip_pucker_right: 0.45,
        lip_funneler_left_bottom: 0.35,
        lip_funneler_right_bottom: 0.35,
        lip_funneler_left_top: 0.32,
        lip_funneler_right_top: 0.32,
        jaw_drop: 0.06,
      },
      { lerpFactor: 1 }
    );

    const eCall = setValue.mock.calls.find((c) => c[0] === 'E');
    const chCall = setValue.mock.calls.find((c) => c[0] === 'CH');
    expect(eCall).toBeDefined();
    expect(eCall[1]).toBeGreaterThan(0.05);
    expect(chCall).toBeDefined();
    expect(chCall[1]).toBeGreaterThan(0.08);
  });

  it('setXRDriverLipSyncVisemeOverride maps E key onto ee merge slot', () => {
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { ee: {}, aa: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update,
    };
    /** @type {any} */
    const vrm = { expressionManager: em };

    setXRDriverLipSyncVisemeOverride(vrm, {
      strength: 0.9,
      E: 0.72,
      aa: 0.02,
      ih: 0.05,
      oh: 0.04,
      ou: 0.03,
    });
    applyExpressionWeightRecordToVRMS(
      [vrm],
      {
        lip_stretcher_left: 0.08,
        lip_stretcher_right: 0.08,
        jaw_drop: 0.02,
      },
      { lerpFactor: 1 }
    );

    const eeCall = setValue.mock.calls.find((c) => c[0] === 'ee');
    expect(eeCall).toBeDefined();
    expect(eeCall[1]).toBeGreaterThan(0.35);
    clearXRDriverLipSyncVisemeOverride(vrm);
  });

  it('setXRDriverLipSyncVisemeOverride blends audio-detected SS into the SS consonant blend', () => {
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { ss: {}, aa: {}, ee: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update,
    };
    /** @type {any} */
    const vrm = { expressionManager: em };

    setXRDriverLipSyncVisemeOverride(vrm, { strength: 0.9, ss: 0.82, sil: 0, pp: 0, ff: 0 });
    applyExpressionWeightRecordToVRMS(
      [vrm],
      {
        lip_stretcher_left: 0.05,
        lip_stretcher_right: 0.05,
        jaw_drop: 0,
      },
      { lerpFactor: 1 }
    );

    const ssCall = setValue.mock.calls.find((c) => c[0] === 'ss');
    expect(ssCall).toBeDefined();
    expect(ssCall[1]).toBeGreaterThan(0.45);
    clearXRDriverLipSyncVisemeOverride(vrm);
  });

  it('applyExpressionWeightRecordToVRMS maps gaze keys to lookLeft / lookUp presets', () => {
    resetFaceExpressionNeutralBaseline();
    setFaceExpressionNeutralBaselineFromRecord({
      eyes_look_left_left: 0,
      eyes_look_left_right: 0,
      eyes_look_up_left: 0,
      eyes_look_up_right: 0,
      jaw_drop: 0
    });
    const setValue = vi.fn();
    const update = vi.fn();
    const expressionMap = { lookLeft: {}, lookUp: {}, aa: {} };
    const em = {
      expressionMap,
      getExpression: (name) => expressionMap[name] || null,
      setValue,
      update
    };
    /** @type {any} */
    const vrm = { expressionManager: em };

    applyExpressionWeightRecordToVRMS(
      [vrm],
      {
        eyes_look_left_left: 0.7,
        eyes_look_left_right: 0.65,
        eyes_look_up_left: 0.5,
        eyes_look_up_right: 0.45,
        jaw_drop: 0.05
      },
      { lerpFactor: 1 }
    );

    const leftCall = setValue.mock.calls.find((c) => c[0] === 'lookLeft');
    const upCall = setValue.mock.calls.find((c) => c[0] === 'lookUp');
    expect(leftCall).toBeDefined();
    expect(upCall).toBeDefined();
    expect(leftCall[1]).toBeGreaterThan(0.75);
    expect(upCall[1]).toBeGreaterThan(0.45);
  });
});
