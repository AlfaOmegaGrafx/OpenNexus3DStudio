import { Group, MeshStandardMaterial, Color } from "three"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter"
import { cloneSkeleton, combine, combineNoAtlas } from "./merge-geometry"
import { VRMExporter } from "./VRMExporter"
import VRMExporterv0 from "./VRMExporterv0"
import { findChildrenByType } from "./utils"
import { VRMHumanBoneName, VRMExpression, VRMExpressionPresetName, VRMExpressionManager, VRMExpressionMorphTargetBind} from "@pixiv/three-vrm";
import { doesMeshHaveMorphTargetBoundToManager } from './utils';
import { GetMetadataFromAvatar } from "./vrmMetaUtils"
import { VRMRigMapMixamo } from './VRMRigMapMixamo.js';


function cloneAvatarModel (model){
  // Fix circular reference issue: VRM objects contain circular references (vrm -> scene -> object -> userData -> vrm)
  // We need to temporarily remove these circular references before cloning
  const circularRefs = new Map();
  
  // Store circular references before removing them
  model.traverse((child) => {
    if (child.userData && child.userData.vrm) {
      circularRefs.set(child, child.userData.vrm);
      // Temporarily remove circular reference
      delete child.userData.vrm;
    }
  });
  
  try {
    const clone = model.clone();
    
    /*
      NOTE: After avatar clone, the origIndexBuffer/BufferAttribute in userData will lost many infos:
      From: BufferAttribute {isBufferAttribute: true, name: '', array: Uint32Array(21438), itemSize: 1, count: 21438, …}
      To:   Object          {itemSize: 1, type: 'Uint32Array',  array: Array(21438), normalized: false}
      Especailly notics the change of `array` type, and lost of `count` property, will cause errors later.
      So have to reassign `userData.origIndexBuffer` after avatar clone.
    */
    const origIndexBuffers = []
    model.traverse((child) => {
      if (child.userData && child.userData.origIndexBuffer)
        origIndexBuffers.push(child.userData.origIndexBuffer)
    })
    clone.traverse((child) => {
      if (child.userData && child.userData.origIndexBuffer)
        child.userData.origIndexBuffer = origIndexBuffers.shift()
    })
    
    return clone;
  } finally {
    // Restore circular references in original model
    circularRefs.forEach((vrm, child) => {
      if (child.userData) {
        child.userData.vrm = vrm;
      }
    });
  }
}
function getUnopotimizedGLB (model){

    const modelClone = cloneAvatarModel(model)
    let skeleton
    const skinnedMeshes = []

    modelClone.traverse((child) => {
      if (!skeleton && child.isSkinnedMesh) {
        skeleton = cloneSkeleton(child)
      }
      if (child.isSkinnedMesh) {
        child.geometry = child.geometry.clone()
        child.skeleton = skeleton
        skinnedMeshes.push(child)
        if (Array.isArray(child.material)) {
          const materials = child.material
          child.material = new MeshStandardMaterial()
          child.material.map = materials[0].map
        }
        if (child.userData.origIndexBuffer) {
          child.geometry.setIndex(child.userData.origIndexBuffer)
        }
      }
    })

    const unoptimizedGLB = new Group()
    skinnedMeshes.forEach((skinnedMesh) => {
      unoptimizedGLB.add(skinnedMesh)
    })
    unoptimizedGLB.add(skeleton.bones[0])

    return unoptimizedGLB;
}


/**
 * Export viewport model to GLB for API upload (plain GLTF/Trellis meshes — no atlas/shader pipeline).
 * @param {import('three').Object3D} model
 * @returns {Promise<Blob>}
 */
export async function exportViewportModelGlbBlob(model) {
  const modelClone = cloneAvatarModel(model);
  const glb = await parseGLB(modelClone);
  return new Blob([glb], { type: 'model/gltf-binary' });
}

export async function getGLBBlobData(model, options = {}){
  const { optimized = true, forApiUpload = false } = options;
  if (forApiUpload || optimized === false) {
    return exportViewportModelGlbBlob(model);
  }
  const finalModel = await getOptimizedGLB(model, null, options);
  const glb = await parseGLB(finalModel);
  return new Blob([glb], { type: 'model/gltf-binary' });
}

export async function getVRMBlobData(model, avatar, options = {}){
  const finalModel = await getOptimizedGLB(model, avatar, options)
  const vrm = await parseVRM(finalModel, avatar, options);
  // save it as glb now
  return new Blob([vrm], { type: 'model/gltf-binary' });
}

// returns a promise with the parsed data
async function getGLBData(model, options = {}){
  const { optimized = true } = options;
  if (optimized){
    const finalModel = await getOptimizedGLB(model, null, options)
    return parseGLB(finalModel); 
  }
  else{
    const finalModel = getUnopotimizedGLB(model)
    return parseGLB(finalModel);
  }
} 

