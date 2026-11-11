import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import TvRemote from '../native/TvRemote';
import { useDevices } from '../store/devices';

/**
 * Runs mDNS discovery while the calling screen is mounted and the app is in the
 * foreground. Returns `refresh`, which restarts discovery from a clean list.
 */
export function useDiscovery() {
  const start = useCallback(async () => {
    try {
      await TvRemote.startDiscovery();
    } catch (e) {
      useDevices.getState().setDiscoveryState(false, (e as Error).message);
    }
  }, []);

  useEffect(() => {
    const store = useDevices.getState;
    const subs = [
      TvRemote.addListener('onDeviceFound', s => store().upsertDiscovered(s)),
      TvRemote.addListener('onDeviceLost', e => store().removeDiscovered(e.name)),
      TvRemote.addListener('onDiscoveryState', e =>
        store().setDiscoveryState(e.running, e.error),
      ),
    ];
    start();

    const appState = AppState.addEventListener('change', next => {
      if (next === 'active') {
        start();
      } else if (next === 'background') {
        TvRemote.stopDiscovery().catch(() => {});
      }
    });

    return () => {
      subs.forEach(s => s.remove());
      appState.remove();
      TvRemote.stopDiscovery().catch(() => {});
    };
  }, [start]);

  const refresh = useCallback(async () => {
    await TvRemote.stopDiscovery().catch(() => {});
    useDevices.getState().clearDiscovered();
    await start();
  }, [start]);

  return { refresh };
}
