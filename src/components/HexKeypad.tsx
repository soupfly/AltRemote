import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { makeStyles } from '../theme';

const ROWS = [
  ['1', '2', '3', 'A'],
  ['4', '5', '6', 'B'],
  ['7', '8', '9', 'C'],
  ['D', '0', 'E', 'F'],
];

interface Props {
  onKey: (key: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}

/** 0-9 / A-F keypad for the pairing code, so the phone keyboard isn't needed. */
export function HexKeypad({ onKey, onDelete, disabled }: Props) {
  const { styles, colors } = useStyles();
  return (
    <View style={styles.pad}>
      {ROWS.map(row => (
        <View key={row.join('')} style={styles.row}>
          {row.map(k => (
            <Key key={k} label={k} onPress={() => onKey(k)} disabled={disabled} />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        <Key label="⌫  Delete" onPress={onDelete} disabled={disabled} wide accessibilityLabel="Delete" />
      </View>
    </View>
  );
}

function Key({
  label,
  onPress,
  disabled,
  wide,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  wide?: boolean;
  accessibilityLabel?: string;
}) {
  const { styles, colors } = useStyles();
  const isLetter = /^[A-F]$/.test(label);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.key,
        wide && styles.wide,
        pressed && { backgroundColor: colors.cardPressed },
        disabled && { opacity: 0.4 },
      ]}>
      <Text style={[styles.keyText, isLetter && { color: colors.accent }, wide && styles.wideText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles(colors => ({
  pad: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  key: {
    flex: 1,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wide: { flex: 1 },
  keyText: { color: colors.text, fontSize: 24, fontWeight: '600' },
  wideText: { fontSize: 17, color: colors.muted },
}));
