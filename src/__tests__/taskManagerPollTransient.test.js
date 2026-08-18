import { describe, expect, it } from 'vitest';
import {
  isTransientApiPollError,
  maxConsecutiveTransientPollFailures,
} from '../library/taskManager.js';

describe('transient API poll helpers', () => {
  it('treats network / timeout / 5xx as transient', () => {
    expect(isTransientApiPollError({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe(true);
    expect(isTransientApiPollError({ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' })).toBe(
      true,
    );
    expect(isTransientApiPollError({ response: { status: 502 }, message: 'Bad Gateway' })).toBe(true);
    expect(isTransientApiPollError({ response: { status: 503 }, message: 'Service Unavailable' })).toBe(
      true,
    );
    expect(isTransientApiPollError({ message: 'Failed to fetch' })).toBe(true);
  });

  it('does not treat terminal job failures as transient', () => {
    expect(isTransientApiPollError({ message: 'Job failed: CUDA OOM' })).toBe(false);
    expect(isTransientApiPollError({ response: { status: 400 }, message: 'bad request' })).toBe(false);
    expect(isTransientApiPollError({ code: 'JOB_TERMINAL_FAILURE', message: 'failed' })).toBe(false);
  });

  it('requires ~5 minutes of continuous outage before giving up', () => {
    expect(maxConsecutiveTransientPollFailures(3000)).toBe(100);
    expect(maxConsecutiveTransientPollFailures(1000)).toBe(300);
    expect(maxConsecutiveTransientPollFailures(10_000)).toBe(30);
  });
});
