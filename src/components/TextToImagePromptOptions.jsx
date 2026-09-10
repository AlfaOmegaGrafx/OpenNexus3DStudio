import React, { useMemo, useState } from 'react';
import {
  TEXT_TO_IMAGE_VIEW_OPTIONS,
  TEXT_TO_IMAGE_GENDER_OPTIONS,
  TEXT_TO_IMAGE_ETHNICITY_OPTIONS,
  TEXT_TO_IMAGE_BODY_COMPOSITION_OPTIONS,
  TEXT_TO_IMAGE_STATURE_PRESETS,
  LIKENESS_SOURCE_OPTIONS,
  STUDIO_CREATURE_MESH_READY_TEXT_TO_IMAGE_OPTIONS,
  normalizeTextToImagePromptOptions,
  previewTextToImagePrompt,
  cmToFeetInches,
  kgToLb,
  commitBodyWeightInput,
  commitBodyHeightInput,
} from '../library/textToImagePromptOptions.js';
import {
  HEAD_TRACK_OPTIONS,
  headTrackUsesMeshMonk,
} from '../library/avatarPipelineCatalog.js';

const chipStyle = (active) => ({
  fontSize: '0.58rem',
  padding: '0.15rem 0.4rem',
  borderRadius: '999px',
  border: active ? '1px solid #6af' : '1px solid #555',
  background: active ? '#1a2a3a' : '#1a1a1a',
  color: active ? '#cef' : '#bbb',
  cursor: 'pointer',
});

const metricInputStyle = {
  width: '4.5rem',
  fontSize: '0.58rem',
  padding: '0.2rem 0.35rem',
  borderRadius: '6px',
  border: '1px solid #555',
  background: '#121212',
  color: '#ddd',
};

const metricSelectStyle = {
  ...metricInputStyle,
  width: 'auto',
  cursor: 'pointer',
};

/**
 * Krea text-to-image prompt modifiers (gender, physique, background, framing, camera, creature rig).
 */
