import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import { KeyCode } from '../constants/keycodes';
import { makeStyles } from '../theme';
import { press } from './sendKey';
import { Dir, TouchpadTracker } from './touchpadGesture';

const LONG_PRESS_MS = 500;

const KEY: Record<Dir, number> = {
  up: KeyCode.DPAD_UP,
  down: KeyCode.DPAD_DOWN,
  left: KeyCode.DPAD_LEFT,
  right: KeyCode.DPAD_RIGHT,
};
const GLYPH: Record<Dir | 'ok' | 'hold', string> = {
  up: '▲',
  down: '▼',
  left: '◀',
  right: '▶',
  ok: 'OK',
  hold: 'Hold',
};

interface Props {
  disabled?: boolean;
  /** Height in dp (matches the D-pad size) */
  height?: number;
  /** Called with true while a finger is on the pad, so the screen can stop scrolling. */
  onActiveChange?: (active: boolean) => void;
}

/** Swipe to move, tap for OK, hold for a long OK press. */
export function Touchpad({ disabled, onActiveChange, height = 264 }: Props) {
  const { styles } = useStyles();
  const [flash, setFlash] = useState<keyof typeof GLYPH | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longActive = useRef(false);
  const tracker = useRef(new TouchpadTracker()).current;
  const callbacks = useRef({ onActiveChange, disabled });
  callbacks.current = { onActiveChange, disabled };

  const show = (what: keyof typeof GLYPH) => {
    setFlash(what);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 350);
  };

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (longTimer.current) clearTimeout(longTimer.current);
    },
    [],
  );

  const responder = useMemo(() => {
    const end = (dx: number, dy: number, cancelled: boolean) => {
      if (longTimer.current) clearTimeout(longTimer.current);
      callbacks.current.onActiveChange?.(false);
      if (longActive.current) {
        longActive.current = false;
        press(KeyCode.DPAD_CENTER, 'END_LONG');
        return;
      }
      if (cancelled) return;
      const result = tracker.release(dx, dy);
      if (result === 'tap') {
        press(KeyCode.DPAD_CENTER);
        show('ok');
      } else if (result) {
        press(KEY[result]);
        show(result);
      }
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => !callbacks.current.disabled,
      onMoveShouldSetPanResponder: () => !callbacks.current.disabled,
      // Keep the gesture even if the ScrollView would like it.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        tracker.reset();
        longActive.current = false;
        callbacks.current.onActiveChange?.(true);
        longTimer.current = setTimeout(() => {
          if (!tracker.moved) {
            longActive.current = true;
            press(KeyCode.DPAD_CENTER, 'START_LONG');
            show('hold');
          }
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (_e, g) => {
        if (longActive.current) return;
        const dirs = tracker.move(g.dx, g.dy);
        if (tracker.moved && longTimer.current) {
          clearTimeout(longTimer.current);
          longTimer.current = null;
        }
        for (const d of dirs) {
          press(KEY[d]);
          show(d);
        }
      },
      onPanResponderRelease: (_e, g) => end(g.dx, g.dy, false),
      onPanResponderTerminate: (_e, g) => end(g.dx, g.dy, true),
    });
  }, [tracker]);

  return (
    <View
      {...responder.panHandlers}
      style={[styles.pad, { height }, disabled && styles.disabled]}
      accessible
      accessibilityLabel="Touchpad. Swipe to move, tap for OK, hold for a long press."
      accessibilityActions={[
        { name: 'activate', label: 'OK' },
        { name: 'increment', label: 'Up' },
        { name: 'decrement', label: 'Down' },
      ]}
      onAccessibilityAction={e => {
        if (e.nativeEvent.actionName === 'activate') press(KeyCode.DPAD_CENTER);
        if (e.nativeEvent.actionName === 'increment') press(KeyCode.DPAD_UP);
        if (e.nativeEvent.actionName === 'decrement') press(KeyCode.DPAD_DOWN);
      }}>
      {flash ? (
        <Text style={styles.flash}>{GLYPH[flash]}</Text>
      ) : (
        <Text style={styles.hint}>Swipe to move · Tap for OK{'\n'}Hold for a long press</Text>
      )}
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  pad: {
    borderRadius: 32,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  hint: { color: colors.muted, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  flash: { color: colors.accent, fontSize: 40, fontWeight: '700' },
}));
