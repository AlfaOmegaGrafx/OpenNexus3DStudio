import { useRef, useCallback } from 'react';

const DRAG_THRESHOLD_PX = 8;

const DEFAULT_INTERACTIVE_SELECTOR = [
  'button',
  'select',
  'input',
  'textarea',
  'a',
  '[contenteditable="true"]',
  '[role="slider"]',
  '[data-no-drag-scroll]',
].join(', ');

function isInteractiveDragTarget(target, selector) {
  return Boolean(target?.closest?.(selector));
}

function hasTextSelection() {
  const sel = window.getSelection?.();
  return Boolean(sel && sel.type === 'Range' && sel.toString().length > 0);
}

/** Prefer scroll-axis movement so perpendicular drags can highlight text. */
function exceedsScrollDragThreshold(axis, dx, dy) {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (axis === 'x') {
    return adx >= DRAG_THRESHOLD_PX && adx > ady * 1.25;
  }
  if (axis === 'y') {
    return ady >= DRAG_THRESHOLD_PX && ady > adx * 1.25;
  }
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}

/**
 * Pointer drag + wheel helper for overflow scroll regions.
 * @param {'x' | 'y' | 'both'} axis
 */
export function useDragToScroll({
  axis = 'x',
  interactiveSelector = DEFAULT_INTERACTIVE_SELECTOR,
  disabled = false,
  draggingClassName = 'is-drag-scrolling',
} = {}) {
  const scrollRef = useRef(null);
  const dragRef = useRef(null);

  const clearDrag = useCallback(
    (pointerId) => {
      const el = scrollRef.current;
      const state = dragRef.current;
      if (!state) return;
      if (state.active && pointerId != null && el?.hasPointerCapture?.(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
      dragRef.current = null;
      if (draggingClassName) {
        el?.classList.remove(draggingClassName);
      }
    },
    [draggingClassName],
  );

  const activateDrag = useCallback(
    (el, e) => {
      if (!dragRef.current || dragRef.current.active) return;
      dragRef.current.active = true;
      el.setPointerCapture(e.pointerId);
      if (draggingClassName) {
        el.classList.add(draggingClassName);
      }
    },
    [draggingClassName],
  );

  const onPointerDown = useCallback(
    (e) => {
      if (disabled) return;
      const el = scrollRef.current;
      if (!el || e.button !== 0 || isInteractiveDragTarget(e.target, interactiveSelector)) {
        return;
      }

      // Defer capture until movement threshold — allows click and text selection.
      dragRef.current = {
        active: false,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      };
    },
    [disabled, interactiveSelector],
  );

  const onPointerMove = useCallback(
    (e) => {
      const el = scrollRef.current;
      const state = dragRef.current;
      if (!el || !state) return;

      if (!state.active) {
        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        if (!exceedsScrollDragThreshold(axis, dx, dy)) return;
        if (hasTextSelection()) {
          dragRef.current = null;
          return;
        }
        activateDrag(el, e);
      }

      if (!dragRef.current?.active) return;
      e.preventDefault();
      e.stopPropagation();
      if (axis === 'x' || axis === 'both') {
        el.scrollLeft = state.scrollLeft - (e.clientX - state.startX);
      }
      if (axis === 'y' || axis === 'both') {
        el.scrollTop = state.scrollTop - (e.clientY - state.startY);
      }
    },
    [axis, activateDrag],
  );

  const onPointerUp = useCallback(
    (e) => {
      clearDrag(e.pointerId);
    },
    [clearDrag],
  );

  const onPointerCancel = useCallback(
    (e) => {
      clearDrag(e.pointerId);
    },
    [clearDrag],
  );

  const onWheel = useCallback(
    (e) => {
      if (disabled) return;
      const el = scrollRef.current;
      if (!el) return;

      e.stopPropagation();

      if (axis === 'x') {
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll <= 0) {
          e.preventDefault();
          return;
        }
        const { deltaX, deltaY } = e;
        let scrollDelta = 0;
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          scrollDelta = deltaX;
        } else if (e.shiftKey && deltaY !== 0) {
          scrollDelta = deltaY;
        } else if (deltaY !== 0) {
          scrollDelta = deltaY;
        }
        if (scrollDelta === 0) return;
        e.preventDefault();
        el.scrollLeft += scrollDelta;
        return;
      }

      if (axis === 'y') {
        // Native wheel scroll; only isolate from the 3D viewport / page.
        return;
      }
    },
    [axis, disabled],
  );

  return {
    scrollRef,
    scrollHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onWheel,
    },
  };
}
