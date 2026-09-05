/**
 * HTML file pickers do not open during an immersive WebXR session (Galaxy / Quest).
 * End VR briefly, open the picker, then re-enter after the file is chosen — Companion parity.
 */

export const SPACETIME_FILE_PICK_LOG = '[spacetime-xr] file-pick';

/**
 * @param {import('three').WebGLRenderer|null|undefined} renderer
 * @returns {Promise<boolean>} true if a session was ended
 */
export async function endSpacetimeXrForFilePicker(renderer) {
  const session = renderer?.xr?.getSession?.();
  if (!session) return false;

  console.info(`${SPACETIME_FILE_PICK_LOG} ending XR session so OS file picker can open`);
  try {
    await session.end();
  } catch (err) {
    console.warn(`${SPACETIME_FILE_PICK_LOG} session.end failed`, err);
  }

  // Match Companion: brief pause so the browser leaves immersive before the dialog.
  await new Promise((resolve) => setTimeout(resolve, 120));
  try {
    window.focus?.();
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Open a hidden `<input type="file">` — Companion Settings parity.
 * Prefer `showPicker()` / `click()`; `showOpenFilePicker` often never surfaces after XR exit.
 * @param {HTMLInputElement|null|undefined} input
 * @returns {Promise<File|null>}
 */
export async function pickSpacetimeVrmFile(input) {
  if (!input) return null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (file) => {
      if (settled) return;
      settled = true;
      input.removeEventListener('change', onChange);
      resolve(file ?? null);
    };

    const onChange = (event) => {
      const file = event.target.files?.[0] ?? null;
      input.value = '';
      console.info(`${SPACETIME_FILE_PICK_LOG} input change`, {
        name: file?.name || '',
      });
      finish(file);
    };

    input.addEventListener('change', onChange);

    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        console.info(`${SPACETIME_FILE_PICK_LOG} input.showPicker()`);
      } else {
        input.click();
        console.info(`${SPACETIME_FILE_PICK_LOG} input.click()`);
      }
    } catch (err) {
      console.warn(`${SPACETIME_FILE_PICK_LOG} input picker failed`, err);
      try {
        input.click();
        console.info(`${SPACETIME_FILE_PICK_LOG} input.click() fallback`);
      } catch (err2) {
        console.error(`${SPACETIME_FILE_PICK_LOG} input.click failed`, err2);
        finish(null);
      }
    }
  });
}

/**
 * Exit immersive VR if needed, then open the VRM file picker.
 * @param {import('three').WebGLRenderer|null|undefined} renderer
 * @param {HTMLInputElement|null|undefined} input
 * @returns {Promise<{ wasInXr: boolean, file: File|null }>}
 */
export async function openSpacetimeXrFilePicker(renderer, input) {
  const wasInXr = renderer?.xr?.isPresenting === true;
  if (wasInXr) {
    await endSpacetimeXrForFilePicker(renderer);
  }
  const file = await pickSpacetimeVrmFile(input);
  return { wasInXr, file };
}
