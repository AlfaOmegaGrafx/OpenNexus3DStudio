/**
 * 3DAIGC-API model catalog for the task sidebar model picker.
 * Workflows align with Open3DStudio README / changelog (mesh gen, painting, segmentation,
 * part completion, auto rig, retopology, UV unwrap, mesh editing text/image). See:
 * https://github.com/AlfaOmegaGrafx/Open3DStudio
 * Actual model IDs still come from GET /api/v1/system/models when connected.
 */

/** @type {{ value: string, label: string, feature: string }[]} */
export const ALL_MODELS = [
  { value: 'comfyui_preprocessing', label: 'ComfyUI Preprocessing', feature: 'image_preprocessing' },
  { value: 'comfyui_texture_generation', label: 'ComfyUI Texture Generation', feature: 'mesh_texture_generation' },
  { value: 'trellis_text_to_textured_mesh', label: 'TRELLIS Text to Textured Mesh', feature: 'text_to_textured_mesh' },
  { value: 'trellis_text_mesh_painting', label: 'TRELLIS Text Mesh Painting', feature: 'text_mesh_painting' },
  { value: 'hunyuan3dv20_image_to_raw_mesh', label: 'Hunyuan3D v2.0 Image to Raw Mesh', feature: 'image_to_raw_mesh' },
  { value: 'hunyuan3dv21_image_to_raw_mesh', label: 'Hunyuan3D v2.1 Image to Raw Mesh', feature: 'image_to_raw_mesh' },
  { value: 'partpacker_part_packing', label: 'PartPacker Part Packing', feature: 'image_to_raw_mesh' },
  { value: 'trellis_image_to_textured_mesh', label: 'TRELLIS Image to Textured Mesh', feature: 'image_to_textured_mesh' },
  { value: 'hunyuan3dv20_image_to_textured_mesh', label: 'Hunyuan3D v2.0 Image to Textured Mesh', feature: 'image_to_textured_mesh' },
  { value: 'hunyuan3dv21_image_to_textured_mesh', label: 'Hunyuan3D v2.1 Image to Textured Mesh', feature: 'image_to_textured_mesh' },
  { value: 'trellis_image_mesh_painting', label: 'TRELLIS Image Mesh Painting', feature: 'image_mesh_painting' },
  { value: 'hunyuan3dv20_image_mesh_painting', label: 'Hunyuan3D v2.0 Image Mesh Painting', feature: 'image_mesh_painting' },
  { value: 'hunyuan3dv21_image_mesh_painting', label: 'Hunyuan3D v2.1 Image Mesh Painting', feature: 'image_mesh_painting' },
  { value: 'partfield_mesh_segmentation', label: 'PartField Mesh Segmentation', feature: 'mesh_segmentation' },
  { value: 'unirig_auto_rig', label: 'UniRig Auto Rig', feature: 'auto_rig' },
  { value: 'holopart_part_completion', label: 'HoloPart Part Completion', feature: 'part_completion' },
  { value: 'fastmesh_v1k_retopology', label: 'FastMesh V1K Retopology', feature: 'mesh_retopology' },
  { value: 'fastmesh_v4k_retopology', label: 'FastMesh V4K Retopology', feature: 'mesh_retopology' },
  { value: 'partuv_uv_unwrapping', label: 'PartUV UV Unwrapping', feature: 'uv_unwrapping' },
];

/** Map UI task types (task sidebar) to API feature keys from /api/v1/system/models */
export const TASK_TYPE_TO_FEATURE = {
  'text-to-3d': 'text_to_textured_mesh',
  'image-to-3d': 'image_to_textured_mesh',
  'mesh-painting': 'image_mesh_painting',
  'mesh-painting-text': 'text_mesh_painting',
  'mesh-segmentation': 'mesh_segmentation',
  'auto-rigging': 'auto_rig',
  'part-completion': 'part_completion',
  'mesh-retopology': 'mesh_retopology',
  'mesh-uv-unwrapping': 'uv_unwrapping',
  'mesh-editing-text': 'text_mesh_editing',
  'mesh-editing-image': 'image_mesh_editing',
  'avatar-from-photo': null,
};

export function getModelsForTaskType(taskType) {
  const feature = TASK_TYPE_TO_FEATURE[taskType];
  if (!feature) return [];
  return ALL_MODELS.filter((m) => m.feature === feature);
}
