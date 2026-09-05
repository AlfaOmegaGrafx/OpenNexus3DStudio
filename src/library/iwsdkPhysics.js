/**
 * Shared IWSDK physics helpers for the /xr lab (Havok via @iwsdk/core).
 * Props: Dynamic + Auto shape. Floors/colliders: Static + Box/TriMesh.
 */
import {
  PhysicsBody,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
} from '@iwsdk/core';

/**
 * Dynamic body that falls/settles after grab release.
 * @param {import('@iwsdk/core').Entity} entity
 * @param {object} [options]
 */
export function attachIwsdkDynamicPhysics(entity, options = {}) {
  if (!entity || entity.hasComponent?.(PhysicsBody)) return entity;
  entity.addComponent(PhysicsShape, {
    shape: options.shape ?? PhysicsShapeType.Auto,
    density: options.density ?? 0.8,
    restitution: options.restitution ?? 0.25,
    friction: options.friction ?? 0.6,
  });
  entity.addComponent(PhysicsBody, {
    state: PhysicsState.Dynamic,
    linearDamping: options.linearDamping ?? 0.15,
    angularDamping: options.angularDamping ?? 0.2,
  });
  return entity;
}

/**
 * Immovable collider (floor / world walk mesh).
 * @param {import('@iwsdk/core').Entity} entity
 * @param {object} [options]
 */
export function attachIwsdkStaticPhysics(entity, options = {}) {
  if (!entity || entity.hasComponent?.(PhysicsBody)) return entity;
  entity.addComponent(PhysicsShape, {
    shape: options.shape ?? PhysicsShapeType.Auto,
    friction: options.friction ?? 0.85,
    restitution: options.restitution ?? 0.05,
  });
  entity.addComponent(PhysicsBody, {
    state: PhysicsState.Static,
  });
  return entity;
}
