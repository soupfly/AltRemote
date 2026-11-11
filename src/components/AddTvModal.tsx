import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import TvRemote from '../native/TvRemote';
import { useDevices } from '../store/devices';
import { isValidIPv4, manualTv } from '../store/deviceUtils';
import { makeStyles } from '../theme';
import { Button } from './Button';

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdded: (id: string) => void;
}

/** "Add TV by IP" for networks where mDNS discovery doesn't work. */
export function AddTvModal({ visible, onClose, onAdded }: Props) {
  const { styles, colors } = useStyles();
  const [ip, setIp] = useState('');
  const [name, setName] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string>();
  const [unreachable, setUnreachable] = useState(false);

  const reset = () => {
    setIp('');
    setName('');
    setError(undefined);
    setUnreachable(false);
    setChecking(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const save = () => {
    const id = useDevices.getState().saveTv(manualTv(name, ip));
    reset();
    onAdded(id);
  };

  const check = async () => {
    const host = ip.trim();
    if (!isValidIPv4(host)) {
      setError('Enter an IPv4 address like 192.168.0.31');
      return;
    }
    setError(undefined);
    setUnreachable(false);
    setChecking(true);
    try {
      const r = await TvRemote.checkReachable(host);
      if (r.remote && r.pairing) {
        save();
      } else {
        setUnreachable(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Add TV by IP</Text>
          <Text style={styles.help}>
            Find the IP on the TV under Settings → Network & Internet → your Wi-Fi network.
          </Text>

          <Text style={styles.label}>IP address</Text>
          <TextInput
            value={ip}
            onChangeText={t => {
              setIp(t.replace(/[^0-9.]/g, ''));
              setUnreachable(false);
              setError(undefined);
            }}
            placeholder="192.168.0.31"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            autoFocus
            style={styles.input}
            onSubmitEditing={check}
            accessibilityLabel="TV IP address"
          />

          <Text style={styles.label}>Name (optional)</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Living room TV"
            placeholderTextColor={colors.muted}
            style={styles.input}
            accessibilityLabel="TV name"
          />

          {error && <Text style={styles.error}>{error}</Text>}
          {unreachable && (
            <Text style={styles.warn}>
              Nothing answered on ports 6466/6467 at {ip.trim()}. Check the TV is on and on the
              same Wi-Fi. You can save it anyway.
            </Text>
          )}

          <View style={styles.buttons}>
            <Button label="Cancel" onPress={close} style={styles.flex} />
            {unreachable ? (
              <Button label="Save anyway" variant="primary" onPress={save} style={styles.flex} />
            ) : (
              <Button
                label="Add"
                variant="primary"
                onPress={check}
                loading={checking}
                disabled={!ip.trim()}
                style={styles.flex}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles(colors => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: { backgroundColor: colors.card, borderRadius: 28, padding: 24 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  help: { color: colors.muted, fontSize: 14, marginTop: 6, lineHeight: 20 },
  label: { color: colors.muted, fontSize: 13, marginTop: 18, marginBottom: 6 },
  input: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 18,
    backgroundColor: colors.bg,
  },
  error: { color: colors.danger, marginTop: 12, fontSize: 14 },
  warn: { color: colors.warn, marginTop: 12, fontSize: 14, lineHeight: 20 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  flex: { flex: 1 },
}));