/**
 * Downloads a VRM model with specified options.
 *
 * @param {Object} model - The 3D model object.
 * @param {Object} vrmData - The VRM initial loaded data for the model.
 * @param {string} fileName - The name of the file to be downloaded.
 * @param {Object} options - Additional options for the download.
 * @param {Object} options.screenshot - An optional screenshot for the model.
 * @param {number} options.mToonAtlasSize - Atlas size for opaque parts when using MToon material.
 * @param {number} options.mToonAtlasSizeTransp - Atlas size for transparent parts when using MToon material.
 * @param {number} options.stdAtlasSize - Atlas size for opaque parts when using standard materials.
 * @param {number} options.stdAtlasSizeTransp - Atlas size for transparent parts when using standard materials.
 * @param {boolean} options.exportMtoonAtlas - Whether to export the MToon material atlas.
 * @param {boolean} options.exportStdAtlas - Whether to export the standard material atlas.
 * @param {number} options.scale - Scaling factor for the model.
 * @param {boolean} options.isVrm0 - Whether the VRM version is 0 (true) or 1 (false).
 * @param {Object} options.vrmMeta - Additional metadata for the VRM model.
 * @param {boolean} options.createTextureAtlas - Whether to create a texture atlas.
 * @param {boolean} options.optimized - Whether to optimize the VRM model.
 * @param {boolean} options.ktxCompression - Whether to use ktx2 type texture compression.
 */
export async function downloadVRM(model,vrmData,fileName, options){


    const avatar = {_optimized:{vrm:vrmData}}
    downloadVRMWithAvatar(model, avatar, fileName, options)
}

export function downloadVRMWithAvatar(model, avatar, fileName, options){
  return new Promise(async (resolve, reject) => {
    const downloadFileName = `${
      fileName && fileName !== "" ? fileName : "AvatarCreatorModel"
    }`
    try{
      // OPTIMIZED: Enable texture atlas by default (ported from CharacterStudioRedux)
      // Use atlas sizes from manifest defaults if not provided
      // FIX: Determine shader type from options (standard supports ORM, toon does not)
      const useStandardShader = options.shaderType === 'standard' || (options.exportStdAtlas && !options.exportMtoonAtlas);
      const defaultAtlasOptions = {
        mToonAtlasSize: 2048,        // OPTIMIZED: Default from CharacterManifestData
        mToonAtlasSizeTransp: 1024,  // OPTIMIZED: Default from CharacterManifestData
        stdAtlasSize: 2048,          // OPTIMIZED: Default from CharacterManifestData
        stdAtlasSizeTransp: 1024,    // OPTIMIZED: Default from CharacterManifestData
        exportMtoonAtlas: !useStandardShader,  // FIX: Use MToon atlas only for toon shader
        exportStdAtlas: useStandardShader,     // FIX: Use standard atlas for standard shader (supports ORM)
      };
      
      // OPTIMIZED: Enable texture atlas by default (matches CharacterStudioRedux)
      // IMPORTANT: createTextureAtlas must come AFTER options merge to override any false values
      const fallbackOptions = {
        mergeAppliedMorphs: true,
        ...defaultAtlasOptions,
        ...options,  // User options override defaults
        createTextureAtlas: options.createTextureAtlas !== undefined ? options.createTextureAtlas : true  // OPTIMIZED: Force true unless explicitly disabled
      };
      
      console.log('🔄 VRM Export Options:', fallbackOptions);
      
      const vrm = await getVRMData(model, avatar, fallbackOptions);
      saveArrayBuffer(vrm, `${downloadFileName}.vrm`)
      resolve();
    }catch(err){
      console.error('downloadVRMWithAvatar failed', err);
      
      // Try fallback with minimal options (but still try atlas)
      try {
        console.log('Attempting fallback VRM export with minimal options...');
        const minimalOptions = {
          createTextureAtlas: true,  // OPTIMIZED: Still try atlas in fallback
          mergeAppliedMorphs: true,
          scale: 1,
          isVrm0: true,
          ...defaultAtlasOptions
        };
        
        const fallbackVrm = await getVRMData(model, avatar, minimalOptions);
        saveArrayBuffer(fallbackVrm, `${downloadFileName}_fallback.vrm`);
        console.log('Fallback VRM export successful');
        resolve();
      } catch (fallbackErr) {
        console.error('Fallback VRM export also failed:', fallbackErr);
        // Last resort: no atlas
        try {
          console.log('Attempting final fallback without atlas...');
          const noAtlasOptions = {
            createTextureAtlas: false,
            mergeAppliedMorphs: false,
            scale: 1,
            isVrm0: true
          };
          const finalVrm = await getVRMData(model, avatar, noAtlasOptions);
          saveArrayBuffer(finalVrm, `${downloadFileName}_no_atlas.vrm`);
          console.log('Final fallback (no atlas) VRM export successful');
          resolve();
        } catch (finalErr) {
          console.error('All VRM export attempts failed:', finalErr);
          reject(finalErr);
        }
      }
    }
  });
}

