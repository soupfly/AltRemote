import React from 'react';
import { ActivityIndicator, Pressable, Text, ViewStyle } from 'react-native';
import { makeStyles } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({ label, onPress, variant = 'secondary', disabled, loading, style }: Props) {
  const { styles, colors } = useStyles();
  const inactive = disabled || loading;
  const textStyle =
    variant === 'primary' ? styles.primaryText : variant === 'danger' ? styles.dangerText : styles.secondaryText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.accentText : colors.accent} />
      ) : (
        <Text style={[styles.text, textStyle]}>{label}</Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(colors => ({
  base: {
    minHeight: 56,
    borderRadius: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.card },
  danger: { borderWidth: 1, borderColor: colors.danger },
  pressed: { opacity: 0.75 },
  inactive: { opacity: 0.45 },
  text: { fontSize: 16, fontWeight: '600' },
  primaryText: { color: colors.accentText },
  secondaryText: { color: colors.accent },
  dangerText: { color: colors.danger },
}));
