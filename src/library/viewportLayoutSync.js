/**
 * Headset / mobile browser layout: visualViewport often differs from 100vh.
 * Keeps anchored UI inside the visible area and out from under browser chrome.
 */

/**
 * @param {Element | null | undefined} el
 * @returns {number}
 */
function measureBottomOverflow(el) {
  const vv = window.visualViewport;
  if (!el || !vv) return 0;
  const visibleBottom = vv.offsetTop + vv.height;
  return Math.max(0, el.getBoundingClientRect().bottom - visibleBottom);
}

/** Main-viewport width where overlay px sizes look correct on Surface desktop. */
const OVERLAY_REFERENCE_VIEWPORT_W = 960;
const OVERLAY_SCALE_MIN = 0.42;
/** Allow overlays to keep growing toward maximized / ultrawide windows. */
const OVERLAY_SCALE_MAX = 2.5;
const ADJUSTER_HEADSET_WIDTH_PX = 152;
const ADJUSTER_NARROW_VIEW_PX = 720;
/** Galaxy home-space Chrome reports short visual height (~450) with desktop UA. */
const ADJUSTER_SHORT_VIEW_H_PX = 560;

/**
 * Sticky headset flag — Galaxy XR Chrome spoofs desktop Linux UA; once detected, keep it.
 * @param {boolean} on
 */
function markHeadsetUi(on) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.headsetUi = on ? '1' : '0';
}

/**
 * @returns {boolean}
 */
export function isHeadsetBrowserUi() {
  if (typeof document !== 'undefined' && document.documentElement?.dataset?.headsetUi === '1') {
    return true;
  }
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const touch = typeof window !== 'undefined'
    && ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);
  const platform = navigator.platform || '';

  // Explicit mobile / XR tokens.
  if (/Android/i.test(ua) || /Mobile VR|OculusBrowser|Quest|GalaxyXR|XR|SamsungBrowser/i.test(ua)) {
    markHeadsetUi(true);
    return true;
  }

  // Galaxy XR Chrome (CDP-proven): UA is "X11; Linux x86_64" but platform is "Linux armv81" + touch.
  if (touch && /arm/i.test(platform)) {
    markHeadsetUi(true);
    return true;
  }

  if (typeof window !== 'undefined' && touch) {
    const vvW = window.visualViewport?.width || 0;
    const vvH = window.visualViewport?.height || 0;
    const iw = window.innerWidth || 0;
    const ih = window.innerHeight || 0;
    const w = Math.min(vvW || iw, iw || vvW);
    const h = Math.min(vvH || ih, ih || vvH);
    // Short home-space pane (Galaxy ~452) or narrow width.
    if ((h > 0 && h < ADJUSTER_SHORT_VIEW_H_PX) || (w > 0 && w < ADJUSTER_NARROW_VIEW_PX)) {
      markHeadsetUi(true);
      return true;
    }
  }
  return false;
}

/**
 * Effective width for overlay scale — prefer the smallest positive layout/visual width.
 * Galaxy Chrome can report a wide `.main-viewport` while the visible pane is narrower.
 * @returns {number}
 */
function resolveOverlayWidthPx() {
  if (typeof window === 'undefined') return OVERLAY_REFERENCE_VIEWPORT_W;
  const viewport = document.querySelector('.main-viewport');
  const vw = viewport?.getBoundingClientRect().width || 0;
  const vv = window.visualViewport?.width || 0;
  const iw = window.innerWidth || 0;
  const candidates = [vw, vv, iw].filter((n) => typeof n === 'number' && n > 0);
  return candidates.length ? Math.min(...candidates) : OVERLAY_REFERENCE_VIEWPORT_W;
}

/**
 * @returns {number}
 */
function computeViewportUiScale() {
  return getViewportUiScaleForWidth(resolveOverlayWidthPx());
}

/**
 * Adjuster uses the same scale as the animation bar so both enlarge in unison on resize.
 * @param {number} baseScale
 * @returns {number}
 */
export function getAdjusterOverlayScale(baseScale) {
  const safe =
    typeof baseScale === 'number' && Number.isFinite(baseScale) && baseScale > 0
      ? baseScale
      : 1;
  return Math.min(OVERLAY_SCALE_MAX, Math.max(OVERLAY_SCALE_MIN, safe));
}

/** @returns {number} Exported for tests. */
export function getViewportUiScaleForWidth(viewportWidthPx) {
  if (!viewportWidthPx || viewportWidthPx <= 0) return 1;
  return Math.min(
    OVERLAY_SCALE_MAX,
    Math.max(OVERLAY_SCALE_MIN, viewportWidthPx / OVERLAY_REFERENCE_VIEWPORT_W),
  );
}

/**
 * Apply overlay scale. Galaxy XR Chrome often ignores `transform: scale(var(...))` in
 * stylesheets, so set transform inline on the animation bar + adjuster panels.
 * @param {number} scale
 */
