/**
 * Scroll helpers for Bone Structure panel.
 * - Vertical: pin selected row flush under the "Bone Structure" title
 *   (top of `.bone-structure-content` only — never sidebar scrollIntoView).
 * - Horizontal: center the selected `.bone-name` in the panel.
 *   Do NOT hard-cap to a tiny px value (that yanked the bar left / wrong way).
 *   Do NOT scroll by deep-subtree overflow (that slammed to maxRight).
 */

export const BONE_SCROLL_PAD_X = 12;

/**
 * @param {Element | null | undefined} panel
 * @param {string} boneName
 * @returns {HTMLElement | null}
 */
export function findBoneRowInPanel(panel, boneName) {
  if (!panel || !boneName) return null;
  const raw = String(boneName);
  const safe =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(raw)
      : raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  /** @type {HTMLElement | null} */
  let row = panel.querySelector(`.bone-item[data-bone-name="${safe}"]`);
  if (row) return row;
  row = panel.querySelector(`.bone-item[data-bone-node-name="${safe}"]`);
  if (row) return row;

  const lower = raw.toLowerCase();
  const items = panel.querySelectorAll('.bone-item[data-bone-name]');
  for (const el of items) {
    const a = el.getAttribute('data-bone-name') || '';
    const b = el.getAttribute('data-bone-node-name') || '';
    if (a.toLowerCase() === lower || b.toLowerCase() === lower) {
      return /** @type {HTMLElement} */ (el);
    }
  }
  return null;
}

/**
 * Pin `element` flush to the top of a sidebar scroll container.
 * @param {HTMLElement | null | undefined} sidebar
 * @param {HTMLElement | null | undefined} element
 * @param {number} [padTop=0]
 * @returns {boolean}
 */
export function syncSidebarScrollToElement(sidebar, element, padTop = 0) {
  if (!(sidebar instanceof HTMLElement) || !(element instanceof HTMLElement)) return false;
  const sideRect = sidebar.getBoundingClientRect();
  const elRect = element.getBoundingClientRect();
  const delta = elRect.top - sideRect.top - padTop;
  if (Math.abs(delta) > 0.5) {
    sidebar.scrollTop += delta;
  }
  return true;
}

/**
 * Keep the Bone Structure header visible at the top of the left sidebar.
 * @param {Element | null | undefined} panel
 */
export function syncSidebarToBonePanelHeader(panel) {
  if (!panel || typeof panel.closest !== 'function') return;
  const sidebar = panel.closest('.sidebar');
  if (!(sidebar instanceof HTMLElement)) return;
  const header = panel.querySelector('.bone-panel-header') || panel;
  if (!(header instanceof HTMLElement)) return;
  syncSidebarScrollToElement(sidebar, header);
}

/**
 * @param {HTMLElement} row
 * @param {HTMLElement} scroller
 * @returns {number} target scrollTop to put row flush with scroller top
 */
export function targetScrollTopForRow(row, scroller) {
  if (!row || !scroller) return 0;
  const scrollerRect = scroller.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  if (scrollerRect.height > 0 || rowRect.height > 0 || rowRect.top !== 0 || scrollerRect.top !== 0) {
    return Math.max(0, scroller.scrollTop + (rowRect.top - scrollerRect.top));
  }
  let top = 0;
  let el = row;
  while (el && el !== scroller) {
    top += el.offsetTop || 0;
    const next = el.offsetParent;
    if (!next || (next !== scroller && !scroller.contains(next))) {
      top = 0;
      el = row;
      while (el && el !== scroller) {
        top += el.offsetTop || 0;
        el = el.parentElement;
      }
      break;
    }
    el = /** @type {HTMLElement} */ (next);
  }
  return Math.max(0, top);
}

/**
 * Prefer the bone name (narrow) so width:100% rows don't force max scroll.
 * @param {HTMLElement} row
 * @returns {HTMLElement}
 */
export function horizontalFocusForBoneRow(row) {
  if (!row) return row;
  const name = row.querySelector('.bone-name');
  return name instanceof HTMLElement ? name : row;
}

/**
 * Center the selected bone name horizontally.
 * @param {HTMLElement} row
 * @param {HTMLElement} scroller
 * @param {{ pad?: number }} [opts]
 * @returns {number}
 */
export function targetScrollLeftNudgeRight(row, scroller, opts = {}) {
  if (!row || !scroller) return 0;
  const pad = opts.pad ?? BONE_SCROLL_PAD_X;
  const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  if (maxLeft <= 0.5) return 0;

  const focus = horizontalFocusForBoneRow(row);
  const scrollerRect = scroller.getBoundingClientRect();
  const focusRect = focus.getBoundingClientRect();

  let next =
    scroller.scrollLeft
    + (focusRect.left + focusRect.width / 2)
    - (scrollerRect.left + scrollerRect.width / 2);

  const applyClamp = () => {
    const delta = next - scroller.scrollLeft;
    const pLeft = focusRect.left - delta;
    const pRight = focusRect.right - delta;
    if (pRight > scrollerRect.right - pad) {
      next += pRight - (scrollerRect.right - pad);
    }
    const delta2 = next - scroller.scrollLeft;
    const pLeft2 = focusRect.left - delta2;
    if (pLeft2 < scrollerRect.left + pad) {
      next -= (scrollerRect.left + pad) - pLeft2;
    }
  };
  applyClamp();
  applyClamp();

  return Math.min(maxLeft, Math.max(0, next));
}

