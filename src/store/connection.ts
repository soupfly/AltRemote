import { create } from 'zustand';
import type { ConnectionState } from '../native/TvRemote';

/** Live state of the remote session. Not persisted. */
interface ConnectionStore {
  state: ConnectionState;
  tvId?: string;
  host?: string;
  errorCode?: string;
  errorMessage?: string;
  isOn?: boolean;
  volume?: { level: number; max: number; muted: boolean };
  currentApp?: string;
  deviceInfo?: { vendor: string; model: string; appVersion: string };
  /** Set when the TV opens its keyboard; `at` changes on every request */
  imeRequest?: { text: string; at: number };
  /** When the next automatic reconnect attempt happens (epoch ms) */
  retryAt?: number;

  setConnection(
    state: ConnectionState,
    extra?: { host?: string; code?: string; message?: string },
  ): void;
  setTarget(tvId: string, host: string): void;
  setPower(isOn: boolean): void;
  setVolume(volume: { level: number; max: number; muted: boolean }): void;
  setCurrentApp(pkg: string): void;
  setDeviceInfo(info: { vendor: string; model: string; appVersion: string }): void;
  requestIme(text: string): void;
  setRetryAt(at: number | undefined): void;
}

export const useConnection = create<ConnectionStore>()(set => ({
  state: 'disconnected',

  setConnection(state, extra) {
    set(s => ({
      state,
      host: extra?.host ?? s.host,
      errorCode: state === 'error' || state === 'pairing_required' ? extra?.code : undefined,
      errorMessage: state === 'error' || state === 'pairing_required' ? extra?.message : undefined,
    }));
  },
  setTarget(tvId, host) {
    set(s =>
      s.tvId === tvId
        ? { host }
        : {
            tvId,
            host,
            isOn: undefined,
            volume: undefined,
            currentApp: undefined,
            deviceInfo: undefined,
          },
    );
  },
  setPower(isOn) {
    set({ isOn });
  },
  setVolume(volume) {
    set({ volume });
  },
  setCurrentApp(currentApp) {
    set({ currentApp });
  },
  setDeviceInfo(deviceInfo) {
    set({ deviceInfo });
  },
  requestIme(text) {
    set({ imeRequest: { text, at: Date.now() } });
  },
  setRetryAt(retryAt) {
    set({ retryAt });
  },
}));