async function getVRMData(model, avatar, options){
  const vrmModel = await getOptimizedGLB(model,avatar, options);
  return parseVRM(vrmModel,avatar,options) 
}

function getOptimizedGLB(model, avatar, options){
  // Legacy call sites passed (model, options) — second arg is options, not avatar
  if (options === undefined && avatar && typeof avatar === 'object' && avatar.shaderType !== undefined) {
    options = avatar;
    avatar = null;
  }
  options = options || {};
  const modelClone = cloneAvatarModel(model)
  
  // OPTIMIZED: Enable texture atlas by default (ported from CharacterStudioRedux)
  // Set default options with atlas enabled for optimization
  // IMPORTANT: createTextureAtlas must come AFTER options merge to override any false values
  // FIX: Determine shader type from options (standard supports ORM, toon does not)
  const shaderType = options.shaderType ?? 'standard';
  const useStandardShader = shaderType === 'standard' || (options.exportStdAtlas && !options.exportMtoonAtlas);
  const defaultOptions = {
    mergeAppliedMorphs: true,
    scale: 1,
    isVrm0: false,
    // OPTIMIZED: Use optimized atlas sizes from CharacterManifestData defaults
    mToonAtlasSize: 2048,
    mToonAtlasSizeTransp: 1024,
    stdAtlasSize: 2048,
    stdAtlasSizeTransp: 1024,
    exportMtoonAtlas: !useStandardShader,  // FIX: Use MToon atlas only for toon shader
    exportStdAtlas: useStandardShader,     // FIX: Use standard atlas for standard shader (supports ORM)
    ...options,  // User options override defaults
    // Force createTextureAtlas to true unless explicitly set to false
    createTextureAtlas: options.createTextureAtlas === false ? false : true  // OPTIMIZED: Force true unless explicitly disabled
  };
  
  console.log('🔄 getOptimizedGLB - Shader type:', useStandardShader ? 'standard (ORM supported)' : 'toon (no ORM)', {
    shaderType: options.shaderType,
    exportMtoonAtlas: defaultOptions.exportMtoonAtlas,
    exportStdAtlas: defaultOptions.exportStdAtlas
  });
  
  try {
    if (defaultOptions.createTextureAtlas){
      console.log('🔄 Using texture atlas mode for VRM export with optimized sizes:', {
        mToonAtlasSize: defaultOptions.mToonAtlasSize,
        mToonAtlasSizeTransp: defaultOptions.mToonAtlasSizeTransp,
        stdAtlasSize: defaultOptions.stdAtlasSize,
        stdAtlasSizeTransp: defaultOptions.stdAtlasSizeTransp
      });
      return combine(modelClone, avatar, defaultOptions);
    }
    else{
      console.log("Using no atlas mode for VRM export");
      return combineNoAtlas(modelClone, avatar, defaultOptions);
    }
  } catch (error) {
    console.error('Error in getOptimizedGLB:', error);
    // Fallback to no atlas mode
    console.log('Falling back to no atlas mode');
    return combineNoAtlas(modelClone, avatar, { ...defaultOptions, createTextureAtlas: false });
  }
}


export async function downloadGLB(model, fileName = "", options){
  const downloadFileName = `${
    fileName && fileName !== "" ? fileName : "AvatarCreatorModel"
  }`

  const {optimized = true} = options;

  const finalModel = optimized ?
    await getOptimizedGLB(model, null, options):
    getUnopotimizedGLB(model)

  parseGLB(finalModel)
    .then((result) => {
      if (result instanceof ArrayBuffer) {
        saveArrayBuffer(result, `${downloadFileName}.glb`)
      } else {
        const output = JSON.stringify(result, null, 2)
        saveString(output, `${downloadFileName}.gltf`)
      }
    })
}

function parseGLB (glbModel){
  return new Promise((resolve) => {
    const exporter =  new GLTFExporter();
    return exporter.parse(
        glbModel,
        (result) => {
          resolve(result)
        },
        (error) => {
          console.error("Error parsing", error)
        },
        {
          trs: false,
          onlyVisible: false,
          truncateDrawRange: true,
          binary: true,
          forcePowerOfTwoTextures: false,
          maxTextureSize: 1024 || Infinity,
        },
      )
  })
}

