import React, { useMemo } from 'react';
import {
  APPEARANCE_SLOTS,
  ACCESSORY_SEGMENT_LABELS,
  clothingEditorSegmentOptions,
  clothingEditorRowsToText,
  garmentCutNeedsUserChoice,
  garmentCutSelectOptions,
  mergeAccessoriesIntoClothingEditorRows,
  resolveGarmentCut,
} from '../../library/appearanceClothing.js';

/**
 * Body+Cloth clothing list: slot + subcategory chips, prompt hugged to content width.
 *
 * @param {{
 *   accessories: object[],
 *   disabled?: boolean,
 *   onChangeText: (clothingText: string) => void,
 *   onRandomize?: () => void,
 * }} props
 */
export default function StudioClothingAccessoriesEditor({
  accessories = [],
  disabled = false,
  onChangeText,
  onRandomize,
}) {
  const rows = useMemo(
    () => mergeAccessoriesIntoClothingEditorRows(accessories),
    [accessories],
  );

  const commit = (nextRows) => {
    onChangeText?.(clothingEditorRowsToText(nextRows));
  };

  const updateRow = (index, patch) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    commit(next);
  };

  const clearRow = (index) => {
    updateRow(index, { label: '', cut: null });
  };

  const addRow = () => {
    commit([
      ...rows,
      {
        key: `extra_${Date.now()}`,
        slot: 'Chest',
        segment: null,
        label: '',
        cut: null,
        labelPlaceholder: 'custom garment…',
      },
    ]);
  };

  return (
    <div className="studio-field studio-field-wide studio-clothing-field">
      <div className="studio-clothing-field-header">
        <span>Clothing / accessories</span>
        {typeof onRandomize === 'function' ? (
          <button
            type="button"
            className="studio-btn ghost studio-clothing-randomize"
            onClick={onRandomize}
            disabled={disabled}
            title="AI customize: randomize outfit from style pools (includes Head hat / eyewear / earrings)"
          >
            AI customize · randomize
          </button>
        ) : null}
      </div>

      <ul className="studio-clothing-editor-list" aria-label="Clothing accessory rows">
        {rows.map((row, index) => {
          const cutInfo = resolveGarmentCut({
            label: row.label,
            appearance_slot: row.slot,
            cut: row.cut,
          });
          const showCut = garmentCutNeedsUserChoice({
            label: row.label,
            appearance_slot: row.slot,
            cut: row.cut,
            cut_kind: cutInfo.kind,
          });
          const cutOpts = garmentCutSelectOptions(cutInfo.kind);
          const segmentOpts = clothingEditorSegmentOptions(row.slot);
          const showSegment = segmentOpts.length > 0;
          const segmentValue =
            row.segment && segmentOpts.some((o) => o.value === row.segment)
              ? row.segment
              : segmentOpts[0]?.value || '';

          return (
            <li key={row.key || `${row.slot}_${index}`} className="studio-clothing-editor-row">
              <label className="studio-clothing-editor-slotchip">
                <select
                  className="studio-clothing-editor-slot"
                  value={row.slot}
                  disabled={disabled}
                  aria-label={`Slot for row ${index + 1}`}
                  onChange={(e) => {
                    const slot = e.target.value;
                    const nextSegOpts = clothingEditorSegmentOptions(slot);
                    updateRow(index, {
                      slot,
                      segment: nextSegOpts[0]?.value || null,
                      cut: null,
                    });
                  }}
                >
                  {APPEARANCE_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </label>

              {showSegment ? (
                <label className="studio-clothing-editor-subchip">
                  <select
                    className="studio-clothing-editor-segment"
                    value={segmentValue}
                    disabled={disabled}
                    aria-label={`Subcategory for ${row.slot}`}
                    onChange={(e) => updateRow(index, { segment: e.target.value })}
                  >
                    {segmentOpts.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : showCut && cutOpts.length > 0 ? (
                <label className="studio-clothing-editor-subchip">
                  <select
                    className="studio-clothing-editor-cut"
                    value={row.cut || cutInfo.cut || 'long'}
                    disabled={disabled}
                    aria-label={
                      cutInfo.kind === 'sleeve_length'
                        ? `Sleeve length for ${row.label || row.slot}`
                        : `Length for ${row.label || row.slot}`
                    }
                    onChange={(e) => updateRow(index, { cut: e.target.value })}
                  >
                    {cutOpts.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="studio-clothing-editor-subchip is-muted" aria-hidden>
                  {row.segment
                    ? ACCESSORY_SEGMENT_LABELS[row.segment] || row.segment
                    : '—'}
                </span>
              )}

              <input
                type="text"
                className="studio-clothing-editor-label"
                value={row.label}
                disabled={disabled}
                placeholder={row.labelPlaceholder || `${row.slot} item…`}
                aria-label={`Prompt for ${row.slot}${
                  row.segment ? ` ${ACCESSORY_SEGMENT_LABELS[row.segment] || row.segment}` : ''
                }`}
                onChange={(e) => updateRow(index, { label: e.target.value })}
              />

              <button
                type="button"
                className="studio-btn ghost studio-clothing-editor-clear"
                disabled={disabled || !row.label}
                title="Clear this row"
                aria-label={`Clear ${row.slot} row`}
                onClick={() => clearRow(index)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <div className="studio-clothing-editor-footer">
        <button
          type="button"
          className="studio-btn ghost"
          disabled={disabled}
          onClick={addRow}
        >
          + Add accessory
        </button>
        <span className="studio-field-hint">
          Head uses three rows (hat, sunglasses, earrings) so they layer on the same Appearance slot.
        </span>
      </div>
    </div>
  );
}