/** @deprecated alias */
export function targetScrollLeftToCenter(focus, scroller, opts = {}) {
  if (!focus || !scroller) return 0;
  const row = focus.classList?.contains('bone-item')
    ? focus
    : focus.closest?.('.bone-item') || focus;
  if (row?.classList?.contains('bone-item')) {
    return targetScrollLeftNudgeRight(/** @type {HTMLElement} */ (row), scroller, opts);
  }
  const pad = opts.pad ?? BONE_SCROLL_PAD_X;
  const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  if (maxLeft <= 0.5) return 0;
  const scrollerRect = scroller.getBoundingClientRect();
  const focusRect = focus.getBoundingClientRect();
  let next =
    scroller.scrollLeft
    + (focusRect.left + focusRect.width / 2)
    - (scrollerRect.left + scrollerRect.width / 2);
  const delta = next - scroller.scrollLeft;
  if (focusRect.right - delta > scrollerRect.right - pad) {
    next += (focusRect.right - delta) - (scrollerRect.right - pad);
  }
  const delta2 = next - scroller.scrollLeft;
  if (focusRect.left - delta2 < scrollerRect.left + pad) {
    next -= (scrollerRect.left + pad) - (focusRect.left - delta2);
  }
  return Math.min(maxLeft, Math.max(0, next));
}

/** @deprecated alias */
export function targetScrollLeftToReveal(focus, scroller, opts = {}) {
  return targetScrollLeftToCenter(focus, scroller, opts);
}

/**
 * @param {string} boneName
 * @param {{ attempt?: number, panel?: Element | null }} [opts]
 * @returns {'missing'|'aligned'|'adjusted'}
 */
export function scrollBoneRowJustBelowTitle(boneName, opts = {}) {
  if (!boneName || typeof document === 'undefined') return 'missing';
  const panel = opts.panel || document.querySelector('.bone-structure-panel');
  if (!panel) return 'missing';

  const row = findBoneRowInPanel(panel, boneName);
  if (!row) return 'missing';

  const scroller = /** @type {HTMLElement | null} */ (
    panel.querySelector('.bone-structure-content')
  );
  if (!scroller) return 'missing';

  syncSidebarToBonePanelHeader(panel);

  const nextTop = targetScrollTopForRow(row, scroller);
  if (Math.abs(scroller.scrollTop - nextTop) > 0.5) {
    scroller.scrollTop = nextTop;
  }

  const nextLeft = targetScrollLeftNudgeRight(row, scroller);
  if (Math.abs(scroller.scrollLeft - nextLeft) > 0.5) {
    scroller.scrollLeft = nextLeft;
  }

  syncSidebarToBonePanelHeader(panel);

  const afterScroller = scroller.getBoundingClientRect();
  const afterRow = row.getBoundingClientRect();
  const focus = horizontalFocusForBoneRow(row);
  const afterFocus = focus.getBoundingClientRect();
  const deltaY = afterRow.top - afterScroller.top;
  const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const nameVisible =
    afterFocus.left >= afterScroller.left - 2
    && afterFocus.right <= afterScroller.right + 2;
  const centered =
    Math.abs(
      (afterFocus.left + afterFocus.width / 2)
      - (afterScroller.left + afterScroller.width / 2),
    ) <= 12;
  const alignedY = Math.abs(deltaY) <= 2;
  const alignedX =
    maxLeft <= 0.5
    || Math.abs(scroller.scrollLeft - nextLeft) <= 1
    || nameVisible
    || centered;
  const aligned = alignedY && alignedX;

  const attempt = opts.attempt || 0;
  if (!aligned && attempt < 16) {
    window.setTimeout(() => {
      scrollBoneRowJustBelowTitle(boneName, { attempt: attempt + 1, panel });
    }, 32);
  }
  return aligned ? 'aligned' : 'adjusted';
}

/**
 * @param {string} boneName
 * @param {{ maxAttempts?: number, delayMs?: number, panel?: Element | null }} [opts]
 */
export function scrollBoneRowWhenReady(boneName, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 28;
  const delayMs = opts.delayMs ?? 40;
  let attempt = 0;
  const tick = () => {
    const result = scrollBoneRowJustBelowTitle(boneName, { panel: opts.panel || null });
    if (result === 'aligned') return;
    attempt += 1;
    if (attempt < maxAttempts) {
      window.setTimeout(tick, delayMs);
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      requestAnimationFrame(tick);
    });
  } else {
    tick();
  }
}

/** @deprecated */
export function findVerticalScrollParent(el, stopAt = null) {
  let node = el?.parentElement || null;
  while (node && node !== stopAt) {
    const style = typeof window !== 'undefined' ? window.getComputedStyle(node) : null;
    const oy = style?.overflowY || '';
    if (
      (oy === 'auto' || oy === 'scroll' || oy === 'overlay')
      && node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return stopAt;
}
