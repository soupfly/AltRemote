import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import TvRemote from '../native/TvRemote';
import type { ScreenProps } from '../navigation';
import { useDevices } from '../store/devices';
import { mergeDevices } from '../store/deviceUtils';
import { makeStyles } from '../theme';

export function TvDetailScreen({ route, navigation }: ScreenProps<'TvDetail'>) {
  const { styles, colors } = useStyles();
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const saved = useDevices(s => s.saved);
  const discovered = useDevices(s => s.discovered);
  const reach = useDevices(s => s.reachability[id]);
  const tv = useMemo(
    () => mergeDevices(saved, Object.values(discovered)).find(r => r.id === id),
    [saved, discovered, id],
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: tv?.name ?? 'TV' });
  }, [navigation, tv?.name]);

  if (!tv) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.text}>This TV is no longer on the network.</Text>
      </View>
    );
  }

  const check = async () => {
    const { setReachability } = useDevices.getState();
    setReachability(id, 'checking');
    try {
      setReachability(id, await TvRemote.checkReachable(tv.host));
    } catch {
      setReachability(id, { remote: false, pairing: false });
    }
  };

  const forget = () =>
    Alert.alert('Forget this TV?', `${tv.name} will be removed from My TVs.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: () => {
          useDevices.getState().forgetTv(tv.id);
          navigation.goBack();
        },
      },
    ]);

  const portText = (open?: boolean) => (open ? 'open' : 'closed');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      {tv.saved && <RenameField id={tv.id} name={tv.name} />}
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: tv.online ? colors.ok : colors.border }]} />
          <Text style={styles.status}>
            {tv.online ? 'Online (seen on this network)' : 'Not seen on this network'}
          </Text>
        </View>
        <Field
          label="Pairing"
          value={
            tv.pairing
              ? `Paired ${new Date(tv.pairing.pairedAt).toLocaleDateString()}`
              : 'Not paired yet'
          }
          color={tv.pairing ? colors.ok : undefined}
        />
        <Field label="IP address" value={tv.host} />
        <Field label="Remote port" value={String(tv.port)} />
        {tv.btMac && <Field label="Bluetooth MAC (TV id)" value={tv.btMac} />}
        <Field label="Found by" value={tv.source === 'mdns' ? 'Network discovery' : 'Added by IP'} />
        {reach && reach !== 'checking' && (
          <Field
            label="Connection check"
            value={`Remote 6466 ${portText(reach.remote)} · Pairing 6467 ${portText(reach.pairing)}`}
            color={reach.remote && reach.pairing ? colors.ok : colors.danger}
          />
        )}
      </View>

      {tv.pairing && (
        <Button
          label="Open remote"
          variant="primary"
          onPress={() => navigation.navigate('Remote', { id: tv.id })}
          style={styles.gap}
        />
      )}
      <Button
        label={tv.pairing ? 'Pair again' : 'Pair with this TV'}
        variant={tv.pairing ? 'secondary' : 'primary'}
        onPress={() => navigation.navigate('Pairing', { id: tv.id })}
        style={styles.gap}
      />
      <Button
        label="Check connection"
        onPress={check}
        loading={reach === 'checking'}
        style={styles.gap}
      />
      {tv.saved ? (
        <Button label="Forget this TV" variant="danger" onPress={forget} style={styles.gap} />
      ) : (
        <Button
          label="Save to My TVs"
          onPress={() => useDevices.getState().saveTv(tv)}
          style={styles.gap}
        />
      )}
    </ScrollView>
  );
}

/** Saved TVs can be renamed; the name is saved when you leave the field. */
function RenameField({ id, name }: { id: string; name: string }) {
  const { styles, colors } = useStyles();
  const [value, setValue] = useState(name);
  const save = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) {
      useDevices.getState().renameTv(id, trimmed);
    } else {
      setValue(name);
    }
  };
  return (
    <View style={[styles.card, styles.renameCard]}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        onEndEditing={save}
        onSubmitEditing={save}
        returnKeyType="done"
        maxLength={40}
        style={styles.nameInput}
        placeholderTextColor={colors.muted}
        accessibilityLabel="TV name"
      />
    </View>
  );
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  const { styles, colors } = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={[styles.value, color ? { color } : null]}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  text: { color: colors.text, fontSize: 16 },
  card: { backgroundColor: colors.card, borderRadius: 24, padding: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  status: { color: colors.text, fontSize: 16, fontWeight: '600' },
  field: { marginTop: 14 },
  label: { color: colors.muted, fontSize: 13, marginBottom: 2 },
  value: { color: colors.text, fontSize: 16 },
  gap: { marginTop: 12 },
  renameCard: { marginBottom: 12, paddingTop: 14, paddingBottom: 10 },
  nameInput: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    paddingVertical: 6,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
}));
