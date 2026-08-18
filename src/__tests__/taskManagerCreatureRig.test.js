import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { TaskManager } from '../library/taskManager';
import { AUTO_RIG_MODES } from '../library/avatarPipelineCatalog.js';
import {
  CREATURE_TEMPLATE_RIG_MODEL_ID,
  DEFAULT_CREATURE_TEMPLATE_ID,
} from '../library/creaturePipelineCatalog.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('TaskManager creature template auto-rig', () => {
  let taskManager;

  beforeEach(() => {
    taskManager = new TaskManager('http://api.example.com');
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.get).mockReset();
  });

  it('executeAutoRigging sends creature_template_id for creature_template mode', async () => {
    taskManager.uploadMeshFile = vi.fn().mockResolvedValue('mesh-1');
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { job_id: 'rig-fox-1', status: 'queued' },
    });

    const blob = new Blob(['x'], { type: 'model/gltf-binary' });
    const file = new File([blob], 'model.glb', { type: 'model/gltf-binary' });

    const result = await taskManager.executeAutoRigging(
      {
        rig_mode: AUTO_RIG_MODES.CREATURE_TEMPLATE,
        creature_template_id: DEFAULT_CREATURE_TEMPLATE_ID,
        output_format: 'glb',
        model_preference: 'skintokens_auto_rig',
      },
      file,
    );

    expect(result.job_id).toBe('rig-fox-1');
    const rigCall = vi.mocked(axios.post).mock.calls[0];
    expect(rigCall[0]).toBe('http://api.example.com/api/v1/auto-rigging/generate-rig');
    expect(rigCall[1]).toMatchObject({
      rig_mode: 'creature_template',
      creature_template_id: 'fox',
      output_format: 'glb',
      model_preference: CREATURE_TEMPLATE_RIG_MODEL_ID,
    });
  });
});