/**
 * 
 * @param {Record<string, Record<string,any>>} avatar 
 * @returns  {GroupSpringBones[]}
 */
function getGroupSpringBones (avatar) {

  /**
   * @typedef {Object} GroupSpringBones
   * @property {THREE.Bone[]} bones
   * @property {VRMSpringBoneJointSettings} settings
   * @property {VRMSpringBoneColliderGroup[]} colliderGroups
   * @property {string} name
   * @property {any} center
   */

  /**
   * @type {Object[]}
   */
  const finalSpringBones= [];

  // add non repeating spring bones
  for(const trait in avatar){
    if (avatar[trait]?.vrm?.springBoneManager!= null){
        const joints = avatar[trait].vrm.springBoneManager.joints;
        for (const item of joints) {
          const doesNameExist = finalSpringBones.some(boneData => boneData.name === item.bone.name);
          if (!doesNameExist) {
            finalSpringBones.push({
              name:item.bone.name, 
              settings:item.settings, 
              bone:item.bone, 
              colliderGroups:item.colliderGroups,
              center:item.center
            }); 
          }

        }
    }
  }

  //get only the root bone of the last array
  /**
   * @type {GroupSpringBones[]}
   */
  const groupSpringBones = [];

    // create a group for each root bone
    finalSpringBones.forEach(springBone => {
      const parent = finalSpringBones.find(bone => bone.name == springBone.bone.parent?.name)
      if(parent == null){
        // current spring bone is a root bone
        groupSpringBones.push({
          bones:[springBone],
          settings:springBone.settings,
          center:springBone.center,
          colliderGroups:springBone.colliderGroups,
          name:springBone.bone.name
        });
        return;
      }
    })

    finalSpringBones.map((springBone) => {
      const group = groupSpringBones.find(group => group.bones.find(bone => bone.name == springBone.bone.parent?.name) != null);
      if(group != null){
        group.bones.push({
          name:springBone.name,
          bone:springBone.bone
        });
      }
    })

  return groupSpringBones;
}

function getRootBones (avatar) {
  const finalSpringBones = [];
  //const springBonesData = [];
  
  // add non repeating spring bones
  for(const trait in avatar){
    if (avatar[trait]?.vrm?.springBoneManager!= null){
        const joints = avatar[trait].vrm.springBoneManager.joints;
        for (const item of joints) {
          const doesNameExist = finalSpringBones.some(boneData => boneData.name === item.bone.name);
          if (!doesNameExist) {
            finalSpringBones.push({
              name:item.bone.name, 
              settings:item.settings, 
              bone:item.bone, 
              colliderGroups:item.colliderGroups,
              center:item.center
            }); 
          }

        }
    }
    
  }

  //get only the root bone of the last array
  const rootSpringBones = [];
  finalSpringBones.forEach(springBone => {
    for (const boneName in VRMHumanBoneName) {
      if(springBone.bone.parent.name == VRMHumanBoneName[boneName]){
        rootSpringBones.push(springBone);
        break;
      }
    }
  });
  return rootSpringBones;
}

/** Loot / Mixamo / UniRig scene bone names → VRM humanoid keys (camelCase). */
const SCENE_BONE_TO_HUMANOID_KEY = {
  J_Bip_C_Hips: 'hips',
  J_Bip_C_Spine: 'spine',
  J_Bip_C_Chest: 'chest',
  J_Bip_C_UpperChest: 'upperChest',
  J_Bip_C_Neck: 'neck',
  J_Bip_C_Head: 'head',
  J_Bip_L_Shoulder: 'leftShoulder',
  J_Bip_L_UpperArm: 'leftUpperArm',
  J_Bip_L_LowerArm: 'leftLowerArm',
  J_Bip_L_Hand: 'leftHand',
  J_Bip_R_Shoulder: 'rightShoulder',
  J_Bip_R_UpperArm: 'rightUpperArm',
  J_Bip_R_LowerArm: 'rightLowerArm',
  J_Bip_R_Hand: 'rightHand',
  J_Bip_L_UpperLeg: 'leftUpperLeg',
  J_Bip_L_LowerLeg: 'leftLowerLeg',
  J_Bip_L_Foot: 'leftFoot',
  J_Bip_L_ToeBase: 'leftToes',
  J_Bip_R_UpperLeg: 'rightUpperLeg',
  J_Bip_R_LowerLeg: 'rightLowerLeg',
  J_Bip_R_Foot: 'rightFoot',
  J_Bip_R_ToeBase: 'rightToes',
};

