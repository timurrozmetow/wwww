import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { VpnServerView } from '@vpn/types';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { useRecheckServers, useServers } from '../hooks/queries';
import { countryFlag, pingColor, qualityColor, signalBars } from '../lib/flag';
import { storage } from '../lib/storage';
import { useAppStore } from '../store/app-store';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ServerSelect'>;

export function ServerSelectScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const servers = useServers();
  const recheck = useRecheckServers();
  const selectedServerId = useAppStore((s) => s.selectedServerId);
  const setSelectedServerId = useAppStore((s) => s.setSelectedServerId);

  const choose = (id: string | null): void => {
    setSelectedServerId(id);
    void storage.setSelectedServerId(id);
    navigation.goBack();
  };

  const list = servers.data ?? [];
  const checking = recheck.isPending;

  return (
    <ScreenContainer>
      <ScreenHeader
        title={t('servers.title')}
        onBack={() => navigation.goBack()}
        right={
          <Pressable
            accessibilityRole="button"
            onPress={() => recheck.mutate()}
            disabled={checking}
            hitSlop={12}
            style={({ pressed }) => [styles.action, pressed ? styles.actionPressed : null]}
          >
            {checking ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={styles.actionIcon}>⟳</Text>
            )}
          </Pressable>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={checking}
            onRefresh={() => recheck.mutate()}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.card}
            title={t('servers.refresh')}
            titleColor={colors.textMuted}
          />
        }
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => choose(null)}
          style={({ pressed }) => [
            styles.row,
            selectedServerId === null ? styles.rowActive : null,
            pressed ? styles.rowPressed : null,
          ]}
        >
          <Text style={styles.flag}>⚡</Text>
          <View style={styles.text}>
            <Text style={styles.name}>{t('servers.auto')}</Text>
            <Text style={styles.meta}>{t('servers.autoHint')}</Text>
          </View>
          {selectedServerId === null ? <Text style={styles.check}>✓</Text> : null}
        </Pressable>

        {list.map((s: VpnServerView) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => choose(s.id)}
            style={({ pressed }) => [
              styles.row,
              selectedServerId === s.id ? styles.rowActive : null,
              pressed ? styles.rowPressed : null,
            ]}
          >
            <Text style={styles.flag}>{countryFlag(s.country)}</Text>
            <View style={styles.text}>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={styles.meta}>
                {s.city ? `${s.city} · ` : ''}
                <Text style={{ color: pingColor(s.pingMs) }}>{t('servers.ping', { ms: s.pingMs })}</Text>
                {s.recommended ? ` · ${t('servers.recommended')}` : ''}
              </Text>
            </View>
            <Text style={[styles.signal, { color: pingColor(s.pingMs) }]}>{signalBars(s.pingMs)}</Text>
            <View style={[styles.dot, { backgroundColor: qualityColor(s.quality) }]} />
            {selectedServerId === s.id ? <Text style={styles.check}>✓</Text> : null}
          </Pressable>
        ))}

        {list.length === 0 ? <Text style={styles.empty}>{t('servers.empty')}</Text> : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  action: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressed: {
    borderColor: colors.primary,
  },
  actionIcon: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowActive: {
    borderColor: colors.primary,
  },
  rowPressed: {
    backgroundColor: colors.bgElevated,
  },
  flag: {
    fontSize: 26,
  },
  text: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  signal: {
    fontSize: 13,
    letterSpacing: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  check: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
