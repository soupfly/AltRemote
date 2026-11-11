import TvRemote from '../native/TvRemote';
import { useSettings } from '../store/settings';

type Kind = 'tap' | 'long' | 'tick';

/**
 * A short vibration for a button press, if haptics are on in Settings.
 * Implemented natively (android/.../tvremote/Haptics.kt) so it works under Do Not
 * Disturb and follows the phone's Touch feedback setting.
 */
export function haptic(kind: Kind = 'tap') {
  if (!useSettings.getState().haptics) return;
  try {
    TvRemote.haptic(kind);
  } catch {
    // Haptics are a nicety; never let them break a key press.
  }
}
