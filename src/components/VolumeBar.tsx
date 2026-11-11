import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { makeStyles } from '../theme';

interface Props {
  volume?: { level: number; max: number; muted: boolean };
}

/** Live volume level reported by the TV (remote_set_volume_level). */
export function VolumeBar({ volume }: Props) {
  const { styles, colors } = useStyles();
  if (!volume || volume.max <= 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>Volume</Text>
        <View style={styles.track} />
        <Text style={styles.value}>–</Text>
      </View>
    );
  }
  const pct = Math.max(0, Math.min(1, volume.level / volume.max));
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={volume.muted ? 'Volume muted' : `Volume ${volume.level} of ${volume.max}`}
      accessibilityValue={{ min: 0, max: volume.max, now: volume.level }}>
      <Text style={styles.label}>{volume.muted ? 'Muted' : 'Volume'}</Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${pct * 100}%`, backgroundColor: volume.muted ? colors.muted : colors.accent },
          ]}
        />
      </View>
      <Text style={styles.value}>{volume.muted ? '0' : volume.level}</Text>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, marginBottom: 8 },
  label: { color: colors.muted, fontSize: 13, width: 56 },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  value: { color: colors.text, fontSize: 15, fontWeight: '600', width: 36, textAlign: 'right' },
}));
