import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { TaskManager } from '../library/taskManager';
import { AUTO_RIG_MODES, APPEARANCE_COMPONENT_RIG_MODEL_ID } from '../library/avatarPipelineCatalog.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('TaskManager auto-rig from completed mesh job', () => {
  let taskManager;

  beforeEach(() => {
    taskManager = new TaskManager('http://api.example.com');
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.get).mockReset();
  });

  it('reuses server mesh_path without uploading a GLB', async () => {
    taskManager.uploadMeshFile = vi.fn();
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        job_id: 'mesh-job-1',
        status: 'completed',
        result: { output_mesh_path: '/outputs/garment.glb' },
      },
    });
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { job_id: 'rig-1', status: 'queued' },
    });

    const result = await taskManager.executeAutoRigging({
      rig_mode: AUTO_RIG_MODES.APPEARANCE_COMPONENT,
      appearance_slot: 'Chest',
      studio_input_mesh_job_id: 'mesh-job-1',
      object_name: 'hoodie',
    });

    expect(result.job_id).toBe('rig-1');
    expect(taskManager.uploadMeshFile).not.toHaveBeenCalled();
    const rigBody = vi.mocked(axios.post).mock.calls[0][1];
    expect(rigBody).toMatchObject({
      mesh_path: '/outputs/garment.glb',
      appearance_slot: 'Chest',
      model_preference: APPEARANCE_COMPONENT_RIG_MODEL_ID,
    });
    expect(rigBody.mesh_file_id).toBeUndefined();
    expect(rigBody.mesh_job_id).toBeUndefined();
  });

  it('sends mesh_job_id when the job status has no filesystem path', async () => {
    taskManager.uploadMeshFile = vi.fn();
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        job_id: 'mesh-job-2',
        status: 'completed',
        result: { mesh_url: '/api/v1/system/jobs/mesh-job-2/download' },
      },
    });
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { job_id: 'rig-2', status: 'queued' },
    });

    await taskManager.executeAutoRigging({
      rig_mode: AUTO_RIG_MODES.APPEARANCE_COMPONENT,
      appearance_slot: 'Legs',
      studio_input_mesh_job_id: 'mesh-job-2',
      object_name: 'joggers',
    });

    expect(taskManager.uploadMeshFile).not.toHaveBeenCalled();
    expect(vi.mocked(axios.post).mock.calls[0][1]).toMatchObject({
      mesh_job_id: 'mesh-job-2',
      appearance_slot: 'Legs',
    });
  });
});
