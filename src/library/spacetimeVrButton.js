/**
 * Galaxy-safe VR entry for Space-Time — hand-tracking + bounded-floor (OpenNexus parity).
 */
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XR_HAND_TRACKING_FEATURE } from './sceneManagerXrConstants.js';

/** @type {import('three').WebGLRenderer|null} */
let _boundRenderer = null;

/**
 * @param {import('three').WebGLRenderer} renderer
 * @returns {Promise<XRSession|null>}
 */
export async function requestSpacetimeVrSession(renderer) {
  if (!renderer?.xr || !navigator.xr) {
    console.error('[spacetime-xr] WebXR unavailable');
    return null;
  }

  try {
    const supported = await navigator.xr.isSessionSupported('immersive-vr');
    if (!supported) {
      console.error('[spacetime-xr] immersive-vr not supported');
      return null;
    }

    const sessionInit = {
      requiredFeatures: [],
      optionalFeatures: [
        'bounded-floor',
        'local-floor',
        'local',
        'viewer',
        XR_HAND_TRACKING_FEATURE,
      ],
    };

    const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
    await renderer.xr.setSession(session);
    console.info('[spacetime-xr] VR session started', {
      features: session.enabledFeatures ? [...session.enabledFeatures] : [],
    });
    return session;
  } catch (err) {
    console.error('[spacetime-xr] VR session failed', err);
    return null;
  }
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {HTMLElement} [container]
 * @returns {HTMLButtonElement|null}
 */
export function createSpacetimeVrButton(renderer, container) {
  if (!renderer?.xr) return null;

  _boundRenderer = renderer;

  let vrButton;
  try {
    vrButton = VRButton.createButton(renderer, {
      requiredFeatures: ['bounded-floor'],
      optionalFeatures: [
        'local-floor',
        'local',
        'viewer',
        XR_HAND_TRACKING_FEATURE,
      ],
    });
  } catch {
    vrButton = VRButton.createButton(renderer);
  }

  if (!vrButton) return null;

  vrButton.classList.add('spacetime-xr-vr-btn');
  vrButton.title = 'Enter Virtual Reality';

  const onEnter = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    await requestSpacetimeVrSession(renderer);
  };

  vrButton.addEventListener('click', onEnter, true);

  if (container) {
    container.appendChild(vrButton);
  }

  return vrButton;
}

/**
 * Re-enter VR after a file pick (uses renderer from createSpacetimeVrButton).
 * @param {import('three').WebGLRenderer|null|undefined} [renderer]
 */
export async function reenterSpacetimeVr(renderer = _boundRenderer) {
  if (!renderer) return;
  console.info('[spacetime-xr] re-entering VR after file pick');
  await requestSpacetimeVrSession(renderer);
}
