import React from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Segmented } from '../components/Segmented';
import type { ScreenProps } from '../navigation';
import { useDevices } from '../store/devices';
import { ControlMode, ThemeMode, useSettings } from '../store/settings';
import { makeStyles } from '../theme';

const appVersion: string = require('../../package.json').version;

export function SettingsScreen({ navigation }: ScreenProps<'Settings'>) {
  const { styles, colors } = useStyles();
  const insets = useSafeAreaInsets();
  const haptics = useSettings(s => s.haptics);
  const defaultControl = useSettings(s => s.defaultControl);
  const theme = useSettings(s => s.theme);
  const notificationControls = useSettings(s => s.notificationControls);
  const { setHaptics, setDefaultControl, setTheme, setNotificationControls } =
    useSettings.getState();
  const saved = useDevices(s => s.saved);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.section}>Remote</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Haptic feedback</Text>
            <Text style={styles.sub}>Vibrate briefly on every button press</Text>
          </View>
          <Switch
            value={haptics}
            onValueChange={setHaptics}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor={colors.card}
            accessibilityLabel="Haptic feedback"
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Notification controls</Text>
            <Text style={styles.sub}>
              Remote buttons in the notification shade and on the lock screen while connected.
              Also keeps the connection alive in the background.
            </Text>
          </View>
          <Switch
            value={notificationControls}
            onValueChange={setNotificationControls}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor={colors.card}
            accessibilityLabel="Notification controls"
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.block}>
          <Text style={styles.label}>Default control</Text>
          <Text style={styles.sub}>What the remote shows first. You can switch on the remote.</Text>
          <Segmented<ControlMode>
            value={defaultControl}
            onChange={setDefaultControl}
            options={[
              { value: 'dpad', label: 'D-pad' },
              { value: 'touchpad', label: 'Touchpad' },
            ]}
            style={styles.segmented}
          />
        </View>
      </View>

      <Text style={styles.section}>Appearance</Text>
      <View style={styles.card}>
        <View style={styles.block}>
          <Text style={styles.label}>Theme</Text>
          <Segmented<ThemeMode>
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
            style={styles.segmented}
          />
        </View>
      </View>

      <Text style={styles.section}>My TVs</Text>
      <View style={styles.card}>
        {saved.length === 0 && (
          <Text style={[styles.sub, styles.block]}>No saved TVs yet.</Text>
        )}
        {saved.map((tv, i) => (
          <React.Fragment key={tv.id}>
            {i > 0 && <View style={styles.divider} />}
            <LinkRow
              label={tv.name}
              sub={`${tv.host}${tv.pairing ? ' · paired' : ''}`}
              onPress={() => navigation.navigate('TvDetail', { id: tv.id })}
            />
          </React.Fragment>
        ))}
      </View>
      <Text style={styles.hint}>Open a TV to rename it, pair it again or forget it.</Text>

      <Text style={styles.section}>Advanced</Text>
      <View style={styles.card}>
        <LinkRow
          label="Client identity"
          sub="The certificate your TVs know this phone by"
          onPress={() => navigation.navigate('Identity')}
        />
      </View>

      <Text style={styles.about}>AltRemote {appVersion}</Text>
    </ScrollView>
  );
}

function LinkRow({ label, sub, onPress }: { label: string; sub?: string; onPress: () => void }) {
  const { styles, colors } = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.cardPressed }]}>
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {sub && <Text style={styles.sub}>{sub}</Text>}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(colors => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  section: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: { backgroundColor: colors.card, borderRadius: 20, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 12,
  },
  rowText: { flex: 1 },
  block: { padding: 18 },
  label: { color: colors.text, fontSize: 16, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  segmented: { marginTop: 12 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 18 },
  chevron: { color: colors.muted, fontSize: 26 },
  hint: { color: colors.muted, fontSize: 13, marginTop: 8, marginLeft: 4 },
  about: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 32 },
}));
