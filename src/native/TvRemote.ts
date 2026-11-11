/**
 * Typed wrapper around the Kotlin `TvRemote` native module
 * (android/app/src/main/java/com/altremote/tvremote/TvRemoteModule.kt).
 *
 * Covers the client identity, TV discovery, pairing, and the remote session
 * (keys, app links, text input and TV state events).
 */
import { NativeEventEmitter, NativeModules } from 'react-native';

export type KeyDirection = 'SHORT' | 'START_LONG' | 'END_LONG';

export interface IdentityInfo {
  subject: string;
  serialNumber: string;
  /** Epoch milliseconds */
  notBefore: number;
  /** Epoch milliseconds */
  notAfter: number;
  keySizeBits: number;
  sha256Fingerprint: string;
  /** Where the private key lives: StrongBox, TEE, Secure hardware or Software */
  securityLevel: string;
  /** Present on generateIdentityIfNeeded(): true if a new identity was just created */
  created?: boolean;
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'pairing_required'
  | 'error';

/** A TV found by mDNS (`_androidtvremote2._tcp`). */
export interface DiscoveredService {
  /** The TV's name, e.g. "Living Room TV" */
  name: string;
  host: string;
  /** Remote port advertised by the TV (normally 6466) */
  port: number;
  /** mDNS TXT record, e.g. { bt: "C8:AA:…" } (the TV's Bluetooth MAC) */
  attributes: Record<string, string>;
}

export interface Reachability {
  /** Port 6466 accepts connections */
  remote: boolean;
  /** Port 6467 accepts connections */
  pairing: boolean;
}

export interface TvRemoteEvents {
  onDeviceFound: DiscoveredService;
  onDeviceLost: { name: string };
  onDiscoveryState: { running: boolean; error?: string };
  /** code/message are set for 'error' and 'pairing_required' */
  onConnectionState: { state: ConnectionState; host?: string; code?: string; message?: string };
  onVolume: { level: number; max: number; muted: boolean };
  onCurrentApp: { packageName: string };
  onPowerState: { isOn: boolean };
  onDeviceInfo: { vendor: string; model: string; appVersion: string };
  /** The phone's network came back or dropped (watched once connect() is used) */
  onNetworkChanged: { available: boolean };
  /** The TV opened its on-screen keyboard; text is the field's current content */
  onImeShow: { text: string };
}

export interface PairingStarted {
  /** Name the TV reports for itself, if any */
  serverName: string | null;
}

export interface PairingResult {
  serverName: string | null;
  /** SHA-256 fingerprint of the TV's certificate, used to recognise it later */
  serverCertFingerprint: string;
}

/**
 * Error codes from startPairing/finishPairing (on the rejected Error as `code`):
 * - BAD_CODE: typo caught before sending; the TV still shows the same code, retry
 * - CODE_REJECTED: the TV refused the code; start again
 * - CONNECT_FAILED / TLS_FAILED: couldn't reach the TV's pairing port
 * - CONNECTION_CLOSED / TIMEOUT: the TV dropped the pairing session; start again
 * - NO_SESSION: finishPairing called without startPairing
 * - PAIRING_FAILED: anything else
 */
export type PairingErrorCode =
  | 'BAD_CODE'
  | 'CODE_REJECTED'
  | 'CONNECT_FAILED'
  | 'TLS_FAILED'
  | 'CONNECTION_CLOSED'
  | 'TIMEOUT'
  | 'NO_SESSION'
  | 'PAIRING_FAILED';

export function errorCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e
    ? String((e as { code: unknown }).code)
    : undefined;
}