function humanoidKeyFromSceneBoneName(boneName) {
  if (!boneName) return null;
  if (SCENE_BONE_TO_HUMANOID_KEY[boneName]) return SCENE_BONE_TO_HUMANOID_KEY[boneName];

  for (const enumKey in VRMHumanBoneName) {
    const standardName = VRMHumanBoneName[enumKey];
    if (standardName === boneName) {
      return enumKey.charAt(0).toLowerCase() + enumKey.slice(1);
    }
  }

  const mixamoName = boneName.startsWith('mixamorig')
    ? boneName
    : `mixamorig${boneName.charAt(0).toUpperCase()}${boneName.slice(1)}`;
  return VRMRigMapMixamo[mixamoName] ?? null;
}

function renameSkeletonBonesToHumanoidKeys(humanBones) {
  for (const [humanoidKey, entry] of Object.entries(humanBones)) {
    if (entry?.node?.isBone) entry.node.name = humanoidKey;
  }
}

function getHumanoidByBoneNames(skinnedMesh){
  if (!skinnedMesh || !skinnedMesh.skeleton || !skinnedMesh.skeleton.bones) {
    console.warn('⚠️ getHumanoidByBoneNames: Invalid skinnedMesh, returning empty humanBones');
    return {};
  }
  const humanBones = {};
  for (const bone of skinnedMesh.skeleton.bones) {
    const humanoidKey = humanoidKeyFromSceneBoneName(bone.name);
    if (humanoidKey && !humanBones[humanoidKey]) {
      humanBones[humanoidKey] = { node: bone };
    }
  }
  renameSkeletonBonesToHumanoidKeys(humanBones);
  return humanBones;
}

function getAvatarData (avatarModel, vrmMeta, options){
  const skinnedMeshes = findChildrenByType(avatarModel, "SkinnedMesh")
  if (!skinnedMeshes || skinnedMeshes.length === 0) {
    console.warn('⚠️ getAvatarData: No SkinnedMesh found in avatarModel, using empty humanBones');
    return {
      humanBones: {},
      materials: avatarModel.userData?.atlasMaterial || [],
      meta: getVRMMeta(vrmMeta),
      ...(options.mergeAppliedMorphs ? {expressionManager: getRebindedVRMExpressionManager(avatarModel)} : {}),
    };
  }
  return{
    humanBones:getHumanoidByBoneNames(skinnedMeshes[0]),
    materials : avatarModel.userData?.atlasMaterial || [],
    meta : getVRMMeta( vrmMeta),
    ...(options.mergeAppliedMorphs?{expressionManager:getRebindedVRMExpressionManager(avatarModel)}:{}),
  }
}

function getVRMMeta( vrmMeta){
  vrmMeta = vrmMeta||{}

  const defaults = {
    authors:["OpenNexus3DStudio"],
    metaVersion:"1",
    version:"v1",
    name:"CharacterCreator",
    licenseUrl:"https://vrm.dev/licenses/1.0/",
    commercialUssageName: "personalNonProfit",
    contactInformation: "https://m3org.com/", 
    allowExcessivelyViolentUsage:false,
    allowExcessivelySexualUsage:false,
    allowPoliticalOrReligiousUsage:false,
    allowAntisocialOrHateUsage:false,
    creditNotation:"required",
    allowRedistribution:false,
    modification:"prohibited"
  }

  return { ...defaults, ...vrmMeta };
}

