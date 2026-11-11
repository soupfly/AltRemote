import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import TvRemote from '../native/TvRemote';
import { Shortcut, useShortcuts } from '../store/shortcuts';
import { makeStyles } from '../theme';
import { AppRowEditor } from './AppRowEditor';

interface Props {
  disabled?: boolean;
  onError?: (message: string) => void;
}

/** Horizontal row of app shortcuts that open apps on the TV via deep links. */
export function AppRow({ disabled, onError }: Props) {
  const { styles, colors } = useStyles();
  const shortcuts = useShortcuts(s => s.shortcuts);
  const [editing, setEditing] = useState(false);

  const launch = (s: Shortcut) => {
    TvRemote.launchApp(s.link).catch(e => onError?.(`Couldn't open ${s.label}: ${(e as Error).message}`));
  };

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {shortcuts.map(s => (
          <Pressable
            key={s.id}
            onPress={() => launch(s)}
            onLongPress={() => setEditing(true)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Open ${s.label}`}
            accessibilityHint="Long press to edit shortcuts"
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: s.color },
              pressed && { opacity: 0.75 },
              disabled && { opacity: 0.4 },
            ]}>
            <Text style={styles.tileText} numberOfLines={2}>
              {s.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => setEditing(true)}
          accessibilityRole="button"
          accessibilityLabel="Edit app shortcuts"
          style={({ pressed }) => [styles.tile, styles.editTile, pressed && { opacity: 0.75 }]}>
          <Text style={[styles.tileText, { color: colors.accent }]}>Edit</Text>
        </Pressable>
      </ScrollView>
      <AppRowEditor visible={editing} onClose={() => setEditing(false)} />
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  row: { gap: 10, paddingVertical: 4 },
  tile: {
    width: 92,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  editTile: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tileText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
}));
