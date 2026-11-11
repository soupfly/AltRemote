import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DEFAULT_SHORTCUT_IDS,
  KNOWN_APPS,
  isPackageName,
  launchLinkForPackage,
} from '../constants/apps';

export interface Shortcut {
  id: string;
  label: string;
  /** Deep link sent to the TV */
  link: string;
  color: string;
}

const CUSTOM_COLOR = '#5f6368';

function fromKnown(id: string): Shortcut | undefined {
  const a = KNOWN_APPS.find(k => k.id === id);
  return a && { id: a.id, label: a.label, link: a.link, color: a.color };
}

export const defaultShortcuts = (): Shortcut[] =>
  DEFAULT_SHORTCUT_IDS.map(fromKnown).filter((s): s is Shortcut => !!s);

/**
 * Turns user input into a shortcut. Accepts a deep link (https://, plex://, …) or an
 * Android package name, which becomes market://launch?id=<package>.
 */
export function customShortcut(label: string, linkOrPackage: string): Shortcut | null {
  const value = linkOrPackage.trim();
  const name = label.trim();
  if (!value || !name) return null;
  let link: string;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('market:')) {
    link = value;
  } else if (isPackageName(value)) {
    link = launchLinkForPackage(value);
  } else {
    return null;
  }
  return { id: `custom:${link}`, label: name, link, color: CUSTOM_COLOR };
}

interface ShortcutsState {
  shortcuts: Shortcut[];
  add(shortcut: Shortcut): void;
  addKnown(id: string): void;
  remove(id: string): void;
  move(id: string, delta: -1 | 1): void;
  reset(): void;
}

export const useShortcuts = create<ShortcutsState>()(
  persist(
    set => ({
      shortcuts: defaultShortcuts(),
      add(shortcut) {
        set(s =>
          s.shortcuts.some(x => x.id === shortcut.id) ? s : { shortcuts: [...s.shortcuts, shortcut] },
        );
      },
      addKnown(id) {
        const sc = fromKnown(id);
        if (sc) {
          set(s => (s.shortcuts.some(x => x.id === id) ? s : { shortcuts: [...s.shortcuts, sc] }));
        }
      },
      remove(id) {
        set(s => ({ shortcuts: s.shortcuts.filter(x => x.id !== id) }));
      },
      move(id, delta) {
        set(s => {
          const i = s.shortcuts.findIndex(x => x.id === id);
          const j = i + delta;
          if (i < 0 || j < 0 || j >= s.shortcuts.length) return s;
          const next = [...s.shortcuts];
          [next[i], next[j]] = [next[j], next[i]];
          return { shortcuts: next };
        });
      },
      reset() {
        set({ shortcuts: defaultShortcuts() });
      },
    }),
    {
      name: 'altremote.shortcuts.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
