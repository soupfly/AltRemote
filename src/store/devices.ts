import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { DiscoveredService } from '../native/TvRemote';
import { ReachabilityState, Tv, sameTv, tvFromService } from './deviceUtils';

interface DevicesState {
  /** TVs the user added or saved. Persisted on the phone. */
  saved: Tv[];
  /** TVs currently advertised on the network, keyed by mDNS service name. */
  discovered: Record<string, Tv>;
  reachability: Record<string, ReachabilityState>;
  discovering: boolean;
  discoveryError?: string;

  upsertDiscovered(service: DiscoveredService): void;
  removeDiscovered(serviceName: string): void;
  clearDiscovered(): void;
  setDiscoveryState(running: boolean, error?: string): void;
  /** Saves a TV, or updates the address of one already saved. Returns the saved TV's id. */
  saveTv(tv: Tv): string;
  /** Saves the TV (if needed) and records that pairing succeeded. Returns its id. */
  markPaired(tv: Tv, serverCertFingerprint: string): string;
  renameTv(id: string, name: string): void;
  forgetTv(id: string): void;
  setReachability(id: string, value: ReachabilityState): void;
}

export const useDevices = create<DevicesState>()(
  persist(
    (set, get) => ({
      saved: [],
      discovered: {},
      reachability: {},
      discovering: false,
      discoveryError: undefined,

      upsertDiscovered(service) {
        const tv = tvFromService(service);
        set(s => {
          // Keep a saved TV's address current when the TV moves to a new IP.
          const saved = s.saved.map(t =>
            sameTv(t, tv) && (t.host !== tv.host || !t.btMac)
              ? { ...t, host: tv.host, port: tv.port, btMac: t.btMac ?? tv.btMac }
              : t,
          );
          return { discovered: { ...s.discovered, [service.name]: tv }, saved };
        });
      },
      removeDiscovered(serviceName) {
        const { [serviceName]: _gone, ...rest } = get().discovered;
        set({ discovered: rest });
      },
      clearDiscovered() {
        set({ discovered: {} });
      },
      setDiscoveryState(running, error) {
        set({ discovering: running, discoveryError: error });
      },
      saveTv(tv) {
        const existing = get().saved.find(t => sameTv(t, tv));
        if (existing) {
          // Already saved: keep its id, name, MAC and source; only refresh the address.
          set(s => ({
            saved: s.saved.map(t =>
              t === existing
                ? { ...t, host: tv.host, port: tv.port, btMac: t.btMac ?? tv.btMac }
                : t,
            ),
          }));
          return existing.id;
        }
        set(s => ({ saved: [...s.saved, tv] }));
        return tv.id;
      },
      markPaired(tv, serverCertFingerprint) {
        const id = get().saveTv(tv);
        const pairing = { serverCertFingerprint, pairedAt: Date.now() };
        set(s => ({ saved: s.saved.map(t => (t.id === id ? { ...t, pairing } : t)) }));
        return id;
      },
      renameTv(id, name) {
        set(s => ({ saved: s.saved.map(t => (t.id === id ? { ...t, name } : t)) }));
      },
      forgetTv(id) {
        set(s => ({ saved: s.saved.filter(t => t.id !== id) }));
      },
      setReachability(id, value) {
        set(s => ({ reachability: { ...s.reachability, [id]: value } }));
      },
    }),
    {
      name: 'altremote.devices.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({ saved: s.saved }),
    },
  ),
);
