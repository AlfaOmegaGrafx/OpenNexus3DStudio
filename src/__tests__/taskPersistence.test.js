import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  TASK_STORAGE_KEY,
  JOB_RETENTION_MS,
  applyJobTimestampsToTask,
  deserializeTaskFromStorage,
  featureToTaskType,
  formatTaskDurationMs,
  formatTaskTimestamp,
  getTaskElapsedMs,
  getTaskPollBudgetMs,
  isApiJobStale,
  isRunningTaskDetached,
  isTaskStale,
  loadPersistedTasks,
  mapApiJobStatusToTaskStatus,
  resolveTaskJobId,
  serializeTaskForStorage,
  taskFromApiJob,
  writeTaskStorageSnapshot,
  markJobDeletedLocally,
  isJobDeletedLocally,
} from '../library/taskPersistence.js';

describe('taskPersistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('serializes tasks without File objects', () => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const stored = serializeTaskForStorage({
      id: 'task_1',
      type: 'image-to-world',
      prompt: 'Room',
      imageFile: file,
      createdAt: new Date('2026-06-09T04:00:00.000Z'),
      updatedAt: new Date('2026-06-09T04:01:00.000Z'),
      status: 'completed',
    });
    expect(stored.hadImageFile).toBe(true);
    expect(stored.imageFile).toBeUndefined();
    expect(stored.createdAt).toBe('2026-06-09T04:00:00.000Z');
  });

  it('round-trips tasks through localStorage', () => {
    const now = new Date();
    writeTaskStorageSnapshot(
      [
        {
          id: 'task_1',
          type: 'image-to-world',
          prompt: 'Room',
          status: 'completed',
          job_id: '07da4284-e8be-4aca-938a-d5e4f9777582',
          createdAt: now,
          updatedAt: now,
          completedAt: now,
        },
      ],
      'http://api.test',
    );
    const restored = loadPersistedTasks('http://api.test');
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe('task_1');
    expect(restored[0].job_id).toBe('07da4284-e8be-4aca-938a-d5e4f9777582');
    expect(restored[0].createdAt).toBeInstanceOf(Date);
  });

  it('resolveTaskJobId reads nested and synthetic ids', () => {
    expect(resolveTaskJobId({ job_id: 'abc-123' })).toBe('abc-123');
    expect(resolveTaskJobId({ result: { job_id: 'nested-1' } })).toBe('nested-1');
    expect(resolveTaskJobId({ id: 'job_xyz' })).toBe('xyz');
  });

  it('tracks deleted job ids locally', () => {
    markJobDeletedLocally('job-a');
    expect(isJobDeletedLocally('job-a')).toBe(true);
    expect(isJobDeletedLocally('job-b')).toBe(false);
  });

  it('maps API jobs to UI tasks', () => {
    const task = taskFromApiJob({
      job_id: '07da4284-e8be-4aca-938a-d5e4f9777582',
      feature: 'image_to_world',
      status: 'completed',
      created_at: '2026-06-09T16:53:16.120945',
      started_at: '2026-06-09T16:53:16.488157',
      completed_at: '2026-06-09T16:53:26.493834',
      inputs: { world_name: 'Room' },
      result: {
        world_manifest_url: '/api/v1/system/jobs/07da4284-e8be-4aca-938a-d5e4f9777582/download?asset=manifest',
      },
    });
    expect(task.type).toBe('image-to-world');
    expect(task.status).toBe('completed');
    expect(task.prompt).toBe('Room');
    expect(task.result.world_manifest_url).toContain('asset=manifest');
    expect(task.startedAt).toBeInstanceOf(Date);
    expect(task.completedAt).toBeInstanceOf(Date);
    expect(getTaskElapsedMs(task)).toBe(10005);
  });

  it('formats elapsed durations for task rows', () => {
    expect(formatTaskDurationMs(9500)).toBe('10s');
    expect(formatTaskDurationMs(65000)).toBe('1m 5s');
    expect(formatTaskDurationMs(-1)).toBe('—');
  });

  it('formats task timestamps in US Eastern with mm-dd-yyyy', () => {
    const formatted = formatTaskTimestamp('2026-06-18T20:41:54.127912-04:00');
    expect(formatted).toMatch(/^06-18-2026 \d{1,2}:\d{2}:\d{2} (AM|PM) (EDT|EST)$/);
    expect(formatTaskTimestamp(null)).toBe('—');
  });

  it('applies API timestamps onto running tasks', () => {
    const task = { startedAt: null, completedAt: null };
    applyJobTimestampsToTask(task, {
      created_at: '2026-06-09T16:53:16.120945',
      started_at: '2026-06-09T16:53:16.488157',
      completed_at: '2026-06-09T16:53:26.493834',
    });
    expect(task.startedAt.toISOString()).toBe('2026-06-09T16:53:16.488Z');
    expect(task.completedAt.toISOString()).toBe('2026-06-09T16:53:26.493Z');
  });

  it('maps API statuses to task statuses', () => {
    expect(mapApiJobStatusToTaskStatus('processing')).toBe('running');
    expect(mapApiJobStatusToTaskStatus('completed')).toBe('completed');
    expect(featureToTaskType('image_to_world')).toBe('image-to-world');
  });

  it('ignores invalid storage payloads', () => {
    localStorage.setItem(TASK_STORAGE_KEY, '{"bad":true}');
    expect(loadPersistedTasks()).toEqual([]);
    expect(deserializeTaskFromStorage(null)).toBeNull();
  });

  it('drops tasks older than 24h on load and save', () => {
    const staleCreated = new Date(Date.now() - JOB_RETENTION_MS - 60_000);
    writeTaskStorageSnapshot(
      [
        {
          id: 'task_stale',
          type: 'image-to-3d',
          prompt: 'old',
          status: 'completed',
          job_id: 'stale-job-1',
          createdAt: staleCreated,
          updatedAt: staleCreated,
          completedAt: staleCreated,
        },
        {
          id: 'task_fresh',
          type: 'image-to-3d',
          prompt: 'new',
          status: 'completed',
          job_id: 'fresh-job-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: new Date(),
        },
      ],
      'http://api.test',
    );
    const restored = loadPersistedTasks('http://api.test');
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe('task_fresh');
    expect(isTaskStale({ status: 'running', createdAt: staleCreated })).toBe(true);
    expect(
      isApiJobStale({
        job_id: 'old',
        status: 'completed',
        created_at: staleCreated.toISOString(),
        completed_at: staleCreated.toISOString(),
      }),
    ).toBe(true);
  });

  it('isRunningTaskDetached uses poll budget and statusPollingUnavailable grace', () => {
    const now = Date.parse('2026-06-21T12:00:00.000Z');
    const recent = new Date(now - 5 * 60 * 1000);
    const oldMesh = new Date(now - getTaskPollBudgetMs({ type: 'auto-rig' }) - 1000);
    const oldWorld = new Date(now - getTaskPollBudgetMs({ type: 'image-to-world' }) - 1000);

    expect(
      isRunningTaskDetached(
        { status: 'running', type: 'auto-rig', startedAt: recent },
        now,
      ),
    ).toBe(false);
    expect(
      isRunningTaskDetached(
        { status: 'running', type: 'auto-rig', startedAt: oldMesh },
        now,
      ),
    ).toBe(true);
    expect(
      isRunningTaskDetached(
        { status: 'running', type: 'image-to-world', startedAt: oldWorld },
        now,
      ),
    ).toBe(true);
    expect(
      isRunningTaskDetached(
        {
          status: 'running',
          startedAt: new Date(now - 20 * 60 * 1000),
          result: { statusPollingUnavailable: true },
        },
        now,
      ),
    ).toBe(true);
  });
});
