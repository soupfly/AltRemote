import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddTvModal } from '../components/AddTvModal';
import { Button } from '../components/Button';
import { useDiscovery } from '../hooks/useDiscovery';
import type { ScreenProps } from '../navigation';
import { useDevices } from '../store/devices';
import { DeviceRow, mergeDevices } from '../store/deviceUtils';
import { makeStyles } from '../theme';

export function DeviceListScreen({ navigation }: ScreenProps<'Devices'>) {
  const { styles, colors } = useStyles();
  const insets = useSafeAreaInsets();
  const saved = useDevices(s => s.saved);
  const discovered = useDevices(s => s.discovered);
  const discovering = useDevices(s => s.discovering);
  const discoveryError = useDevices(s => s.discoveryError);
  const { refresh } = useDiscovery();
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => mergeDevices(saved, Object.values(discovered)), [saved, discovered]);
  const sections = useMemo(
    () =>
      [
        { title: 'My TVs', data: rows.filter(r => r.saved) },
        { title: 'On this network', data: rows.filter(r => !r.saved) },
      ].filter(s => s.data.length > 0),
    [rows],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('Settings')}
          hitSlop={12}
          accessibilityRole="button">
          <Text style={styles.headerLink}>Settings</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    // mDNS answers arrive over the next second or two; keep the spinner up briefly.
    setTimeout(() => setRefreshing(false), 1500);
  };

  const open = (id: string) => navigation.navigate('TvDetail', { id });

  return (
    <View style={styles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.card}
          />
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <DeviceItem
            row={item}
            onPress={() =>
              item.pairing
                ? navigation.navigate('Remote', { id: item.id })
                : open(item.id)
            }
          />
        )}
        ItemSeparatorComponent={Separator}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.statusRow}>
            {discovering ? (
              <>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.statusText}>Searching your Wi-Fi for Google TVs…</Text>
              </>
            ) : (
              <Text style={[styles.statusText, discoveryError && { color: colors.danger }]}>
                {discoveryError ?? 'Discovery paused. Pull down to search again.'}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={<EmptyState searching={discovering} />}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button label="Add TV by IP" onPress={() => setAdding(true)} />
      </View>

      <AddTvModal
        visible={adding}
        onClose={() => setAdding(false)}
        onAdded={id => {
          setAdding(false);
          open(id);
        }}
      />
    </View>
  );
}

function DeviceItem({ row, onPress }: { row: DeviceRow; onPress: () => void }) {
  const { styles, colors } = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}, ${row.online ? 'online' : 'not seen on network'}`}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.cardPressed }]}>
      <View style={[styles.dot, { backgroundColor: row.online ? colors.ok : colors.border }]} />
      <View style={styles.itemText}>
        <Text style={styles.itemName} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={styles.itemSub}>
          {row.host}
          {row.online ? ' · online' : ' · not seen on network'}
          {row.pairing ? ' · paired' : ''}
          {row.source === 'manual' ? ' · added by IP' : ''}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function Separator() {
  const { styles, colors } = useStyles();
  return <View style={styles.separator} />;
}

function EmptyState({ searching }: { searching: boolean }) {
  const { styles, colors } = useStyles();
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{searching ? 'Looking for TVs…' : 'No TVs found'}</Text>
      <Text style={styles.emptyText}>
        Make sure the TV is on and connected to the same Wi-Fi as this phone. Guest networks and
        routers with "AP isolation" hide TVs from each other.{'\n\n'}
        If your TV doesn't show up, add it by IP.
      </Text>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16 },
  headerLink: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    minHeight: 44,
  },
  statusText: { color: colors.muted, fontSize: 14, flexShrink: 1 },
  sectionTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: colors.card,
    gap: 14,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  itemText: { flex: 1 },
  itemName: { color: colors.text, fontSize: 17, fontWeight: '600' },
  itemSub: { color: colors.muted, fontSize: 13, marginTop: 3 },
  chevron: { color: colors.muted, fontSize: 28, marginTop: -2 },
  separator: { height: 10 },
  empty: { paddingTop: 48, paddingHorizontal: 8 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.bg,
  },
}));
