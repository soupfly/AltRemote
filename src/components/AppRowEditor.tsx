import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KNOWN_APPS } from '../constants/apps';
import { customShortcut, useShortcuts } from '../store/shortcuts';
import { makeStyles } from '../theme';
import { Button } from './Button';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Edit the app shortcut row: reorder, remove, add a known app or a custom one. */
export function AppRowEditor({ visible, onClose }: Props) {
  const { styles, colors } = useStyles();
  const shortcuts = useShortcuts(s => s.shortcuts);
  const { remove, move, addKnown, add, reset } = useShortcuts.getState();
  const [label, setLabel] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string>();

  const available = KNOWN_APPS.filter(a => !shortcuts.some(s => s.id === a.id));

  const addCustom = () => {
    const sc = customShortcut(label, link);
    if (!sc) {
      setError('Enter a name and a link (like https://… or plex://) or a package name (com.example.app).');
      return;
    }
    add(sc);
    setLabel('');
    setLink('');
    setError(undefined);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>App shortcuts</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>On the remote</Text>
          {shortcuts.length === 0 && <Text style={styles.muted}>No shortcuts. Add some below.</Text>}
          {shortcuts.map((s, i) => (
            <View key={s.id} style={styles.item}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <View style={styles.itemText}>
                <Text style={styles.itemLabel}>{s.label}</Text>
                <Text style={styles.itemLink} numberOfLines={1}>
                  {s.link}
                </Text>
              </View>
              <IconButton label="↑" a11y={`Move ${s.label} left`} onPress={() => move(s.id, -1)} disabled={i === 0} />
              <IconButton
                label="↓"
                a11y={`Move ${s.label} right`}
                onPress={() => move(s.id, 1)}
                disabled={i === shortcuts.length - 1}
              />
              <IconButton label="✕" a11y={`Remove ${s.label}`} onPress={() => remove(s.id)} danger />
            </View>
          ))}

          {available.length > 0 && (
            <>
              <Text style={styles.section}>Add an app</Text>
              <View style={styles.chips}>
                {available.map(a => (
                  <Pressable
                    key={a.id}
                    onPress={() => addKnown(a.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${a.label}`}
                    style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
                    <View style={[styles.dot, { backgroundColor: a.color }]} />
                    <Text style={styles.chipText}>+ {a.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.section}>Add a custom app</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Name, e.g. Crunchyroll"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="Link or package, e.g. com.crunchyroll.crunchyroid"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Button label="Add custom app" onPress={addCustom} style={styles.gap} />
          <Text style={styles.muted}>
            A package name opens the app with market://launch?id=…, which works for any installed
            app.
          </Text>

          <Button label="Restore defaults" variant="danger" onPress={reset} style={styles.gapLarge} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function IconButton({
  label,
  a11y,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const { styles, colors } = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={4}
      style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.cardPressed }, disabled && { opacity: 0.3 }]}>
      <Text style={[styles.iconText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(colors => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  done: { color: colors.accent, fontSize: 17, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 48 },
  section: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  swatch: { width: 28, height: 28, borderRadius: 8 },
  itemText: { flex: 1 },
  itemLabel: { color: colors.text, fontSize: 16, fontWeight: '600' },
  itemLink: { color: colors.muted, fontSize: 12, marginTop: 2 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: colors.text, fontSize: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: colors.card,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { color: colors.text, fontSize: 15 },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.card,
    marginBottom: 10,
  },
  error: { color: colors.danger, fontSize: 14, marginBottom: 6 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  gap: { marginTop: 4 },
  gapLarge: { marginTop: 28 },
}));
