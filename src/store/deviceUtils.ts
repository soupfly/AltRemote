import type { DiscoveredService, Reachability } from '../native/TvRemote';

export const REMOTE_PORT = 6466;

export interface Tv {
  /** Stable id: the TV's Bluetooth MAC from mDNS when known, otherwise its IP */
  id: string;
  name: string;
  host: string;
  port: number;
  btMac?: string;
  source: 'mdns' | 'manual';
  /** Set once the TV accepted the pairing code */
  pairing?: {
    /** SHA-256 of the TV's certificate at pairing time */
    serverCertFingerprint: string;
    /** Epoch milliseconds */
    pairedAt: number;
  };
}

export interface DeviceRow extends Tv {
  /** Seen by mDNS right now */
  online: boolean;
  /** In the user's saved list */
  saved: boolean;
}

export type ReachabilityState = Reachability | 'checking';

export function isValidIPv4(host: string): boolean {
  const parts = host.trim().split('.');
  return (
    parts.length === 4 &&
    parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255 && String(Number(p)) === p)
  );
}

export function tvFromService(s: DiscoveredService): Tv {
  const bt = s.attributes?.bt?.trim().toUpperCase();
  return {
    id: bt ? `bt:${bt}` : `ip:${s.host}`,
    name: s.name,
    host: s.host,
    port: s.port || REMOTE_PORT,
    btMac: bt || undefined,
    source: 'mdns',
  };
}

export function manualTv(name: string, host: string): Tv {
  const ip = host.trim();
  return {
    id: `ip:${ip}`,
    name: name.trim() || `TV at ${ip}`,
    host: ip,
    port: REMOTE_PORT,
    source: 'manual',
  };
}

/** True when a discovered TV is the same physical TV as a saved one. */
export function sameTv(a: Tv, b: Tv): boolean {
  if (a.id === b.id) return true;
  if (a.btMac && b.btMac) return a.btMac === b.btMac;
  return a.host === b.host;
}

/**
 * Builds the device list: saved TVs first (online if mDNS sees them, using the
 * address mDNS reports in case the TV's IP changed), then TVs on the network that
 * aren't saved yet.
 */
export function mergeDevices(saved: Tv[], discovered: Tv[]): DeviceRow[] {
  const used = new Set<Tv>();
  const savedRows = saved.map(tv => {
    const match = discovered.find(d => !used.has(d) && sameTv(tv, d));
    if (match) used.add(match);
    return {
      ...tv,
      host: match?.host ?? tv.host,
      port: match?.port ?? tv.port,
      btMac: tv.btMac ?? match?.btMac,
      online: !!match,
      saved: true,
    };
  });
  const newRows = discovered
    .filter(d => !used.has(d))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(d => ({ ...d, online: true, saved: false }));
  return [...savedRows, ...newRows];
}
