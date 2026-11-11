import { useCallback, useEffect, useRef } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import TvRemote, { errorCode } from '../native/TvRemote';
import { useConnection } from '../store/connection';
import { useSettings } from '../store/settings';
import type { Tv } from '../store/deviceUtils';
import { retryDelay, shouldRetry } from './reconnectPolicy';

/**
 * Keeps a remote session open to `tv` while the calling screen is mounted.
 *
 * Reconnects automatically:
 * - with exponential backoff (1 s … 30 s) after the connection drops or fails,
 * - right away when the phone's network comes back,
 * - right away when the app returns to the foreground.
 * Pairing problems (PAIRING_REQUIRED / TV_CHANGED) are left for the user.
 */
export function useRemoteConnection(tv: Pick<Tv, 'id' | 'host' | 'pairing' | 'name'> | undefined) {
  const id = tv?.id;
  const name = tv?.name;
  const notificationControls = useSettings(s => s.notificationControls);
  const host = tv?.host;
  const fingerprint = tv?.pairing?.serverCertFingerprint;
  const attempt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(true);

  const clearRetry = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    useConnection.getState().setRetryAt(undefined);
  };

  const connect = useCallback(async () => {
    if (!id || !host || !active.current) return;
    clearRetry();
    const store = useConnection.getState();
    store.setTarget(id, host);
    try {
      await TvRemote.connect(host, fingerprint);
    } catch (e) {
      // Native also emits onConnectionState for failures; this covers a missing module.
      if (!errorCode(e)) {
        store.setConnection('error', { host, message: (e as Error).message });
      }
    }
  }, [id, host, fingerprint]);

  const connectRef = useRef(connect);
  connectRef.current = connect;

  /** Connect now, starting the backoff over. */
  const reconnect = useCallback(() => {
    attempt.current = 0;
    connectRef.current();
  }, []);

  // Notification / lock-screen controls follow the setting and the TV's name.
  useEffect(() => {
    if (!name) return;
    TvRemote.setNotificationControls(notificationControls, name);
    if (notificationControls) {
      requestNotificationPermission().then(granted => {
        // A notification posted before the permission was granted stays hidden, so post
        // it again now (the service may already have started while the prompt was up).
        if (granted) TvRemote.setNotificationControls(true, name);
      });
    }
  }, [notificationControls, name]);

  // Native events → store.
  useEffect(() => {
    const store = useConnection.getState;
    const subs = [
      TvRemote.addListener('onConnectionState', e =>
        store().setConnection(e.state, { host: e.host, code: e.code, message: e.message }),
      ),
      TvRemote.addListener('onPowerState', e => store().setPower(e.isOn)),
      TvRemote.addListener('onVolume', e => store().setVolume(e)),
      TvRemote.addListener('onCurrentApp', e => store().setCurrentApp(e.packageName)),
      TvRemote.addListener('onDeviceInfo', e => store().setDeviceInfo(e)),
      TvRemote.addListener('onImeShow', e => store().requestIme(e.text)),
      TvRemote.addListener('onNetworkChanged', e => {
        if (e.available && store().state !== 'connected' && store().state !== 'connecting') {
          reconnect();
        }
      }),
    ];
    return () => subs.forEach(s => s.remove());
  }, [reconnect]);

  // Schedule a retry when the connection fails; reset the backoff once connected.
  useEffect(
    () =>
      useConnection.subscribe((s, prev) => {
        if (s.state === prev.state && s.errorCode === prev.errorCode) return;
        if (s.state === 'connected') {
          attempt.current = 0;
          clearRetry();
        } else if (s.state === 'error' && shouldRetry(s.errorCode) && active.current) {
          const delay = retryDelay(attempt.current++);
          if (retryTimer.current) clearTimeout(retryTimer.current);
          useConnection.getState().setRetryAt(Date.now() + delay);
          retryTimer.current = setTimeout(() => connectRef.current(), delay);
        }
      }),
    [],
  );

  useEffect(() => {
    active.current = true;
    attempt.current = 0;
    connect();
    const appState = AppState.addEventListener('change', next => {
      if (next === 'active' && useConnection.getState().state !== 'connected') reconnect();
    });
    return () => {
      active.current = false;
      appState.remove();
      clearRetry();
      TvRemote.disconnect().catch(() => {});
    };
  }, [connect, reconnect]);

  return { reconnect };
}

let askedForNotifications = false;

/**
 * Android 13+ needs permission to show notifications; ask once per app run.
 * Resolves true only when this call newly obtained the permission.
 */
async function requestNotificationPermission(): Promise<boolean> {
  if (askedForNotifications || Platform.OS !== 'android' || Number(Platform.Version) < 33) {
    return false;
  }
  askedForNotifications = true;
  try {
    const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (await PermissionsAndroid.check(perm)) return false;
    return (await PermissionsAndroid.request(perm)) === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    // Without permission the remote still works; only the notification is missing.
    return false;
  }
}
