/**
 * Transform undo/redo for Adjuster — patterned after Mesh2Motion UndoRedoSystem
 * (scottpetrovic/mesh2motion-app) but scoped to Object3D local transforms.
 */

/**
 * @typedef {{ uuid: string, name: string, position: number[], rotation: number[], scale: number[] }} TransformSnapshot
 */

/**
 * @param {import('three').Object3D} object
 * @returns {TransformSnapshot|null}
 */
export function captureTransformSnapshot(object) {
  if (!object) return null;
  return {
    uuid: object.uuid,
    name: object.name || '',
    position: object.position.toArray(),
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: object.scale.toArray(),
  };
}

/**
 * @param {import('three').Object3D} object
 * @param {TransformSnapshot} snapshot
 */
export function applyTransformSnapshot(object, snapshot) {
  if (!object || !snapshot) return;
  object.position.fromArray(snapshot.position);
  object.rotation.set(snapshot.rotation[0], snapshot.rotation[1], snapshot.rotation[2]);
  object.scale.fromArray(snapshot.scale);
  object.updateMatrixWorld?.(true);
}

/**
 * @param {number} [maxHistory=50]
 */
export function createTransformHistory(maxHistory = 50) {
  /** @type {TransformSnapshot[][]} */
  let undoStack = [];
  /** @type {TransformSnapshot[][]} */
  let redoStack = [];

  return {
    /**
     * @param {TransformSnapshot[]} snapshots
     */
    push(snapshots) {
      if (!snapshots?.length) return;
      undoStack.push(snapshots.map((s) => ({ ...s, position: [...s.position], rotation: [...s.rotation], scale: [...s.scale] })));
      if (undoStack.length > maxHistory) undoStack.shift();
      redoStack = [];
    },

    /**
     * @param {(uuid: string) => (import('three').Object3D|null|undefined)} resolve
     * @param {() => TransformSnapshot[]} captureCurrent
     * @returns {boolean}
     */
    undo(resolve, captureCurrent) {
      if (!undoStack.length) return false;
      const current = captureCurrent();
      if (current?.length) redoStack.push(current);
      const previous = undoStack.pop();
      previous?.forEach((snap) => {
        const obj = resolve(snap.uuid);
        if (obj) applyTransformSnapshot(obj, snap);
      });
      return true;
    },

    /**
     * @param {(uuid: string) => (import('three').Object3D|null|undefined)} resolve
     * @param {() => TransformSnapshot[]} captureCurrent
     * @returns {boolean}
     */
    redo(resolve, captureCurrent) {
      if (!redoStack.length) return false;
      const current = captureCurrent();
      if (current?.length) undoStack.push(current);
      const next = redoStack.pop();
      next?.forEach((snap) => {
        const obj = resolve(snap.uuid);
        if (obj) applyTransformSnapshot(obj, snap);
      });
      return true;
    },

    canUndo() {
      return undoStack.length > 0;
    },

    canRedo() {
      return redoStack.length > 0;
    },

    clear() {
      undoStack = [];
      redoStack = [];
    },
  };
}