interface TvRemoteNative {
  generateIdentityIfNeeded(): Promise<IdentityInfo>;
  getIdentityInfo(): Promise<IdentityInfo | null>;
  resetIdentity(): Promise<null>;
  startDiscovery(): Promise<null>;
  stopDiscovery(): Promise<null>;
  checkReachable(host: string): Promise<Reachability>;
  startPairing(host: string): Promise<PairingStarted>;
  finishPairing(code: string): Promise<PairingResult>;
  cancelPairing(): Promise<null>;
  connect(host: string, expectedFingerprint: string | null): Promise<null>;
  disconnect(): Promise<null>;
  sendKey(keyCode: number, direction: KeyDirection): Promise<null>;
  launchApp(url: string): Promise<null>;
  sendText(text: string): Promise<null>;
  haptic(kind: 'tap' | 'long' | 'tick'): void;
  setNotificationControls(enabled: boolean, tvName: string): void;
}

const native: TvRemoteNative | undefined = NativeModules.TvRemote;

function requireNative(): TvRemoteNative {
  if (!native) {
    throw new Error(
      'TvRemote native module not found. Rebuild the Android app (npx react-native run-android).',
    );
  }
  return native;
}

const emitter = native ? new NativeEventEmitter(NativeModules.TvRemote) : null;

// Every method is async, so a missing native module becomes a rejected promise
// (handled by the caller's .catch) rather than a synchronous throw.
export const TvRemote = {
  generateIdentityIfNeeded: async () => requireNative().generateIdentityIfNeeded(),
  getIdentityInfo: async () => requireNative().getIdentityInfo(),
  resetIdentity: async () => {
    await requireNative().resetIdentity();
  },
  startDiscovery: async () => {
    await requireNative().startDiscovery();
  },
  stopDiscovery: async () => {
    await requireNative().stopDiscovery();
  },
  checkReachable: async (host: string) => requireNative().checkReachable(host),
  startPairing: async (host: string) => requireNative().startPairing(host),
  finishPairing: async (code: string) => requireNative().finishPairing(code),
  cancelPairing: async () => {
    await requireNative().cancelPairing();
  },
  /**
   * Opens the remote session with a paired TV. Pass the fingerprint saved at pairing so
   * a different device at that IP is refused. Rejects with CONNECT_FAILED,
   * PAIRING_REQUIRED, TV_CHANGED or HANDSHAKE_FAILED.
   */
  connect: async (host: string, expectedFingerprint?: string) => {
    await requireNative().connect(host, expectedFingerprint ?? null);
  },
  disconnect: async () => {
    await requireNative().disconnect();
  },
  /** Rejects with NOT_CONNECTED when there's no ready session. */
  sendKey: async (keyCode: number, direction: KeyDirection = 'SHORT') => {
    await requireNative().sendKey(keyCode, direction);
  },
  /** Opens a deep link on the TV (e.g. https://www.youtube.com). Rejects with NOT_CONNECTED. */
  launchApp: async (url: string) => {
    await requireNative().launchApp(url);
  },
  /**
   * Inserts `text` at the cursor of the focused TV text field (the TV doesn't replace the
   * field). Send only new characters; use sendKey(KeyCode.DEL) to delete.
   * Rejects with NOT_CONNECTED or NOT_SUPPORTED.
   */
  sendText: async (text: string) => {
    await requireNative().sendText(text);
  },

  /** Short vibration (respects the phone's Touch feedback setting). No-op without the native module. */
  haptic: (kind: 'tap' | 'long' | 'tick' = 'tap') => {
    native?.haptic(kind);
  },

  /**
   * Show remote buttons in a notification (and on the lock screen) while connected.
   * The native side starts/stops a foreground service as the connection comes and goes.
   */
  setNotificationControls: (enabled: boolean, tvName: string) => {
    native?.setNotificationControls(enabled, tvName);
  },

  addListener<E extends keyof TvRemoteEvents>(
    event: E,
    listener: (payload: TvRemoteEvents[E]) => void,
  ): { remove(): void } {
    if (!emitter) {
      return { remove() {} };
    }
    return emitter.addListener(event, listener as (payload: unknown) => void);
  },
};

export default TvRemote;
