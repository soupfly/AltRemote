import React from 'react';
import { Pressable, Text, View, ViewStyle } from 'react-native';
import { makeStyles } from '../theme';
import { haptic } from './haptics';

interface Props<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  style?: ViewStyle;
}

/** Material-style segmented button group. */
export function Segmented<T extends string>({ value, options, onChange, style }: Props<T>) {
  const { styles } = useStyles();
  return (
    <View style={[styles.group, style]} accessibilityRole="radiogroup">
      {options.map(o => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) haptic('tick');
              onChange(o.value);
            }}
            style={({ pressed }) => [
              styles.option,
              selected && styles.selected,
              pressed && !selected && styles.pressed,
            ]}>
            <Text style={[styles.label, selected && styles.selectedLabel]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  group: {
    flexDirection: 'row',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  option: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  selected: { backgroundColor: colors.accent },
  pressed: { backgroundColor: colors.cardPressed },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  selectedLabel: { color: colors.accentText },
}));
