import { DarkTheme, DefaultTheme, Theme } from '@react-navigation/native';
import React, { createContext, useContext } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { useSettings } from './store/settings';

export interface Palette {
  dark: boolean;
  bg: string;
  card: string;
  cardPressed: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  danger: string;
  ok: string;
  warn: string;
}

export const darkPalette: Palette = {
  dark: true,
  bg: '#101214',
  card: '#1b1f23',
  cardPressed: '#252a30',
  border: '#2d3238',
  text: '#e8eaed',
  muted: '#9aa0a6',
  accent: '#8ab4f8',
  accentText: '#0b1d36',
  danger: '#f28b82',
  ok: '#81c995',
  warn: '#fdd663',
};

export const lightPalette: Palette = {
  dark: false,
  bg: '#f8f9fa',
  card: '#ffffff',
  cardPressed: '#e8eaed',
  border: '#dadce0',
  text: '#202124',
  muted: '#5f6368',
  accent: '#1a73e8',
  accentText: '#ffffff',
  danger: '#d93025',
  ok: '#188038',
  warn: '#b06000',
};

const ThemeContext = createContext<Palette>(darkPalette);

/** Picks the palette from Settings (dark / light / follow the phone). */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSettings(s => s.theme);
  const system = useColorScheme();
  const palette =
    mode === 'light' || (mode === 'system' && system === 'light') ? lightPalette : darkPalette;
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

export function useColors(): Palette {
  return useContext(ThemeContext);
}

/** What StyleSheet.create accepts. */
type StyleDefs = Parameters<typeof StyleSheet.create>[0];

/**
 * Themed styles: `const useStyles = makeStyles(colors => ({ ... }))`, then inside a
 * component `const { styles, colors } = useStyles()`. Styles are built once per palette.
 */
export function makeStyles<S extends StyleDefs>(
  // `& StyleDefs` keeps literals like 'center' narrow, as StyleSheet.create does.
  build: (colors: Palette) => S & StyleDefs,
) {
  const cache = new Map<Palette, Readonly<S>>();
  return function useStyles(): { styles: Readonly<S>; colors: Palette } {
    const colors = useColors();
    let styles = cache.get(colors);
    if (!styles) {
      styles = StyleSheet.create(build(colors));
      cache.set(colors, styles);
    }
    return { styles, colors };
  };
}

export function navTheme(c: Palette): Theme {
  const base = c.dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.accent,
      background: c.bg,
      card: c.bg,
      text: c.text,
      border: c.border,
    },
  };
}
