/**
 * Resolve the VRM used for facial expressions (blend shapes, lip sync, webcam, XR).
 * File import wins over modular OpenNexus3DStudio traits when both exist.
 *
 * @param {import('./sceneManager').SceneManager | null | undefined} sceneManager
 * @param {import('./characterManager').CharacterManager | null | undefined} characterManager
 * @returns {import('@pixiv/three-vrm').VRM | null}
 */
export function pickPrimaryExpressionVrm(sceneManager, characterManager) {
  if (sceneManager?.currentVRM) {
    return sceneManager.currentVRM;
  }

  const avatar = characterManager?.avatar;
  if (!avatar || typeof avatar !== 'object') {
    return null;
  }

  const preferredKeys = ['Body', 'body', 'BODY', 'Head', 'head'];
  for (const key of preferredKeys) {
    const vrm = avatar[key]?.vrm;
    if (vrm) return vrm;
  }

  for (const entry of Object.values(avatar)) {
    if (entry?.vrm?.expressionManager) {
      return entry.vrm;
    }
  }

  return Object.values(avatar).map((entry) => entry?.vrm).find(Boolean) ?? null;
}

/**
 * Root Object3D for bone list / skeleton helpers (imported GLB or trait VRM scene).
 *
 * @param {import('./sceneManager').SceneManager | null | undefined} sceneManager
 * @param {import('./characterManager').CharacterManager | null | undefined} characterManager
 * @returns {import('three').Object3D | null}
 */
export function pickPrimaryViewportModelRoot(sceneManager, characterManager) {
  if (sceneManager?.currentModel) {
    return sceneManager.currentModel;
  }

  const vrm = pickPrimaryExpressionVrm(sceneManager, characterManager);
  if (!vrm?.scene) {
    return null;
  }

  if (!vrm.scene.userData?.vrm) {
    vrm.scene.userData = { ...vrm.scene.userData, vrm };
  }
  return vrm.scene;
}

/**
 * All visible trait / import roots in the viewport (for render-mode + skeleton).
 *
 * @param {import('./sceneManager').SceneManager | null | undefined} sceneManager
 * @param {import('./characterManager').CharacterManager | null | undefined} characterManager
 * @returns {import('three').Object3D[]}
 */
export function collectViewportRenderRoots(sceneManager, characterManager) {
  /** @type {import('three').Object3D[]} */
  const roots = [];
  const seen = new Set();

  const add = (root) => {
    if (!root || seen.has(root.uuid)) return;
    seen.add(root.uuid);
    roots.push(root);
  };

  if (sceneManager?.currentModel) {
    add(sceneManager.currentModel);
  }

  const avatar = characterManager?.avatar;
  if (avatar && typeof avatar === 'object') {
    Object.values(avatar).forEach((entry) => {
      if (entry?.model) add(entry.model);
      else if (entry?.vrm?.scene) add(entry.vrm.scene);
    });
  }

  if (roots.length === 0) {
    const fallback = pickPrimaryViewportModelRoot(sceneManager, characterManager);
    if (fallback) add(fallback);
  }

  return roots;
}

export const VIEWPORT_VRM_CHANGED_EVENT = 'characterstudio-viewport-vrm-changed';

/**
 * Resolve the VRM that animation playback should drive (upload wins over CS traits).
 *
 * @param {import('./sceneManager').SceneManager | null | undefined} sceneManager
 * @param {import('./characterManager').CharacterManager | null | undefined} characterManager
 * @returns {import('@pixiv/three-vrm').VRM | null}
 */
export function pickPrimaryAnimationVrm(sceneManager, characterManager) {
  return pickPrimaryExpressionVrm(sceneManager, characterManager);
}

/**
 * Keep AnimationManager focused on one visible rig: uploaded VRM, or CS body when shown.
 *
 * @param {import('./sceneManager').SceneManager | null | undefined} sceneManager
 * @param {import('./characterManager').CharacterManager | null | undefined} characterManager
 * @returns {import('@pixiv/three-vrm').VRM | null}
 */
export function syncAnimationPrimaryTarget(sceneManager, characterManager) {
  const am = characterManager?.animationManager;
  if (!am) return null;

  const uploaded = sceneManager?.currentVRM ?? null;
  const csVisible = characterManager?.isCharacterVisible?.() === true;
  const primary = uploaded ?? (csVisible ? pickPrimaryExpressionVrm(sceneManager, characterManager) : null);

  am.setPrimaryAnimationVrm(primary ?? null);

  const vrmControls = am.animationControls.filter((c) => c.vrm);
  if (primary) {
    vrmControls
      .filter((c) => c.vrm !== primary)
      .slice()
      .forEach((c) => am.removeVRM(c.vrm));

    let control = am.animationControls.find((c) => c.vrm === primary);
    if (!control) {
      am.addVRM(primary);
      control = am.animationControls.find((c) => c.vrm === primary);
    }

    if (primary.humanoid?.autoUpdateHumanBones === false) {
      primary.humanoid.autoUpdateHumanBones = true;
    }

    if (control && am.mixamoModel && am.mixamoAnimations) {
      control.setAnimations(
        am.mixamoAnimations,
        am.mixamoModel,
        am.mouseLookEnabled,
        true,
      );
      control.syncPlaybackActions(am.curAnimID, am.lastAnimID);
      control.from = null;
      control.fadeOutActions = null;
    }
  } else {
    vrmControls.slice().forEach((c) => am.removeVRM(c.vrm));
  }

  return primary;
}