export function applyViewportOverlayScale(scale) {
  if (typeof document === 'undefined') return;
  const safe =
    typeof scale === 'number' && Number.isFinite(scale) && scale > 0
      ? Math.min(OVERLAY_SCALE_MAX, Math.max(OVERLAY_SCALE_MIN, scale))
      : 1;
  const scaleStr = String(safe);
  document.documentElement.style.setProperty('--viewport-ui-scale', scaleStr);

  const animationBar = document.querySelector('[data-animation-bar="true"]');
  if (animationBar instanceof HTMLElement) {
    animationBar.style.transform = `scale(${scaleStr})`;
    animationBar.style.transformOrigin = 'bottom center';
    // Galaxy XR: scaled ancestors with pointer-events:auto can swallow page hits.
    animationBar.style.pointerEvents = 'none';
    for (const child of animationBar.children) {
      if (child instanceof HTMLElement) child.style.pointerEvents = 'auto';
    }
  }

  const headset = isHeadsetBrowserUi();
  if (headset) markHeadsetUi(true);

  const adjuster = document.querySelector('.m2m-overlay');
  if (adjuster instanceof HTMLElement) {
    const adjusterScale = getAdjusterOverlayScale(safe);
    // Inline transform is required — Galaxy Chrome often ignores CSS-var scale on this node.
    adjuster.style.transform = `scale(${adjusterScale})`;
    adjuster.style.transformOrigin = 'top right';
    adjuster.dataset.headsetUi = headset ? '1' : '0';
    if (headset) {
      adjuster.style.width = `${ADJUSTER_HEADSET_WIDTH_PX}px`;
      adjuster.style.maxWidth = '36vw';
    } else {
      adjuster.style.width = '';
      adjuster.style.maxWidth = '';
    }
    // Same hit-steal guard as animation bar (Galaxy XR Chrome + scale).
    adjuster.style.pointerEvents = 'none';
    for (const child of adjuster.children) {
      if (child instanceof HTMLElement) child.style.pointerEvents = 'auto';
    }
  }
}

function syncViewportOverlayScale() {
  applyViewportOverlayScale(computeViewportUiScale());
}

/**
 * Update document-level inset CSS variables from visualViewport.
 */
export function syncDocumentViewportInsets() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const vv = window.visualViewport;
  let topInset = 0;
  let bottomInset = 0;
  let visibleHeight = window.innerHeight;

  if (vv) {
    topInset = Math.max(0, Math.round(vv.offsetTop));
    bottomInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    visibleHeight = Math.round(vv.height);
  }

  document.querySelectorAll('[data-viewport-anchored]').forEach((node) => {
    bottomInset = Math.max(bottomInset, Math.ceil(measureBottomOverflow(node)) + 4);
  });

  const animationBar = document.querySelector('[data-animation-bar="true"]');
  if (animationBar) {
    bottomInset = Math.max(bottomInset, Math.ceil(measureBottomOverflow(animationBar)) + 4);
  }

  const root = document.documentElement;
  root.style.setProperty('--viewport-top-inset', `${topInset}px`);
  root.style.setProperty('--viewport-bottom-inset', `${bottomInset}px`);
  root.style.setProperty('--app-visible-height', `${visibleHeight}px`);
  syncViewportOverlayScale();
}

/**
 * Pin animation bar container to the main 3D viewport (never over OpenNexus3DStudio avatar sidebar).
 *
 * @param {HTMLElement | null} container
 */
export function syncAnimationBarDock(container) {
  if (!container) return;

  const viewport = container.closest('.main-viewport');
  if (!viewport) {
    container.classList.remove('is-viewport-docked');
    return;
  }

  container.classList.add('is-viewport-docked');
  const rect = viewport.getBoundingClientRect();
  let dockLeft = rect.left;
  let dockWidth = rect.width;
  let bottomGap = Math.max(0, Math.round(window.innerHeight - rect.bottom));

  const vv = window.visualViewport;
  if (vv) {
    const visibleBottom = vv.offsetTop + vv.height;
    if (rect.bottom > visibleBottom) {
      bottomGap = Math.max(bottomGap, Math.round(rect.bottom - visibleBottom));
    }
  }

  const appRoot = viewport.closest('.app');
  const sidebar = appRoot?.querySelector('.opennexus-sidebar');
  const chipRightInset = 12;
  if (sidebar) {
    const sidebarRect = sidebar.getBoundingClientRect();
    const visibleRight = Math.min(rect.right, sidebarRect.left);
    if (visibleRight > dockLeft) {
      dockWidth = visibleRight - dockLeft;
    }
  }

  const bar = container.querySelector('[data-animation-bar="true"]');
  const chip = container.querySelector('[data-animation-bar-chip="true"]');
  const overflow = Math.max(
    measureBottomOverflow(bar),
    measureBottomOverflow(chip),
  );
  if (overflow > 0) {
    bottomGap = Math.max(bottomGap, Math.ceil(overflow) + 8);
  }

  container.style.setProperty('--dock-left', `${dockLeft}px`);
  container.style.setProperty('--dock-width', `${dockWidth}px`);
  container.style.setProperty('--dock-bottom-gap', `${bottomGap}px`);
  container.style.setProperty('--dock-chip-right-inset', `${chipRightInset}px`);
  syncViewportOverlayScale();
}

/**
 * @param {() => void} callback
 * @returns {() => void} cleanup
 */
export function subscribeViewportLayoutSync(callback) {
  if (typeof window === 'undefined') return () => {};

  const run = () => {
    syncDocumentViewportInsets();
    callback();
  };

  run();
  window.addEventListener('resize', run);
  window.addEventListener('orientationchange', run);
  const vv = window.visualViewport;
  vv?.addEventListener('resize', run);
  vv?.addEventListener('scroll', run);

  const viewport = document.querySelector('.main-viewport');
  const viewportObserver = viewport && typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(run)
    : null;
  if (viewport && viewportObserver) {
    viewportObserver.observe(viewport);
  }

  // Adjuster mounts only after a model loads — re-apply scale when it appears.
  const mo = typeof MutationObserver !== 'undefined'
    ? new MutationObserver(() => {
      if (document.querySelector('.m2m-overlay')) syncViewportOverlayScale();
    })
    : null;
  mo?.observe(document.body, { childList: true, subtree: true });

  return () => {
    window.removeEventListener('resize', run);
    window.removeEventListener('orientationchange', run);
    vv?.removeEventListener('resize', run);
    vv?.removeEventListener('scroll', run);
    viewportObserver?.disconnect();
    mo?.disconnect();
  };
}
