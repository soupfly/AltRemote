import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import TvRemote, { IdentityInfo } from '../native/TvRemote';
import { makeStyles } from '../theme';

/** Shows the app's client certificate. Opened from Settings → Client identity. */
export function IdentityScreen() {
  const { styles, colors } = useStyles();
  const insets = useSafeAreaInsets();
  const [identity, setIdentity] = useState<IdentityInfo | null>(null);
  const [status, setStatus] = useState('Checking identity…');
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const info = await TvRemote.generateIdentityIfNeeded();
      setIdentity(info);
      setStatus(info.created ? 'New identity created' : 'Identity loaded from Keystore');
    } catch (e) {
      setIdentity(null);
      setStatus(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmReset = () =>
    Alert.alert(
      'Reset identity?',
      "This deletes the app's certificate. Every TV will need to be paired again.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await TvRemote.resetIdentity();
              await load();
            } catch (e) {
              setStatus(`Error: ${(e as Error).message}`);
              setBusy(false);
            }
          },
        },
      ],
    );

  const isError = status.startsWith('Error');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.card}>
        <View style={styles.statusRow}>
          {busy ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <View
              style={[styles.dot, { backgroundColor: isError ? colors.danger : colors.ok }]}
            />
          )}
          <Text style={[styles.status, isError && { color: colors.danger }]}>{status}</Text>
        </View>

        {identity && (
          <>
            <Field label="Subject" value={identity.subject} />
            <Field label="Key" value={`RSA ${identity.keySizeBits}-bit`} />
            <Field label="Stored in" value={identity.securityLevel} />
            <Field
              label="Valid"
              value={`${new Date(identity.notBefore).toLocaleDateString()} – ${new Date(
                identity.notAfter,
              ).toLocaleDateString()}`}
            />
            <Field label="Serial" value={identity.serialNumber} mono />
            <Field label="SHA-256 fingerprint" value={identity.sha256Fingerprint} mono />
          </>
        )}
      </View>

      <View style={styles.buttons}>
        <Button label="Reload" onPress={load} disabled={busy} style={styles.flex} />
        <Button
          label="Reset identity"
          variant="danger"
          onPress={confirmReset}
          disabled={busy}
          style={styles.flex}
        />
      </View>

      <Text style={styles.hint}>
        This certificate identifies the app to your TVs. It stays the same across restarts, so
        the TV remembers the app after pairing.
      </Text>
    </ScrollView>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { styles, colors } = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={[styles.value, mono && styles.mono]}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  card: { backgroundColor: colors.card, borderRadius: 24, padding: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  status: { color: colors.text, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  field: { marginTop: 14 },
  label: { color: colors.muted, fontSize: 13, marginBottom: 2 },
  value: { color: colors.text, fontSize: 15 },
  mono: { fontFamily: 'monospace', fontSize: 13, lineHeight: 19 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  flex: { flex: 1 },
  hint: { color: colors.muted, fontSize: 14, marginTop: 20, lineHeight: 20 },
}));
