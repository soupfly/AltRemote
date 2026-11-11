import { appLabel, isPackageName, launchLinkForPackage } from '../src/constants/apps';
import { customShortcut, defaultShortcuts, useShortcuts } from '../src/store/shortcuts';

describe('appLabel', () => {
  it('names known apps and system screens', () => {
    expect(appLabel('com.google.android.youtube.tv')).toBe('YouTube');
    expect(appLabel('com.netflix.ninja')).toBe('Netflix');
    expect(appLabel('com.google.android.apps.tv.launcherx')).toBe('Home');
  });

  it('makes a readable fallback for unknown packages', () => {
    expect(appLabel('com.crunchyroll.crunchyroid')).toBe('Crunchyroll');
    expect(appLabel(undefined)).toBeUndefined();
  });
});

describe('custom shortcuts', () => {
  it('accepts deep links as-is', () => {
    expect(customShortcut('Plex', 'plex://')?.link).toBe('plex://');
    expect(customShortcut('YT', ' https://www.youtube.com ')?.link).toBe('https://www.youtube.com');
  });

  it('turns a package name into a market launch link', () => {
    expect(isPackageName('com.crunchyroll.crunchyroid')).toBe(true);
    expect(customShortcut('Crunchyroll', 'com.crunchyroll.crunchyroid')?.link).toBe(
      launchLinkForPackage('com.crunchyroll.crunchyroid'),
    );
  });

  it('rejects empty names and junk links', () => {
    expect(customShortcut('', 'plex://')).toBeNull();
    expect(customShortcut('X', 'not a link')).toBeNull();
  });
});

describe('shortcut store', () => {
  beforeEach(() => useShortcuts.setState({ shortcuts: defaultShortcuts() }));

  it('starts with the six default apps', () => {
    expect(useShortcuts.getState().shortcuts.map(s => s.label)).toEqual([
      'YouTube',
      'Netflix',
      'Disney+',
      'Prime Video',
      'Plex',
      'Spotify',
    ]);
  });

  it('adds without duplicates, removes and reorders', () => {
    const st = useShortcuts.getState();
    st.addKnown('hulu');
    st.addKnown('hulu');
    st.remove('netflix');
    st.move('youtube', 1);
    expect(useShortcuts.getState().shortcuts.map(s => s.id)).toEqual([
      'disney',
      'youtube',
      'prime',
      'plex',
      'spotify',
      'hulu',
    ]);
  });
});

describe('appLabel fallbacks', () => {
  it('skips common package prefixes', () => {
    expect(appLabel('org.xbmc.kodi')).toBe('Xbmc');
    expect(appLabel('io.example.player')).toBe('Example');
  });
});
