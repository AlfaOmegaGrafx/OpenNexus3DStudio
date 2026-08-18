import { describe, expect, it } from 'vitest';
import {
  buildStudioHandoffUrl,
  parseJobHandoffFromLocation,
  parseLoadMeshFromLocation,
} from '../library/jobHandoff.js';

describe('jobHandoff', () => {
  it('buildStudioHandoffUrl encodes jobId and autoLoad', () => {
    const url = buildStudioHandoffUrl('https://100.94.108.18:3000', 'abc-123', {
      prompt: 'red chair',
    });
    expect(url).toContain('jobId=abc-123');
    expect(url).toContain('autoLoad=1');
    expect(url).toContain('tasks=1');
    expect(url).toContain('prompt=red');
  });

  it('parseJobHandoffFromLocation reads query params', () => {
    const parsed = parseJobHandoffFromLocation({
      search: '?jobId=job-1&autoLoad=1&tasks=1',
    });
    expect(parsed).toEqual({
      jobId: 'job-1',
      autoLoad: true,
      openTasks: true,
      prompt: null,
    });
  });

  it('parseLoadMeshFromLocation reads Studio mesh handoff', () => {
    expect(
      parseLoadMeshFromLocation({
        search: '?loadMesh=%2F__dev_dgx_proxy%2Fapi%2Fv1%2Fsystem%2Fjobs%2Fx%2Fdownload',
      }),
    ).toBe('/__dev_dgx_proxy/api/v1/system/jobs/x/download');
    expect(parseLoadMeshFromLocation({ search: '?jobId=only' })).toBeNull();
  });
});
