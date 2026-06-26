import * as THREE from 'three';
import { VRMRigMapMixamo } from './VRMRigMapMixamo.js';
import { collectModelBones } from './rigBoneUtils.js';
import { mixamoRigNameToSkinTokensBone } from './skintokensRigMap.js';
import { validateMixamoRetargetClip } from './vrmMixamoPlaybackGuard.js';

/** mixamorigLeftArm → LeftArm (UniRig / viewport GLB export naming). */
export function mixamoNameToRigBoneName(mixamoRigName) {
    if (!mixamoRigName?.startsWith('mixamorig')) return null;
    const stripped = mixamoRigName.slice('mixamorig'.length);
    if (!stripped) return null;
    return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/** Ensure Mixamo FBX skeleton world matrices are ready for retargeting. */
function prepareMixamoModelForRetarget(mixamoModel) {
    if (!mixamoModel) return mixamoModel;
    mixamoModel.updateMatrixWorld(true);
    return mixamoModel;
}

/**
 * @param {THREE.Object3D} rigRoot
 * @param {string} mixamoRigName
 * @returns {string | null} Scene bone name for AnimationMixer tracks
 */
export function resolveRigBoneTrackName(rigRoot, mixamoRigName) {
    if (!rigRoot || !mixamoRigName) return null;

    if (isSkinTokensRig(rigRoot)) {
        const skinTokensBone = mixamoRigNameToSkinTokensBone(mixamoRigName);
        if (skinTokensBone && rigRoot.getObjectByName(skinTokensBone)) {
            return skinTokensBone;
        }
    }

    const candidates = [
        mixamoNameToRigBoneName(mixamoRigName),
        mixamoRigName,
        mixamoRigName.replace(/^mixamorig/, ''),
    ].filter(Boolean);

    const bones = collectModelBones(rigRoot);
    const byName = new Map(bones.map((b) => [b.name, b]));
    for (const name of candidates) {
        if (byName.has(name)) return name;
    }
    return null;
}

/**
 * Resolve the scene object name used by AnimationMixer for a VRM humanoid bone.
 * Prefers normalized humanoid bones for canned Mixamo (three-vrm convention).
 * Kimodo / studio_motion uses resolveVrmStudioMotionTrackName (same normalized-first rule).
 * @param {import('@pixiv/three-vrm').VRM} vrm
 * @param {string} vrmBoneName
 * @returns {string | null}
 */
function nodeInScene(scene, node) {
    if (!scene || !node) return null;
    if (scene.getObjectByName(node.name) === node) return node.name;
    let found = false;
    scene.traverse((obj) => {
        if (obj === node) found = true;
    });
    return found ? node.name : null;
}

export function resolveVrmBoneTrackName(vrm, vrmBoneName) {
    const humanoid = vrm?.humanoid;
    if (!humanoid || !vrmBoneName) return null;

    const scene = vrm.scene;
    const inScene = (name) => (name && scene?.getObjectByName(name) ? name : null);

    const rawNode = humanoid.getRawBoneNode?.(vrmBoneName) ?? null;
    const normalizedNode = humanoid.getNormalizedBoneNode?.(vrmBoneName) ?? null;
    const rawName = rawNode?.name ?? null;
    const normalizedName = normalizedNode?.name ?? null;

    return (
        nodeInScene(scene, normalizedNode) ??
        nodeInScene(scene, rawNode) ??
        inScene(normalizedName) ??
        inScene(rawName) ??
        inScene(vrmBoneName) ??
        normalizedName ??
        rawName ??
        null
    );
}

/**
 * Kimodo / studio_motion clips must target normalized humanoid bones so mixer
 * output is not overwritten by humanoid.update(). Canned Mixamo uses resolveVrmBoneTrackName (raw-first).
 */
export function resolveVrmStudioMotionTrackName(vrm, vrmBoneName) {
    const humanoid = vrm?.humanoid;
    if (!humanoid || !vrmBoneName) return null;

    const scene = vrm.scene;
    const inScene = (name) => (name && scene?.getObjectByName(name) ? name : null);

    const rawNode = humanoid.getRawBoneNode?.(vrmBoneName) ?? null;
    const normalizedNode = humanoid.getNormalizedBoneNode?.(vrmBoneName) ?? null;
    const rawName = rawNode?.name ?? null;
    const normalizedName = normalizedNode?.name ?? null;

    return (
        nodeInScene(scene, normalizedNode) ??
        nodeInScene(scene, rawNode) ??
        inScene(normalizedName) ??
        inScene(rawName) ??
        inScene(vrmBoneName) ??
        normalizedName ??
        rawName ??
        null
    );
}

/** Prepare VRM humanoid + scene matrices before Mixamo retarget. */
export function prepareVrmForMixamoRetarget(vrm) {
    if (!vrm?.humanoid) return false;
    if (vrm.humanoid.autoUpdateHumanBones === false) {
        vrm.humanoid.autoUpdateHumanBones = true;
    }
    vrm.scene?.updateMatrixWorld?.(true);
    vrm.humanoid.update?.();
    return Boolean(
        vrm.humanoid.getNormalizedBoneNode?.('hips') ??
        vrm.humanoid.getRawBoneNode?.('hips'),
    );
}

/** @returns {'vrm0' | null} */
export function vrmCoordinateFixFlag(vrm) {
    return vrm?.meta?.metaVersion === '0' ? 'vrm0' : null;
}

/** @param {import('three').Object3D | null | undefined} rigRoot */
export function isSkinTokensRig(rigRoot) {
    if (!rigRoot) return false;
    const rigInfo = rigRoot.userData?.autoRigMeta?.rig_info;
    const method = rigInfo?.generation_method ?? rigInfo?.generationMethod ?? '';
    if (method === 'skintokens_tokenrig_cli') return true;
    const genModel = rigRoot.userData?.autoRigMeta?.generation_info?.model;
    if (genModel === 'skintokens_auto_rig') return true;
    return Boolean(rigRoot.userData?.skintokensRig);
}

/**
 * Optional VRM0-style quat axis fix for rigged GLB playback.
 * SkinTokens rigs (Eagle Knight, etc.) must NOT get this — it reverses limbs.
 * UniRig / explicit userData.rigCoordinateFix may still request it.
 * @returns {'vrm0' | null}
 */
export function rigCoordinateFixFlag(rigRoot) {
    if (!rigRoot || isSkinTokensRig(rigRoot)) return null;
    if (rigRoot.userData?.rigCoordinateFix === 'vrm0') return 'vrm0';
    return null;
}

/**
 * Retarget a source local quaternion onto a target bone bind pose (Mixamo→VRM convention).
 * @param {import('three').Object3D | null | undefined} node
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} w
 * @param {{ coordinateFix?: 'vrm0' | null, root?: import('three').Object3D | null }} [options]
 * @returns {[number, number, number, number]}
 */
export function retargetLocalQuatForBoneNode(node, x, y, z, w, options = {}) {
    if (!node?.parent) return [x, y, z, w];

    const root = options.root ?? null;
    root?.updateMatrixWorld?.(true);
    node.parent.updateMatrixWorld?.(true);
    node.updateMatrixWorld?.(true);

    const restRotationInverse = new THREE.Quaternion();
    const parentRestWorldRotation = new THREE.Quaternion();
    const out = new THREE.Quaternion(x, y, z, w);

    node.getWorldQuaternion(restRotationInverse).invert();
    node.parent.getWorldQuaternion(parentRestWorldRotation);
    out.premultiply(parentRestWorldRotation).multiply(restRotationInverse);

    let arr = out.toArray();
    if (options.coordinateFix === 'vrm0') {
        arr = arr.map((v, i) => (i % 2 === 0 ? -v : v));
    }
    return arr;
}

/**
 * Retarget Mixamo local rotation onto a rig bone with a different bind pose (SkinTokens bone_N).
 * Applies world-space delta from Mixamo bind rather than assuming identical rest orientations.
 */
export function retargetMixamoLocalQuatToRigBone(mixamoModel, mixamoNode, targetNode, x, y, z, w, rigRoot) {
    if (!mixamoNode?.parent || !targetNode?.parent) return [x, y, z, w];

    mixamoModel?.updateMatrixWorld?.(true);
    rigRoot?.updateMatrixWorld?.(true);

    const mixamoLocal = new THREE.Quaternion(x, y, z, w);
    const mixamoParentWorld = new THREE.Quaternion();
    const mixamoBindWorld = new THREE.Quaternion();
    mixamoNode.parent.getWorldQuaternion(mixamoParentWorld);
    mixamoNode.getWorldQuaternion(mixamoBindWorld);

    const mixamoAnimWorld = mixamoParentWorld.clone().multiply(mixamoLocal);
    const delta = mixamoBindWorld.clone().invert().multiply(mixamoAnimWorld);

    const targetParentWorld = new THREE.Quaternion();
    const targetBindWorld = new THREE.Quaternion();
    targetNode.parent.getWorldQuaternion(targetParentWorld);
    targetNode.getWorldQuaternion(targetBindWorld);

    const targetAnimWorld = targetBindWorld.clone().multiply(delta);
    const targetLocal = targetParentWorld.clone().invert().multiply(targetAnimWorld);

    return targetLocal.toArray();
}

/**
 * Load Mixamo animation, convert for three-vrm use, and return it.
 *
 * @param {THREE.AnimationClip[]} animations Mixamo FBX animation clips
 * @param {THREE.Object3D} model Mixamo FBX root (skeleton reference)
 * @param {import('@pixiv/three-vrm').VRM} vrm A target VRM
 * @returns {THREE.AnimationClip | null} The converted AnimationClip
 */
export function getMixamoAnimation( animations, model, vrm ) {
    const clip = THREE.AnimationClip.findByName( animations, 'mixamo.com' ); // extract the AnimationClip
    if (clip == null)
        return null;

    prepareMixamoModelForRetarget(model);
    prepareVrmForMixamoRetarget(vrm);

    const mixamoHips = model.getObjectByName( 'mixamorigHips' );
    const vrmHipsNode =
        vrm.humanoid?.getNormalizedBoneNode( 'hips' ) ??
        vrm.humanoid?.getRawBoneNode?.( 'hips' );
    if (!mixamoHips || !vrmHipsNode) {
        console.warn('[Mixamo] Missing hips bone for retargeting (mixamo or VRM).');
        return null;
    }

    const tracks = []; // KeyframeTracks compatible with VRM will be added here

    const restRotationInverse = new THREE.Quaternion();
    const parentRestWorldRotation = new THREE.Quaternion();
    const _quatA = new THREE.Quaternion();
    const _vec3 = new THREE.Vector3();

    // Adjust with reference to hips height.
    const motionHipsHeight = mixamoHips.position.y;
    const vrmHipsY = vrmHipsNode.getWorldPosition( _vec3 ).y;
    const vrmRootY = vrm.scene.getWorldPosition( _vec3 ).y;
    const vrmHipsHeight = Math.abs( vrmHipsY - vrmRootY );
    const hipsPositionScale = motionHipsHeight > 0 ? vrmHipsHeight / motionHipsHeight : 1;

    clip.tracks.forEach( ( origTrack ) => {
        const track = origTrack.clone();
        // Convert each tracks for VRM use, and push to `tracks`
        const trackSplitted = track.name.split( '.' );
        const mixamoRigName = trackSplitted[ 0 ];
        const vrmBoneName = VRMRigMapMixamo[ mixamoRigName ];
        const vrmNodeName = resolveVrmBoneTrackName(vrm, vrmBoneName);
        const mixamoRigNode = model.getObjectByName( mixamoRigName );

        if ( vrmNodeName != null && mixamoRigNode?.parent ) {

            const propertyName = trackSplitted[ 1 ];

            // Store rotations of rest-pose.
            mixamoRigNode.getWorldQuaternion( restRotationInverse ).invert();
            mixamoRigNode.parent.getWorldQuaternion( parentRestWorldRotation );

            if ( track instanceof THREE.QuaternionKeyframeTrack ) {

                // Retarget rotation of mixamoRig to NormalizedBone.
                for ( let i = 0; i < track.values.length; i += 4 ) {

                    const flatQuaternion = track.values.slice( i, i + 4 );

                    _quatA.fromArray( flatQuaternion );

                    // 親のレスト時ワールド回転 * トラックの回転 * レスト時ワールド回転の逆
                    _quatA
                        .premultiply( parentRestWorldRotation )
                        .multiply( restRotationInverse );

                    _quatA.toArray( flatQuaternion );

                    flatQuaternion.forEach( ( v, index ) => {

                        track.values[ index + i ] = v;

                    } );

                }

                tracks.push(
                    new THREE.QuaternionKeyframeTrack(
                        `${vrmNodeName}.${propertyName}`,
                        track.times,
                        track.values.map( ( v, i ) => ( vrm.meta?.metaVersion === '0' && i % 2 === 0 ? - v : v ) ),
                    ),
                );

            } else if ( track instanceof THREE.VectorKeyframeTrack ) {

                const value = track.values.map( ( v, i ) => ( vrm.meta?.metaVersion === '0' && i % 3 !== 1 ? - v : v ) * hipsPositionScale );
                tracks.push( new THREE.VectorKeyframeTrack( `${vrmNodeName}.${propertyName}`, track.times, value ) );

            }

        }

    } );

    if (!tracks.length) {
        console.warn('[Mixamo] Retarget produced no tracks; check FBX bone names and VRM humanoid.');
        return null;
    }

    const animClip = new THREE.AnimationClip( 'vrmAnimation', clip.duration, tracks );
    validateMixamoRetargetClip(vrm, animClip, {
      throwOnViolation: typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test',
    });
    return animClip;

}

/**
 * Retarget Mixamo animation to a plain rigged model (exported GLB / UniRig bones).
 * @param {THREE.AnimationClip[]} animations
 * @param {THREE.Object3D} mixamoModel Mixamo FBX root
 * @param {THREE.Object3D} rigRoot Skinned GLB root in the viewport
 * @returns {THREE.AnimationClip | null}
 */
export function getMixamoAnimationForRig(animations, mixamoModel, rigRoot) {
    const clip = THREE.AnimationClip.findByName(animations, 'mixamo.com');
    if (!clip || !rigRoot) return null;

    const rigCoordFix = rigCoordinateFixFlag(rigRoot);
    const skinTokens = isSkinTokensRig(rigRoot);

    prepareMixamoModelForRetarget(mixamoModel);

    const mixamoHips = mixamoModel.getObjectByName('mixamorigHips');
    const rigHipsName = resolveRigBoneTrackName(rigRoot, 'mixamorigHips');
    const rigHips = rigHipsName ? rigRoot.getObjectByName(rigHipsName) : null;
    if (!mixamoHips || !rigHips) {
        console.warn('[Mixamo] Missing hips for rig retarget (mixamo or exported GLB).');
        return null;
    }

    const tracks = [];
    const restRotationInverse = new THREE.Quaternion();
    const parentRestWorldRotation = new THREE.Quaternion();
    const _quatA = new THREE.Quaternion();
    const _vec3 = new THREE.Vector3();

    const motionHipsHeight = mixamoHips.position.y;
    rigRoot.updateMatrixWorld(true);
    const rigHipsY = rigHips.getWorldPosition(_vec3).y;
    const rigRootY = rigRoot.getWorldPosition(_vec3).y;
    const rigHipsHeight = Math.abs(rigHipsY - rigRootY);
    const hipsPositionScale = motionHipsHeight > 0 ? rigHipsHeight / motionHipsHeight : 1;

    clip.tracks.forEach((origTrack) => {
        const track = origTrack.clone();
        const trackSplitted = track.name.split('.');
        const mixamoRigName = trackSplitted[0];
        const rigNodeName = resolveRigBoneTrackName(rigRoot, mixamoRigName);
        const mixamoRigNode = mixamoModel.getObjectByName(mixamoRigName);

        if (rigNodeName != null && mixamoRigNode?.parent) {
            const propertyName = trackSplitted[1];
            const rigTargetNode = rigRoot.getObjectByName(rigNodeName);

            if (track instanceof THREE.QuaternionKeyframeTrack && rigTargetNode?.parent) {
                mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
                mixamoRigNode.parent.getWorldQuaternion(parentRestWorldRotation);

                const outValues = [];
                for (let i = 0; i < track.values.length; i += 4) {
                    const flatQuaternion = track.values.slice(i, i + 4);
                    _quatA.fromArray(flatQuaternion);
                    _quatA
                        .premultiply(parentRestWorldRotation)
                        .multiply(restRotationInverse);
                    const arr = _quatA.toArray().map((v, idx) =>
                        rigCoordFix === 'vrm0' && idx % 2 === 0 ? -v : v,
                    );
                    outValues.push(...arr);
                }
                tracks.push(
                    new THREE.QuaternionKeyframeTrack(
                        `${rigNodeName}.${propertyName}`,
                        track.times,
                        outValues,
                    ),
                );
            } else if (track instanceof THREE.VectorKeyframeTrack) {
                if (skinTokens) {
                    // Mixamo hips translation is in Mixamo bind space — applying scaled
                    // absolute keys on bone_0 collapses SkinTokens skinning. Rotations only.
                    return;
                }
                const value = track.values.map((v) => v * hipsPositionScale);
                tracks.push(
                    new THREE.VectorKeyframeTrack(
                        `${rigNodeName}.${propertyName}`,
                        track.times,
                        value,
                    ),
                );
            }
        }
    });

    if (!tracks.length) {
        console.warn('[Mixamo] Rig retarget produced no tracks; check exported GLB bone names.');
        return null;
    }

    return new THREE.AnimationClip('rigAnimation', clip.duration, tracks);
}