async function parseVRM (glbModel, avatar, options){
  const {
    screenshot = null, 
    isVrm0 = false,
    vrmMeta = null,
    scale = 1,
    vrmName = "CharacterCreator"
  } = options
  
  // OPTIMIZED: Convert screenshot to ImageBitmap format if needed (for VRMExporterv0 compatibility)
  // VRMExporterv0 expects: { image: ImageBitmap }
  let processedScreenshot = screenshot;
  if (screenshot) {
    try {
      console.log('🖼️ Processing screenshot for VRM export:', {
        isTexture: screenshot.isTexture,
        hasImage: !!screenshot.image,
        imageType: screenshot.image?.constructor?.name,
        imageWidth: screenshot.image?.width,
        imageHeight: screenshot.image?.height
      });
      
      // If screenshot is a THREE.Texture (from getScreenshotTexture)
      if (screenshot.isTexture && screenshot.image) {
        // THREE.Texture.image is an HTMLImageElement or ImageBitmap
        const imgElement = screenshot.image;
        if (imgElement instanceof ImageBitmap) {
          processedScreenshot = { image: imgElement };
          console.log('✅ Screenshot texture already contains ImageBitmap');
        } else if (imgElement instanceof HTMLImageElement || imgElement instanceof HTMLCanvasElement) {
          // Convert HTMLImageElement/Canvas to ImageBitmap
          const bitmap = await createImageBitmap(imgElement);
          processedScreenshot = { image: bitmap };
          console.log('✅ Converted THREE.Texture screenshot to ImageBitmap');
        } else {
          // Try to draw to canvas first
          const canvas = document.createElement('canvas');
          canvas.width = imgElement.width || 512;
          canvas.height = imgElement.height || 512;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(imgElement, 0, 0);
          const bitmap = await createImageBitmap(canvas);
          processedScreenshot = { image: bitmap };
          console.log('✅ Converted screenshot via canvas to ImageBitmap');
        }
      } 
      // If screenshot has image property that's not ImageBitmap
      else if (screenshot.image && !(screenshot.image instanceof ImageBitmap)) {
        const bitmap = await createImageBitmap(screenshot.image);
        processedScreenshot = { image: bitmap };
        console.log('✅ Converted screenshot.image to ImageBitmap');
      }
      // If screenshot.image is already ImageBitmap, use as-is
      else if (screenshot.image instanceof ImageBitmap) {
        processedScreenshot = screenshot;
        console.log('✅ Screenshot already in ImageBitmap format');
      }
      // If screenshot is already in correct format
      else if (screenshot.image) {
        processedScreenshot = screenshot;
        console.log('✅ Using screenshot as-is');
      } else {
        console.warn('⚠️ Screenshot object exists but has no image property');
      }
    } catch (error) {
      console.warn('⚠️ Failed to process screenshot, using original:', error);
      processedScreenshot = screenshot; // Use original
    }
  } else {
    console.warn('⚠️ No screenshot provided to parseVRM - thumbnail will be missing');
  }

  const metadataMerged = GetMetadataFromAvatar(avatar, vrmMeta, vrmName);

  // Store original model position and rotation before export
  const originalPosition = glbModel.position.clone();
  const originalRotation = glbModel.rotation.clone();
  const originalScale = glbModel.scale.clone();
  
  console.log('🔄 Storing original model transform for export:', {
    position: originalPosition,
    rotation: originalRotation,
    scale: originalScale
  });
  
  // FIX: Rotate model 180 degrees around Y-axis to face forward (matches VRM import orientation fix)
  // This ensures exported VRM models face the correct direction when imported
  // Apply rotation to root node or hips bone parent (similar to VRM import fix)
  let rootNode = glbModel;
  glbModel.traverse((child) => {
    if (child.isBone && child.name === 'hips' && child.parent) {
      rootNode = child.parent;
      return;
    }
  });
  
  // Rotate the root node 180 degrees around Y-axis
  rootNode.rotation.y += Math.PI;
  rootNode.updateMatrixWorld(true);
  console.log('🔄 Rotated root node 180 degrees around Y-axis for correct export orientation');

  return new Promise(async (resolve) => {
    // Wait for screenshot processing if needed
    if (screenshot && !processedScreenshot) {
      // Screenshot processing is async, but we already handled it above
    }
    /**
     * Because vrm1 Exporter is broken, always default to vrm0 exporter;
     */
    const isOutputVRM0 = options.outputVRM0 ?? options.isVrm0 ?? true;
    const exporter = isOutputVRM0 ? new VRMExporterv0() :  new VRMExporter()
    const vrmData = {
      ...getVRMBaseData(avatar),
      ...getAvatarData(glbModel, metadataMerged,options),
    }
    
    // FIX: Log materials to verify ORM textures are present
    console.log('🔄 VRM Export - Materials check:', {
      materialsCount: vrmData.materials?.length || 0,
      materials: vrmData.materials?.map(mat => ({
        name: mat.name,
        hasMap: !!mat.map,
        hasRoughnessMap: !!mat.roughnessMap,
        hasMetalnessMap: !!mat.metalnessMap,
        hasAoMap: !!mat.aoMap,
        hasNormalMap: !!mat.normalMap,
        mapName: mat.map?.name,
        roughnessMapName: mat.roughnessMap?.name,
        normalMapName: mat.normalMap?.name
      })) || []
    });

    let skinnedMesh;
    glbModel.traverse(child => {
      if (child.isSkinnedMesh) skinnedMesh = child;
    })
    const reverseBonesXZ = () => {
      // Store original bone positions before transformation
      const originalBonePositions = new Map();
      for (let i = 0; i < skinnedMesh.skeleton.bones.length; i++) {
        const bone = skinnedMesh.skeleton.bones[i];
        originalBonePositions.set(bone.name, {
          position: bone.position.clone(),
          rotation: bone.rotation.clone(),
          quaternion: bone.quaternion.clone()
        });
      }

      // Apply bone transformations more carefully
      for (let i = 0; i < skinnedMesh.skeleton.bones.length; i++) {
        const bone = skinnedMesh.skeleton.bones[i];
        
        // Only reverse X and Z for specific bones that need it
        // Skip root bones and hips to maintain proper orientation
        if (bone.name !== 'hips' && bone.name !== 'root' && bone.parent) {
          bone.position.x *= -1;
          bone.position.z *= -1;
        }
      }

      skinnedMesh.skeleton.bones.forEach(bone => {
        bone.updateMatrix();
        bone.updateMatrixWorld();
      })
      skinnedMesh.skeleton.calculateInverses();
      skinnedMesh.skeleton.computeBoneTexture();
      skinnedMesh.skeleton.update();
      
      console.log('🔄 Bone transformation applied during export');
    }
    reverseBonesXZ();
    


    // @TODO: change springBone selection logic for VRM1
    const rootSpringBones = isOutputVRM0?getGroupSpringBones(avatar):getRootBones(avatar);
    // XXX collider bones should be taken from springBone.colliderBones
    // const colliderBones = [];
    
    // FIX: Log screenshot status before export
    console.log('🔄 VRM Export - Screenshot status:', {
      hasScreenshot: !!screenshot,
      hasProcessedScreenshot: !!processedScreenshot,
      screenshotImageType: processedScreenshot?.image?.constructor?.name,
      screenshotImageSize: processedScreenshot?.image ? `${processedScreenshot.image.width}x${processedScreenshot.image.height}` : 'N/A',
      usingProcessed: !!processedScreenshot
    });
    
    if(isOutputVRM0){
      // VRM 0.0
      console.log('🔄 Starting VRMExporterv0 export...');
      // OPTIMIZED: Use processed screenshot (ImageBitmap format for VRMExporterv0)
      exporter.parse(vrmData, glbModel, processedScreenshot || screenshot, rootSpringBones, options.ktxCompression, scale, (vrm) => {
        // Restore original model position after export
        glbModel.position.copy(originalPosition);
        glbModel.rotation.copy(originalRotation);
        glbModel.scale.copy(originalScale);
        console.log('✅ Model transform restored after export');
        resolve(vrm)
      })
    }else{
      // VRM 1.0 has a different amount of parameters
      // OPTIMIZED: Use processed screenshot (ImageBitmap format)
      exporter.parse(vrmData, glbModel, processedScreenshot || screenshot, (vrm) => {
        // Restore original model position after export
        glbModel.position.copy(originalPosition);
        glbModel.rotation.copy(originalRotation);
        glbModel.scale.copy(originalScale);
        console.log('✅ Model transform restored after export');
        resolve(vrm)
      })
    }
  })
}

