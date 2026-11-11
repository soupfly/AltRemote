import TvRemote, { KeyDirection } from '../native/TvRemote';
import { haptic } from './haptics';

/**
 * Fire-and-forget key press with haptic feedback. Failures (e.g. NOT_CONNECTED while
 * reconnecting) are ignored here; the connection banner on the remote screen shows
 * what's wrong.
 */
export function press(keyCode: number, direction: KeyDirection = 'SHORT') {
  // No buzz on the release half of a long press; the start already buzzed.
  if (direction !== 'END_LONG') haptic(direction === 'START_LONG' ? 'long' : 'tap');
  TvRemote.sendKey(keyCode, direction).catch(() => {});
}
