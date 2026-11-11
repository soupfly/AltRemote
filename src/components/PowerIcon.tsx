import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '../theme';

/** Power symbol drawn with views (the ⏻ glyph is missing from many Android fonts). */
export function PowerIcon({ color, size = 24 }: { color?: string; size?: number }) {
  const colors = useColors();
  color = color ?? colors.danger;
  const stroke = Math.max(2, Math.round(size / 10));
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.ring,
          { width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: color },
          { borderTopColor: 'transparent' },
        ]}
      />
      <View
        style={[
          styles.bar,
          { width: stroke, height: size * 0.55, left: (size - stroke) / 2, backgroundColor: color, borderRadius: stroke },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', top: 0, left: 0 },
  bar: { position: 'absolute', top: -1 },
});
