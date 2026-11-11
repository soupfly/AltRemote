import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { makeStyles } from '../theme';
import { press } from './sendKey';

interface Props {
  label: string;
  /** Drawn instead of the label text (label is still used for accessibility). */
  icon?: React.ReactNode;
  keyCode: number;
  accessibilityLabel?: string;
  /** Keep sending the key while held (volume). */
  repeatOnHold?: boolean;
  disabled?: boolean;
  variant?: 'round' | 'pill';
  tint?: string;
  style?: ViewStyle;
}

const REPEAT_DELAY_MS = 400;
const REPEAT_EVERY_MS = 130;

/** A remote button that sends one Android key code to the TV. */
export function KeyButton({
  label,
  icon,
  keyCode,
  accessibilityLabel,
  repeatOnHold,
  disabled,
  variant = 'round',
  tint,
  style,
}: Props) {
  const { styles, colors } = useStyles();
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRepeat = () => {
    if (interval.current) clearInterval(interval.current);
    interval.current = null;
  };

  useEffect(() => stopRepeat, []);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      // onPress (not onPressIn) so a touch that turns into a scroll sends nothing.
      // React Native skips onPress after onLongPress, so a held repeat key doesn't double-send.
      onPress={() => press(keyCode)}
      delayLongPress={REPEAT_DELAY_MS}
      onLongPress={
        repeatOnHold
          ? () => {
              press(keyCode);
              interval.current = setInterval(() => press(keyCode), REPEAT_EVERY_MS);
            }
          : undefined
      }
      onPressOut={stopRepeat}
      style={({ pressed }) => [
        variant === 'round' ? styles.round : styles.pill,
        pressed && { backgroundColor: colors.cardPressed },
        disabled && { opacity: 0.4 },
        style,
      ]}>
      {icon ?? <Text style={[styles.label, tint ? { color: tint } : null]}>{label}</Text>}
    </Pressable>
  );
}

const useStyles = makeStyles(colors => ({
  round: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.text, fontSize: 20, fontWeight: '600' },
}));