export default function TextToImagePromptOptions({ value, onChange, basePrompt = '' }) {
  const opts = normalizeTextToImagePromptOptions(value);
  const [heightUnit, setHeightUnit] = useState('ft');
  const [weightUnit, setWeightUnit] = useState('lb');
  /** Local drafts so partial lb/ft typing is not wiped by kg/cm range validation. */
  const [weightDraft, setWeightDraft] = useState(null);
  const [heightDraft, setHeightDraft] = useState(null);

  const setOpt = (patch) => {
    onChange?.(normalizeTextToImagePromptOptions({ ...opts, ...patch }));
  };

  const heightDisplay = useMemo(() => {
    if (opts.body_height_cm == null) return { cm: '', feet: '', inches: '' };
    const { feet, inches } = cmToFeetInches(opts.body_height_cm);
    return {
      cm: String(Math.round(opts.body_height_cm)),
      feet: String(feet),
      inches: String(inches),
    };
  }, [opts.body_height_cm]);

  const weightDisplay = useMemo(() => {
    if (opts.body_weight_kg == null) return { kg: '', lb: '' };
    return {
      kg: String(Math.round(opts.body_weight_kg)),
      lb: String(Math.round(kgToLb(opts.body_weight_kg))),
    };
  }, [opts.body_weight_kg]);

  const weightValue =
    weightDraft != null
      ? weightDraft
      : weightUnit === 'kg'
        ? weightDisplay.kg
        : weightDisplay.lb;

  const heightCmValue = heightDraft?.cm != null ? heightDraft.cm : heightDisplay.cm;
  const heightFeetValue = heightDraft?.feet != null ? heightDraft.feet : heightDisplay.feet;
  const heightInchesValue =
    heightDraft?.inches != null ? heightDraft.inches : heightDisplay.inches;

  const applyWeightDraft = (raw) => {
    setWeightDraft(raw);
    const { kg, committed } = commitBodyWeightInput(raw, weightUnit);
    if (committed) setOpt({ body_weight_kg: kg });
  };

  const applyHeightCmDraft = (raw) => {
    setHeightDraft({ cm: raw });
    const { cm, committed } = commitBodyHeightInput({ cm: raw }, 'cm');
    if (committed) setOpt({ body_height_cm: cm });
  };

  const applyHeightFtDraft = (feetRaw, inchesRaw) => {
    const next = {
      feet: feetRaw,
      inches: inchesRaw,
    };
    setHeightDraft(next);
    const { cm, committed } = commitBodyHeightInput(next, 'ft');
    if (committed) setOpt({ body_height_cm: cm });
  };

  const clearWeightDraft = () => setWeightDraft(null);
  const clearHeightDraft = () => setHeightDraft(null);

  const toggleTPose = () => {
    const next = !opts.t_pose;
    setOpt({ t_pose: next, a_pose: false, creature_rig_ready: false });
  };

  const toggleAPose = () => {
    const next = !opts.a_pose;
    setOpt({ a_pose: next, t_pose: false, creature_rig_ready: false });
  };

  const toggleCreatureRigReady = () => {
    const next = !opts.creature_rig_ready;
    if (next) {
      setOpt({
        ...STUDIO_CREATURE_MESH_READY_TEXT_TO_IMAGE_OPTIONS,
        remove_background: true,
        character_gender: '',
        character_ethnicity: '',
        body_composition: '',
        body_height_cm: null,
        body_weight_kg: null,
      });
    } else {
      setOpt({
        creature_rig_ready: false,
        head_forward: false,
        tail_clear: false,
        standing_pose: false,
      });
    }
  };

  const toggleAllViews = () => {
    const next = !opts.all_orthographic_views;
    setOpt({
      all_orthographic_views: next,
      camera_view: next ? opts.camera_view || 'front' : opts.camera_view,
    });
  };

  const preview = previewTextToImagePrompt(basePrompt, opts);
  const showGender = !opts.creature_rig_ready;

  return (
    <div className="mb-1.5" style={{ fontSize: '0.6rem' }}>
      <div style={{ color: '#aaa', marginBottom: '0.25rem' }}>Image options</div>
      {showGender ? (
        <>
          <div style={{ color: '#888', marginBottom: '0.2rem' }}>Gender</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.35rem' }}>
            {TEXT_TO_IMAGE_GENDER_OPTIONS.map((g) => (
              <button
                key={g.id || 'any'}
                type="button"
                style={chipStyle(opts.character_gender === g.id)}
                onClick={() => setOpt({ character_gender: g.id })}
                title={
                  g.id
                    ? `Bias the subject toward ${g.label.toLowerCase()} presentation`
                    : 'No gender bias in the prompt'
                }
              >
                {g.label}
              </button>
            ))}
          </div>

          <div style={{ color: '#888', marginBottom: '0.2rem' }}>Body composition</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.35rem' }}>
            {TEXT_TO_IMAGE_BODY_COMPOSITION_OPTIONS.map((b) => (
              <button
                key={b.id || 'any'}
                type="button"
                style={chipStyle(opts.body_composition === b.id)}
                onClick={() => setOpt({ body_composition: b.id })}
                title={b.title}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div style={{ color: '#888', marginBottom: '0.2rem' }}>Height</div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.35rem',
              alignItems: 'center',
              marginBottom: '0.25rem',
            }}
          >
            {TEXT_TO_IMAGE_STATURE_PRESETS.map((s) => (
              <button
                key={s.id}
                type="button"
                style={chipStyle(opts.body_height_cm === s.cm)}
                onClick={() => setOpt({ body_height_cm: s.cm })}
                title={s.title}
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              style={chipStyle(opts.body_height_cm == null)}
              onClick={() => setOpt({ body_height_cm: null })}
              title="Omit height from the prompt"
            >
              Clear
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.35rem',
              alignItems: 'center',
              marginBottom: '0.35rem',
            }}
          >
            <select
              aria-label="Height unit"
              style={metricSelectStyle}
              value={heightUnit}
              onChange={(e) => {
                setHeightUnit(e.target.value);
                clearHeightDraft();
              }}
            >
              <option value="cm">cm</option>
              <option value="ft">ft/in</option>
            </select>
            {heightUnit === 'cm' ? (
              <input
                type="text"
                inputMode="decimal"
                placeholder="cm"
                aria-label="Height in centimeters"
                style={metricInputStyle}
                value={heightCmValue}
                onFocus={() => setHeightDraft({ cm: heightDisplay.cm })}
                onBlur={clearHeightDraft}
                onChange={(e) => applyHeightCmDraft(e.target.value)}
              />
            ) : (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="ft"
                  aria-label="Height feet"
                  style={{ ...metricInputStyle, width: '3rem' }}
                  value={heightFeetValue}
                  onFocus={() =>
                    setHeightDraft({
                      feet: heightDisplay.feet,
                      inches: heightDisplay.inches,
                    })
                  }
                  onBlur={clearHeightDraft}
                  onChange={(e) => applyHeightFtDraft(e.target.value, heightInchesValue)}
                />
                <span style={{ color: '#777' }}>′</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="in"
                  aria-label="Height inches"
                  style={{ ...metricInputStyle, width: '3rem' }}
                  value={heightInchesValue}
                  onFocus={() =>
                    setHeightDraft({
                      feet: heightDisplay.feet,
                      inches: heightDisplay.inches,
                    })
                  }
                  onBlur={clearHeightDraft}
                  onChange={(e) => applyHeightFtDraft(heightFeetValue, e.target.value)}
                />
                <span style={{ color: '#777' }}>″</span>
              </>
            )}
          </div>

          <div style={{ color: '#888', marginBottom: '0.2rem' }}>Weight</div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.35rem',
              alignItems: 'center',
              marginBottom: '0.35rem',
            }}
          >
            <select
              aria-label="Weight unit"
              style={metricSelectStyle}
              value={weightUnit}
              onChange={(e) => {
                setWeightUnit(e.target.value);
                clearWeightDraft();
              }}
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
            <input
              type="text"
              inputMode="decimal"
              placeholder={weightUnit === 'kg' ? 'kg' : 'lb'}
              aria-label={weightUnit === 'kg' ? 'Weight in kilograms' : 'Weight in pounds'}
              style={metricInputStyle}
              value={weightValue}
              onFocus={() =>
                setWeightDraft(weightUnit === 'kg' ? weightDisplay.kg : weightDisplay.lb)
              }
              onBlur={clearWeightDraft}
              onChange={(e) => applyWeightDraft(e.target.value)}
            />
            <button
              type="button"
              style={chipStyle(opts.body_weight_kg == null)}
              onClick={() => {
                clearWeightDraft();
                setOpt({ body_weight_kg: null });
              }}
              title="Omit weight from the prompt"
            >
              Clear
            </button>
          </div>

          <div style={{ color: '#888', marginBottom: '0.2rem' }}>
            Head track (Ethnicity / Likeness / 3DGSavatar)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.35rem' }}>
            {HEAD_TRACK_OPTIONS.map((h) => (
              <button
                key={h.id}
                type="button"
                style={chipStyle(opts.head_track === h.id)}
                onClick={() => setOpt({ head_track: h.id })}
                title={h.title}
              >
                {h.label}
              </button>
            ))}
          </div>
          <div style={{ color: '#888', marginBottom: '0.2rem' }}>
            Ethnicity
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.35rem' }}>
            {TEXT_TO_IMAGE_ETHNICITY_OPTIONS.map((e) => (
              <button
                key={e.id || 'any'}
                type="button"
                style={chipStyle(opts.character_ethnicity === e.id)}
                onClick={() => setOpt({ character_ethnicity: e.id })}
                title={
                  e.id
                    ? `Image prompt bias + ethnicity sampler (${e.id}) when head track includes Likeness`
                    : 'No ethnicity bias'
                }
              >
                {e.label}
              </button>
            ))}
          </div>
          {headTrackUsesMeshMonk(opts.head_track) ? (
            <>
              <div style={{ color: '#888', marginBottom: '0.2rem' }}>
                Likeness source
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.35rem' }}>
                {LIKENESS_SOURCE_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    style={chipStyle(opts.likeness_source === s.id)}
                    onClick={() => setOpt({ likeness_source: s.id })}
                    title={s.title}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {opts.likeness_source !== 'body_roi' ? (
                <div style={{ color: '#888', marginBottom: '0.35rem', fontSize: '0.55rem' }}>
                  Upload Face selfie on Body+Cloth (same photo can feed 3DGSavatar).
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.35rem' }}>
        <button
          type="button"
          style={chipStyle(Boolean(opts.remove_background))}
          onClick={() => setOpt({ remove_background: !opts.remove_background })}
        >
          Remove background
        </button>
        <button
          type="button"
          style={chipStyle(Boolean(opts.full_body))}
          onClick={() => setOpt({ full_body: !opts.full_body })}
        >
          Full body
        </button>
        <button
          type="button"
          style={chipStyle(Boolean(opts.t_pose))}
          onClick={toggleTPose}
          title="Humanoid T-pose (turns off Creature for rig)"
        >
          T-pose
        </button>
        <button
          type="button"
          style={chipStyle(Boolean(opts.a_pose))}
          onClick={toggleAPose}
          title="Humanoid A-pose (turns off Creature for rig)"
        >
          A-pose
        </button>
        <button
          type="button"
          style={chipStyle(Boolean(opts.all_orthographic_views))}
          onClick={toggleAllViews}
          title="Generate front, back, left, right, top, bottom with one shared seed"
        >
          All 6 views
        </button>
        <button
          type="button"
          style={chipStyle(Boolean(opts.mouth_open))}
          onClick={() => setOpt({ mouth_open: !opts.mouth_open })}
          title="Bias the face toward an open mouth (jaw slightly dropped) — skipped for neck-open / garment shots"
          disabled={
            Boolean(opts.headless_body) ||
            Boolean(opts.isolated_garment) ||
            Boolean(opts.worn_tpose_garment)
          }
        >
          Mouth open
        </button>
      </div>

      <div style={{ color: '#888', marginBottom: '0.2rem' }}>
        Creature / animal (auto-rig friendly)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.35rem' }}>
        <button
          type="button"
          style={chipStyle(Boolean(opts.creature_rig_ready))}
          onClick={toggleCreatureRigReady}
          title="Side profile rest pose: head along body, tail clear of hind legs, standing — best for fox/quadruped creature template rig"
        >
          Creature for rig
        </button>
        <button
          type="button"
          style={chipStyle(Boolean(opts.head_forward))}
          onClick={() => setOpt({ head_forward: !opts.head_forward })}
          title="Head faces along the body axis (not turned toward camera)"
        >
          Head forward
        </button>
        <button
          type="button"
          style={chipStyle(Boolean(opts.tail_clear))}
          onClick={() => setOpt({ tail_clear: !opts.tail_clear })}
          title="Tail extended behind the body, not tucked against hind legs"
        >
          Tail clear
        </button>
        <button
          type="button"
          style={chipStyle(Boolean(opts.standing_pose))}
          onClick={() => setOpt({ standing_pose: !opts.standing_pose })}
          title="Four legs planted, clear front/hind separation"
        >
          Standing
        </button>
      </div>

      <div style={{ color: '#888', marginBottom: '0.2rem' }}>
        {opts.all_orthographic_views
          ? 'Primary view for TRELLIS (all 6 still generated)'
          : 'Camera angle'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
        {TEXT_TO_IMAGE_VIEW_OPTIONS.filter((view) =>
          opts.all_orthographic_views ? Boolean(view.id) : true,
        ).map((view) => (
          <button
            key={view.id || 'any'}
            type="button"
            style={chipStyle(opts.camera_view === view.id)}
            onClick={() => setOpt({ camera_view: view.id })}
          >
            {view.label}
          </button>
        ))}
      </div>
      {preview ? (
        <p style={{ fontSize: '0.55rem', color: '#7a9', margin: '0.35rem 0 0', lineHeight: 1.35 }}>
          Prompt sent: {preview}
        </p>
      ) : null}
    </div>
  );
}
