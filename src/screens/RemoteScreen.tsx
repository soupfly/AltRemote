import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppRow } from '../components/AppRow';
import { Button } from '../components/Button';
import { DPad } from '../components/DPad';
import { KeyButton } from '../components/KeyButton';
import { KeyboardSheet } from '../components/KeyboardSheet';
import { PowerIcon } from '../components/PowerIcon';
import {
  FastForwardIcon,
  MicIcon,
  MuteIcon,
  NextIcon,
  PlayPauseIcon,
  PrevIcon,
  RewindIcon,
} from '../components/icons';
import { Segmented } from '../components/Segmented';
import { Touchpad } from '../components/Touchpad';
import { VolumeBar } from '../components/VolumeBar';
import { appLabel } from '../constants/apps';
import { KeyCode } from '../constants/keycodes';
import { useRemoteConnection } from '../hooks/useRemoteConnection';
import type { ScreenProps } from '../navigation';
import { useConnection } from '../store/connection';
import { useDevices } from '../store/devices';
import { mergeDevices } from '../store/deviceUtils';
import { ControlMode, useSettings } from '../store/settings';
import { makeStyles } from '../theme';

export function RemoteScreen({ route, navigation }: ScreenProps<'Remote'>) {
  const { styles, colors } = useStyles();
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // Size the D-pad / touchpad so the whole remote fits on one screen where possible.
  const padSize = Math.round(Math.max(200, Math.min(264, window.width - 64, window.height - 660)));
  const saved = useDevices(s => s.saved);
  const discovered = useDevices(s => s.discovered);
  const tv = useMemo(
    () => mergeDevices(saved, Object.values(discovered)).find(r => r.id === id),
    [saved, discovered, id],
  );
  const { reconnect } = useRemoteConnection(tv);
  const state = useConnection(s => s.state);
  const errorMessage = useConnection(s => s.errorMessage);
  const isOn = useConnection(s => s.isOn);
  const currentApp = useConnection(s => s.currentApp);
  const volume = useConnection(s => s.volume);
  const imeRequest = useConnection(s => s.imeRequest);
  const [keyboard, setKeyboard] = useState<{ open: boolean; text: string }>({ open: false, text: '' });
  const [actionError, setActionError] = useState<string>();
  const retryAt = useConnection(s => s.retryAt);
  const [control, setControl] = useState<ControlMode>(() => useSettings.getState().defaultControl);
  const [touching, setTouching] = useState(false);

  // The TV focused a text field and opened its keyboard: open ours with the field's text.
  const lastIme = useRef(imeRequest?.at);
  useEffect(() => {
    if (imeRequest && imeRequest.at !== lastIme.current) {
      lastIme.current = imeRequest.at;
      setKeyboard({ open: true, text: imeRequest.text });
    }
  }, [imeRequest]);

  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(undefined), 4000);
    return () => clearTimeout(t);
  }, [actionError]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: tv?.name ?? 'Remote',
      headerRight: () => (
        <Pressable
          hitSlop={12}
          accessibilityRole="button"
          onPress={() => navigation.navigate('TvDetail', { id })}>
          <Text style={styles.headerLink}>Details</Text>
        </Pressable>
      ),
    });
  }, [navigation, tv?.name, id]);

  const connected = state === 'connected';

  return (
    <ScrollView
      style={styles.screen}
      scrollEnabled={!touching}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <StatusBanner
        state={state}
        name={tv?.name}
        message={errorMessage}
        retryAt={retryAt}
        isOn={isOn}
        currentApp={appLabel(currentApp)}
        onRetry={reconnect}
        onPair={() => navigation.navigate('Pairing', { id })}
      />
      {actionError && <Text style={styles.actionError}>{actionError}</Text>}

      <AppRow disabled={!connected} onError={setActionError} />

      <View style={[styles.row, styles.gap]}>
        <KeyButton label="Power" icon={<PowerIcon />} keyCode={KeyCode.POWER} disabled={!connected} />
        <KeyButton label="Assistant" icon={<MicIcon />} keyCode={KeyCode.ASSIST} disabled={!connected} />
        <KeyButton label="⇥" accessibilityLabel="Input" keyCode={KeyCode.TV_INPUT} disabled={!connected} />
        <KeyButton label="⚙" accessibilityLabel="Settings" keyCode={KeyCode.SETTINGS} disabled={!connected} />
      </View>

      <View style={styles.dpad}>
        <Segmented
          value={control}
          onChange={setControl}
          options={[
            { value: 'dpad', label: 'D-pad' },
            { value: 'touchpad', label: 'Touchpad' },
          ]}
          style={styles.segmented}
        />
        {control === 'dpad' ? (
          <DPad disabled={!connected} size={padSize} />
        ) : (
          <Touchpad disabled={!connected} onActiveChange={setTouching} height={padSize} />
        )}
      </View>

      <View style={styles.row}>
        <KeyButton label="←" accessibilityLabel="Back" keyCode={KeyCode.BACK} disabled={!connected} />
        <KeyButton label="⌂" accessibilityLabel="Home" keyCode={KeyCode.HOME} disabled={!connected} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keyboard: type on the TV"
          disabled={!connected}
          onPress={() => setKeyboard({ open: true, text: '' })}
          style={({ pressed }) => [
            styles.roundButton,
            pressed && { backgroundColor: colors.cardPressed },
            !connected && { opacity: 0.4 },
          ]}>
          <Text style={styles.roundText}>⌨</Text>
        </Pressable>
      </View>

      <View style={[styles.row, styles.gap]}>
        <KeyButton label="Previous" icon={<PrevIcon />} keyCode={KeyCode.MEDIA_PREVIOUS} disabled={!connected} style={styles.media} />
        <KeyButton label="Rewind" icon={<RewindIcon />} keyCode={KeyCode.MEDIA_REWIND} disabled={!connected} style={styles.media} />
        <KeyButton label="Play or pause" icon={<PlayPauseIcon />} keyCode={KeyCode.MEDIA_PLAY_PAUSE} disabled={!connected} style={styles.media} />
        <KeyButton label="Fast forward" icon={<FastForwardIcon />} keyCode={KeyCode.MEDIA_FAST_FORWARD} disabled={!connected} style={styles.media} />
        <KeyButton label="Next" icon={<NextIcon />} keyCode={KeyCode.MEDIA_NEXT} disabled={!connected} style={styles.media} />
      </View>

      <VolumeBar volume={volume} />
      <View style={styles.row}>
        <KeyButton variant="pill" label="−" accessibilityLabel="Volume down" keyCode={KeyCode.VOLUME_DOWN} repeatOnHold disabled={!connected} />
        <KeyButton variant="pill" label="Mute" icon={<MuteIcon />} keyCode={KeyCode.VOLUME_MUTE} disabled={!connected} />
        <KeyButton variant="pill" label="+" accessibilityLabel="Volume up" keyCode={KeyCode.VOLUME_UP} repeatOnHold disabled={!connected} />
      </View>

      <KeyboardSheet
        visible={keyboard.open}
        initialText={keyboard.text}
        onClose={() => setKeyboard(k => ({ ...k, open: false }))}
      />
    </ScrollView>
  );
}

