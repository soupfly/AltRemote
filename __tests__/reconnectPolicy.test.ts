import { MAX_DELAY_MS, retryDelay, shouldRetry } from '../src/hooks/reconnectPolicy';

describe('reconnect policy', () => {
  it('backs off exponentially up to 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(retryDelay)).toEqual([
      1000, 2000, 4000, 8000, 16000, MAX_DELAY_MS, MAX_DELAY_MS, MAX_DELAY_MS,
    ]);
  });

  it('retries network problems but not pairing problems', () => {
    expect(shouldRetry('CONNECTION_LOST')).toBe(true);
    expect(shouldRetry('CONNECT_FAILED')).toBe(true);
    expect(shouldRetry(undefined)).toBe(true);
    expect(shouldRetry('PAIRING_REQUIRED')).toBe(false);
    expect(shouldRetry('TV_CHANGED')).toBe(false);
  });
});