function save(blob, filename) {
  const link = document.createElement("a")
  link.style.display = "none"
  document.body.appendChild(link)

  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
}

function saveString(text, filename) {
  save(new Blob([text], { type: "text/plain" }), filename)
}
function saveArrayBuffer(buffer, filename) {
  save(getArrayBuffer(buffer), filename)
}
function getArrayBuffer(buffer) {
  return new Blob([buffer], { type: "application/octet-stream" })
}
function getVRMBaseData(avatar) {
  // to do, merge data from all vrms, not to get only the first one
  for (const prop in avatar) {
    if (avatar[prop].vrm) {
      return avatar[prop].vrm
    }
  }
}


/**
 * Rebinds the BlendShapes to a new VRMExpressionManager. Used before exporting the VRM.
 * @param {THREE.Object3D} avatarModel - The avatar model.
 */
function getRebindedVRMExpressionManager(avatarModel){
  const expressionManager = new VRMExpressionManager();
  // Get old expression manager or a new default one if it doesnt exist
  /**
   * @type {THREE.VRMExpressionManager|undefined}
   */
  let oldExpressionManager = avatarModel.userData.expressionManagerToClone;
  if(!oldExpressionManager){
      oldExpressionManager = new VRMExpressionManager();
      for(const exp of Object.values(VRMExpressionPresetName)){
        const expression = new VRMExpression(exp)
        oldExpressionManager.registerExpression(expression)
      }
  }

  return oldExpressionManager;
  // Copy the old expression manager
  expressionManager.copy(oldExpressionManager);
  // Remove reference to the old expression manager
  avatarModel.userData.expressionManagerToClone = null

  for(const child of avatarModel.children){
    if(!child.isMesh && !child.isSkinnedMesh) continue;

    if(!child.morphTargetDictionary) continue

    /**
     * @type {{
     * new:{[key:string]:{
     *   index:number,
     *   primitives:number[]
     *}},
     * old:{[key:string]:{
     *   index:number,
     *   primitives:number[]
     *}}
     *}}
     */
    const changedDictionaries = child.userData.bindMorphs

    // If the child has no changed dictionaries, skip
    if(!changedDictionaries) continue

    // If the child has no blendshape that is in the expression manager, skip
    const hasBlendshape = doesMeshHaveMorphTargetBoundToManager(child, changedDictionaries.old)
    if(!hasBlendshape) continue

    /**
     * Get Weight from previous bind
     * @param {Object[]} binds
     * @param {number} indexToLookFor
     */
    const getPrevBoundWeight = (binds,indexToLookFor) => {
      return binds.find((bind) => bind.index == indexToLookFor)?.weight||0
    }

    const VRMExpressionNames = Object.entries(VRMExpressionPresetName).flat()
    // List of expressions keys that can be removed
    const expressionsToUnBind = Object.keys(changedDictionaries.old).filter((key) => VRMExpressionNames.includes(key));

    // Iterate through all old expressions
    for(const item of Object.keys(oldExpressionManager.expressionMap)){
      const expression = oldExpressionManager.expressionMap[item];
      if(!expression) continue 
      const prevBounds = expression._binds
      if(!prevBounds || prevBounds.length==0) {
        // No binds, remove the expression
        expressionManager.unregisterExpression(expression)
        continue
      }

      // Go through all blendshapes bound to old expressions
      for(const morph of expressionsToUnBind){
        const blendShapeKeyEntry = changedDictionaries.new[morph] || changedDictionaries.new[morph.toLowerCase()]
        const blendShapeKeyEntryOld = changedDictionaries.old[morph] || changedDictionaries.old[morph.toLowerCase()]
        if(blendShapeKeyEntry){
          // Get all meshes that are bound to the expression
          const meshes = []
          avatarModel.traverse((o)=>{
            if(!o.isMesh && !o.isSkinnedMesh) return
            if(blendShapeKeyEntry.primitives.includes(o.id)){
              meshes.push(o)
            }
          })
          // Unregister the old expression
          expressionManager.unregisterExpression(expression)
          // remove all binds from the old expression
          // commented out, subsequent downloads were having issues: binds were removed
          // expression._binds = []
          // get weight from previous bind
          const weight = getPrevBoundWeight(prevBounds,blendShapeKeyEntryOld.index);
          // Create a new expression with the same name
          const newExpression = new VRMExpression(expression.expressionName)
          // Copy the old expression (no binds)
          newExpression.copy(expression)
          // Add the new bind
          console.log('adding bind',expression.expressionName)
          newExpression.addBind(new VRMExpressionMorphTargetBind({
            index:blendShapeKeyEntry.index,
            weight:weight,
            primitives:meshes
          }))

          // Register the new expression
          expressionManager.registerExpression(newExpression)
        }else{
          expressionManager.unregisterExpression(expression)
        }
      }

    }

    /**
     * Rebind the new blendshape to the expression manager
     */
    for(const expression of expressionManager.expressions){
      const blendshapeNames = getBlendshapeNameByBindsForVRMExpression(expression)
      const defaultBlendshape = blendshapeNames[0][0];
      
      const oldBounds = (expression)._binds

      if(!changedDictionaries.new[defaultBlendshape]) continue;
      const newBindIndex = changedDictionaries.new[defaultBlendshape].index
      /**
       * {
          index:number,
          weight:number,
          primitives:THREE.SkinnedMesh[]
        }[]
       */
      const jsonBinds = []
      oldBounds.map((bind)=>{
        let alreadyBound = jsonBinds.find((b)=>b.index == newBindIndex)
        if(alreadyBound?.primitives.map((p)=>p.id).includes(child.id)){
          // already bound, skip
          return
        }else if (alreadyBound){
            alreadyBound.primitives.push(child)
        }else{
          jsonBinds.push({
            index:newBindIndex,
            weight:bind.weight,
            primitives:[child]
          })
        }
        
      })

      const vrmBinds = jsonBinds.map((bind)=>{
        return new VRMExpressionMorphTargetBind(bind)
      })
      
      if(expression.userData.processed){
         //@ts-ignore
        expression._binds.push(...vrmBinds)
      }else{
        expression.userData.processed = true;
        //@ts-ignore
        expression._binds = vrmBinds
      }
    }

  }

  return expressionManager
}

/**
 * Get list of blendshape Names for each mesh in each bind of the expression
 */
function getBlendshapeNameByBindsForVRMExpression(expression){

  const binds = expression._binds
  if(!binds) return []

  const blendshapes = binds.map((bind) => {
    let blendshapeNames = []
    bind.primitives.forEach((p)=>{
      const morph = Object.entries(p.morphTargetDictionary).find(([_key,value])=>value==bind.index)
      if(morph){
        blendshapeNames.push(morph[0])
      }
    })

    return blendshapeNames
  })
  return blendshapes

}