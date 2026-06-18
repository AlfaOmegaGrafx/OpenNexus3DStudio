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

  const appContent = viewport.closest('.app-content');
  const sidebar = appContent?.querySelector('.opennexus-sidebar');
  let chipRightInset = 16;
  if (sidebar) {
    const sidebarRect = sidebar.getBoundingClientRect();
    const visibleRight = Math.min(rect.right, sidebarRect.left);
    if (visibleRight > dockLeft) {
      dockWidth = visibleRight - dockLeft;
    }
    // Anchor minimized chip left of the sidebar (fixed panel may extend past viewport margin).
    if (sidebarRect.width > 0 && sidebarRect.left < window.innerWidth) {
      const sidebarClearance = window.innerWidth - sidebarRect.left;
      chipRightInset = Math.max(16, Math.ceil(sidebarClearance + 28));
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

  return () => {
    window.removeEventListener('resize', run);
    window.removeEventListener('orientationchange', run);
    vv?.removeEventListener('resize', run);
    vv?.removeEventListener('scroll', run);
  };
}
