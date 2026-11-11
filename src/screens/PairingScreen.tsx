import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { HexKeypad } from '../components/HexKeypad';
import TvRemote, { errorCode } from '../native/TvRemote';
import type { ScreenProps } from '../navigation';
import { useDevices } from '../store/devices';
import { mergeDevices } from '../store/deviceUtils';
import { makeStyles } from '../theme';

const CODE_LENGTH = 6;

type Phase =
  | { kind: 'connecting' }
  | { kind: 'enter'; hint?: string }
  | { kind: 'verifying' }
  | { kind: 'paired'; id: string }
  | { kind: 'error'; message: string };

export function PairingScreen({ route, navigation }: ScreenProps<'Pairing'>) {
  const { styles, colors } = useStyles();
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const saved = useDevices(s => s.saved);
  const discovered = useDevices(s => s.discovered);
  const tv = useMemo(
    () => mergeDevices(saved, Object.values(discovered)).find(r => r.id === id),
    [saved, discovered, id],
  );

  const [phase, setPhase] = useState<Phase>({ kind: 'connecting' });
  const [code, setCode] = useState('');
  const pairedRef = useRef(false);
  const host = tv?.host;

  const start = useCallback(async () => {
    if (!host) return;
    setCode('');
    setPhase({ kind: 'connecting' });
    try {
      await TvRemote.startPairing(host);
      setPhase({ kind: 'enter' });
    } catch (e) {
      setPhase({ kind: 'error', message: (e as Error).message });
    }
  }, [host]);

  useEffect(() => {
    navigation.setOptions({ title: tv ? `Pair ${tv.name}` : 'Pair' });
    // Only start once per screen; the TV shows a new code each time pairing starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    start();
    return () => {
      if (!pairedRef.current) TvRemote.cancelPairing().catch(() => {});
    };
  }, [start]);

  const submit = useCallback(
    async (full: string) => {
      if (!tv) return;
      setPhase({ kind: 'verifying' });
      try {
        const result = await TvRemote.finishPairing(full);
        pairedRef.current = true;
        const savedId = useDevices.getState().markPaired(tv, result.serverCertFingerprint);
        setPhase({ kind: 'paired', id: savedId });
      } catch (e) {
        const c = errorCode(e);
        if (c === 'BAD_CODE') {
          // Typo: nothing was sent, the TV still shows the same code.
          setCode('');
          setPhase({ kind: 'enter', hint: "That doesn't match the code on the TV. Try again." });
        } else {
          setPhase({ kind: 'error', message: (e as Error).message });
        }
      }
    },
    [tv],
  );

  const onKey = (k: string) => {
    if (phase.kind !== 'enter' || code.length >= CODE_LENGTH) return;
    const next = code + k;
    setCode(next);
    if (next.length === CODE_LENGTH) submit(next);
  };

  const onDelete = () => {
    if (phase.kind === 'enter') setCode(c => c.slice(0, -1));
  };

  if (!tv) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.body}>This TV is no longer available.</Text>
      </View>
    );
  }

  const entering = phase.kind === 'enter' || phase.kind === 'verifying';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      {phase.kind === 'connecting' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.title}>Connecting to {tv.name}…</Text>
          <Text style={styles.body}>A code will appear on your TV screen.</Text>
        </View>
      )}

      {entering && (
        <>
          <Text style={styles.title}>Enter the code on your TV</Text>
          <Text style={styles.body}>
            {tv.name} is showing a 6-character code. Type it below.
          </Text>
          <CodeBoxes code={code} />
          <View style={styles.hintRow}>
            {phase.kind === 'verifying' ? (
              <>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.body}>Checking with the TV…</Text>
              </>
            ) : (
              phase.hint && <Text style={styles.warn}>{phase.hint}</Text>
            )}
          </View>
          <HexKeypad onKey={onKey} onDelete={onDelete} disabled={phase.kind !== 'enter'} />
          <Button label="Start over (new code)" onPress={start} style={styles.gap} />
        </>
      )}

      {phase.kind === 'paired' && (
        <View style={styles.center}>
          <Text style={styles.check}>✓</Text>
          <Text style={styles.title}>Paired with {tv.name}</Text>
          <Text style={styles.body}>
            The TV now trusts this phone. You won't need a code again unless you reset the app's
            identity or remove the phone on the TV.
          </Text>
          <Button
            label="Open remote"
            variant="primary"
            onPress={() => navigation.replace('Remote', { id: phase.id })}
            style={styles.fullWidth}
          />
        </View>
      )}

      {phase.kind === 'error' && (
        <View style={styles.center}>
          <Text style={[styles.check, { color: colors.danger }]}>!</Text>
          <Text style={styles.title}>Pairing didn't work</Text>
          <Text style={styles.body}>{phase.message}</Text>
          <Button label="Try again" variant="primary" onPress={start} style={styles.fullWidth} />
          <Button label="Cancel" onPress={() => navigation.goBack()} style={styles.fullWidth} />
        </View>
      )}
    </ScrollView>
  );
}

function CodeBoxes({ code }: { code: string }) {
  const { styles, colors } = useStyles();
  return (
    <View
      style={styles.boxes}
      accessible
      accessibilityLabel={`Code entered: ${code.split('').join(' ') || 'none'}`}>
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const filled = i < code.length;
        const current = i === code.length;
        return (
          <View key={i} style={[styles.box, current && styles.boxCurrent, filled && styles.boxFilled]}>
            <Text style={styles.boxText}>{code[i] ?? ''}</Text>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  center: { alignItems: 'center', paddingTop: 48, gap: 14 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  warn: { color: colors.warn, fontSize: 15, textAlign: 'center' },
  hintRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 8,
  },
  boxes: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 24 },
  box: {
    width: 48,
    height: 60,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  boxCurrent: { borderColor: colors.accent },
  boxFilled: { borderColor: colors.muted },
  boxText: { color: colors.text, fontSize: 28, fontWeight: '700', fontFamily: 'monospace' },
  check: { fontSize: 56, color: colors.ok, fontWeight: '700' },
  gap: { marginTop: 16 },
  fullWidth: { alignSelf: 'stretch', marginTop: 8 },
}));
