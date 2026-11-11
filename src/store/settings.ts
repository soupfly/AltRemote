import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'system' | 'dark' | 'light';
export type ControlMode = 'dpad' | 'touchpad';

interface SettingsState {
  haptics: boolean;
  /** Which control the remote shows first */
  defaultControl: ControlMode;
  theme: ThemeMode;
  /** Remote buttons in the notification shade and on the lock screen while connected */
  notificationControls: boolean;
  setHaptics(on: boolean): void;
  setDefaultControl(mode: ControlMode): void;
  setTheme(mode: ThemeMode): void;
  setNotificationControls(on: boolean): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    set => ({
      haptics: true,
      defaultControl: 'dpad',
      theme: 'dark',
      notificationControls: true,
      setHaptics: haptics => set({ haptics }),
      setDefaultControl: defaultControl => set({ defaultControl }),
      setTheme: theme => set({ theme }),
      setNotificationControls: notificationControls => set({ notificationControls }),
    }),
    {
      name: 'altremote.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
