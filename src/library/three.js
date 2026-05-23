/**
 * Centralized Three.js export (core only).
 * Use this for THREE namespace. For loaders/controls, import from 'three/examples/jsm/...' directly
 * so Vite dep-scan does not fail.
 */
export * from 'three';
import * as THREE from 'three';
export default THREE;