function StatusBanner({
  state,
  name,
  message,
  retryAt,
  isOn,
  currentApp,
  onRetry,
  onPair,
}: {
  state: string;
  name?: string;
  message?: string;
  retryAt?: number;
  isOn?: boolean;
  currentApp?: string;
  onRetry: () => void;
  onPair: () => void;
}) {
  const { styles, colors } = useStyles();
  if (state === 'connected') {
    const details = [isOn === false ? 'TV screen off' : undefined, currentApp].filter(Boolean);
    return (
      <View style={styles.banner}>
        <View style={[styles.dot, { backgroundColor: colors.ok }]} />
        <Text style={styles.bannerText} numberOfLines={1}>
          Connected{details.length ? ` · ${details.join(' · ')}` : ''}
        </Text>
      </View>
    );
  }
  if (state === 'connecting') {
    return (
      <View style={styles.banner}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.bannerText}>Connecting to {name ?? 'TV'}…</Text>
      </View>
    );
  }
  if (state === 'pairing_required') {
    return (
      <View style={[styles.banner, styles.bannerColumn]}>
        <Text style={[styles.bannerText, { color: colors.warn }]}>
          {message ?? 'The TV needs to be paired again.'}
        </Text>
        <Button label="Pair again" variant="primary" onPress={onPair} style={styles.bannerButton} />
      </View>
    );
  }
  return (
    <View style={[styles.banner, styles.bannerColumn]}>
      <Text style={[styles.bannerText, state === 'error' && { color: colors.danger }]}>
        {state === 'error' ? message ?? 'Connection failed' : 'Disconnected'}
      </Text>
      {retryAt && <RetryCountdown at={retryAt} />}
      <Button
        label={retryAt ? 'Retry now' : 'Reconnect'}
        onPress={onRetry}
        style={styles.bannerButton}
      />
    </View>
  );
}

function RetryCountdown({ at }: { at: number }) {
  const { styles } = useStyles();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.ceil((at - now) / 1000));
  return (
    <Text style={styles.retryText}>
      {secs > 0 ? `Reconnecting in ${secs} s…` : 'Reconnecting…'}
    </Text>
  );
}

const useStyles = makeStyles(colors => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  headerLink: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.card,
    marginBottom: 12,
  },
  bannerColumn: { flexDirection: 'column', alignItems: 'stretch' },
  bannerText: { color: colors.text, fontSize: 15, flexShrink: 1 },
  bannerButton: { minHeight: 48 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  gap: { marginTop: 14 },
  dpad: { marginVertical: 12 },
  segmented: { marginBottom: 10 },
  retryText: { color: colors.muted, fontSize: 14 },
  media: { width: 54, height: 54, borderRadius: 27 },
  roundButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundText: { color: colors.text, fontSize: 24 },
  actionError: { color: colors.danger, fontSize: 14, marginTop: -10, marginBottom: 12 },
}));
