/** Errors worth retrying automatically. Pairing problems need the user instead. */
const RETRIABLE = new Set([
  'CONNECTION_LOST',
  'CONNECT_FAILED',
  'HANDSHAKE_FAILED',
  'PROTOCOL_ERROR',
  'CLOSED',
]);

export function shouldRetry(errorCode: string | undefined): boolean {
  return errorCode === undefined || RETRIABLE.has(errorCode);
}

export const MAX_DELAY_MS = 30_000;

/** Exponential backoff: 1 s, 2 s, 4 s, 8 s, 16 s, then 30 s. */
export function retryDelay(attempt: number): number {
  return Math.min(MAX_DELAY_MS, 1000 * 2 ** Math.max(0, attempt));
}
