/**
 * Known Google TV apps: package name (reported by the TV as the current app) and a deep
 * link that opens the app via remote_app_link_launch_request.
 *
 * Any installed app can also be opened with `market://launch?id=<package>`.
 */
export interface AppInfo {
  id: string;
  label: string;
  packageName: string;
  link: string;
  color: string;
}

export const KNOWN_APPS: AppInfo[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    packageName: 'com.google.android.youtube.tv',
    link: 'https://www.youtube.com',
    color: '#ff0033',
  },
  {
    id: 'netflix',
    label: 'Netflix',
    packageName: 'com.netflix.ninja',
    link: 'https://www.netflix.com/title',
    color: '#e50914',
  },
  {
    id: 'disney',
    label: 'Disney+',
    packageName: 'com.disney.disneyplus',
    link: 'https://www.disneyplus.com',
    color: '#113ccf',
  },
  {
    id: 'prime',
    label: 'Prime Video',
    packageName: 'com.amazon.amazonvideo.livingroom',
    link: 'https://app.primevideo.com',
    color: '#00a8e1',
  },
  {
    id: 'plex',
    label: 'Plex',
    packageName: 'com.plexapp.android',
    link: 'plex://',
    color: '#e5a00d',
  },
  {
    id: 'spotify',
    label: 'Spotify',
    packageName: 'com.spotify.tv.android',
    link: 'spotify://',
    color: '#1db954',
  },
  {
    id: 'hulu',
    label: 'Hulu',
    packageName: 'com.hulu.livingroomplus',
    link: 'https://www.hulu.com',
    color: '#1ce783',
  },
  {
    id: 'max',
    label: 'Max',
    packageName: 'com.wbd.stream',
    link: 'https://play.max.com',
    color: '#002be7',
  },
  {
    id: 'twitch',
    label: 'Twitch',
    packageName: 'tv.twitch.android.viewer',
    link: 'twitch://home',
    color: '#9146ff',
  },
];

export const DEFAULT_SHORTCUT_IDS = ['youtube', 'netflix', 'disney', 'prime', 'plex', 'spotify'];

/** System packages the TV reports that have friendlier names. */
const SYSTEM_LABELS: Record<string, string> = {
  'com.google.android.apps.tv.launcherx': 'Home',
  'com.google.android.tvlauncher': 'Home',
  'com.android.tv.settings': 'Settings',
  'com.google.android.katniss': 'Google Assistant',
  'com.google.android.tvrecommendations': 'Home',
};

/** Human-readable name for a package the TV reports, e.g. "com.netflix.ninja" → "Netflix". */
export function appLabel(packageName: string | undefined): string | undefined {
  if (!packageName) return undefined;
  const known = KNOWN_APPS.find(a => a.packageName === packageName);
  if (known) return known.label;
  if (SYSTEM_LABELS[packageName]) return SYSTEM_LABELS[packageName];
  if (/dream/i.test(packageName)) return 'Screensaver';
  // Fallback: the most meaningful package segment, e.g. "com.example.cooltv" → "Cooltv".
  const skip = ['com', 'org', 'net', 'io', 'de', 'tv', 'android', 'app', 'apps', 'google', 'atv', 'androidtv'];
  const parts = packageName.split('.').filter(p => !skip.includes(p.toLowerCase()));
  const word = parts[0] ?? packageName;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Deep link that opens an installed app by package name. */
export function launchLinkForPackage(packageName: string): string {
  return `market://launch?id=${packageName.trim()}`;
}

/** True for something that looks like an Android package name, e.g. "com.example.app". */
export function isPackageName(value: string): boolean {
  return /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(value.trim());
}
