import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyCode } from '../constants/keycodes';
import { makeStyles } from '../theme';
import { press } from './sendKey';

const DEFAULT_SIZE = 264;

interface Props {
  disabled?: boolean;
  /** Diameter in dp */
  size?: number;
}

/**
 * Ring D-pad with a center OK button. Tap OK = select; hold OK = long press
 * (START_LONG on hold, END_LONG on release), which opens context menus on Google TV.
 */
export function DPad({ disabled, size = DEFAULT_SIZE }: Props) {
  const { styles, colors } = useStyles();
  const center = Math.round(size * 0.4);
  const arm = (size - center) / 2;
  const pos = {
    up: { top: 0, left: arm, width: center, height: arm, borderRadius: arm / 2 },
    down: { bottom: 0, left: arm, width: center, height: arm, borderRadius: arm / 2 },
    left: { left: 0, top: arm, width: arm, height: center, borderRadius: arm / 2 },
    right: { right: 0, top: arm, width: arm, height: center, borderRadius: arm / 2 },
  };
  const longPressing = useRef(false);

  const arrow = (keyCode: number, label: string, glyph: string, pos: object) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      // onPress (not onPressIn): a touch that turns into a scroll is cancelled and sends nothing.
      onPress={() => press(keyCode)}
      style={({ pressed }) => [styles.arrow, pos, pressed && styles.arrowPressed]}>
      <Text style={styles.glyph}>{glyph}</Text>
    </Pressable>
  );

  return (
    <View
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2 },
        disabled && { opacity: 0.4 },
      ]}>
      {arrow(KeyCode.DPAD_UP, 'Up', '▲', pos.up)}
      {arrow(KeyCode.DPAD_DOWN, 'Down', '▼', pos.down)}
      {arrow(KeyCode.DPAD_LEFT, 'Left', '◀', pos.left)}
      {arrow(KeyCode.DPAD_RIGHT, 'Right', '▶', pos.right)}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="OK"
        accessibilityHint="Hold for a long press"
        disabled={disabled}
        delayLongPress={500}
        onPress={() => {
          if (!longPressing.current) press(KeyCode.DPAD_CENTER);
        }}
        onLongPress={() => {
          longPressing.current = true;
          press(KeyCode.DPAD_CENTER, 'START_LONG');
        }}
        onPressOut={() => {
          if (longPressing.current) {
            press(KeyCode.DPAD_CENTER, 'END_LONG');
            // Reset after onPress (which fires after onPressOut) has been skipped.
            setTimeout(() => (longPressing.current = false), 0);
          }
        }}
        style={({ pressed }) => [
          styles.ok,
          { top: arm, left: arm, width: center, height: center, borderRadius: center / 2 },
          pressed && { backgroundColor: colors.accent },
        ]}>
        {({ pressed }) => (
          <Text style={[styles.okText, pressed && { color: colors.accentText }]}>OK</Text>
        )}
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  ring: {
    backgroundColor: colors.card,
    alignSelf: 'center',
  },
  arrow: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowPressed: { backgroundColor: colors.cardPressed },
  glyph: { color: colors.muted, fontSize: 22 },
  ok: {
    position: 'absolute',
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  okText: { color: colors.text, fontSize: 22, fontWeight: '700' },
}));
