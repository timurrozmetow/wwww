import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../components/Button';
import { ConnectButton } from '../components/ConnectButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { useWatchAd } from '../features/ads/useWatchAd';
import { useAppConfig, useBalance, useBanners, useServers } from '../hooks/queries';
import { countryFlag, qualityColor } from '../lib/flag';
import { useAppStore } from '../store/app-store';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const deviceId = useAppStore((s) => s.deviceId);
  const selectedServerId = useAppStore((s) => s.selectedServerId);

  const config = useAppConfig();
  const balance = useBalance(deviceId);
  const banners = useBanners(deviceId);
  const servers = useServers();
  const { watch, state: watchState } = useWatchAd();

  const minutes = balance.data?.balanceMinutes ?? 0;
  const rewardMinutes = config.data?.rewardMinutesPerAd ?? 30;
  const busy = watchState === 'loading' || watchState === 'showing' || watchState === 'verifying';
  const banner = banners.data?.[0];

  const list = servers.data ?? [];
  const server =
    list.find((s) => s.id === selectedServerId) ?? list.find((s) => s.recommended) ?? list[0];

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const timeStr =
    h > 0 ? `${h} ${t('home.hoursShort')} ${m} ${t('home.minutes')}` : `${m} ${t('home.minutes')}`;

  return (
    <ScreenContainer>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.timeLabel}>{t('home.timeLeft')}</Text>
          {balance.isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.timeSpinner} />
          ) : (
            <Text style={styles.timeValue}>{timeStr}</Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('Settings')}
          hitSlop={12}
          style={({ pressed }) => [styles.gear, pressed ? styles.gearPressed : null]}
        >
          <Text style={styles.gearIcon}>⚙</Text>
        </Pressable>
      </View>

      {banner ? (
        <View style={styles.bannerCard}>
          <Text style={styles.bannerTitle}>{banner.title}</Text>
          <Text style={styles.bannerBody}>{banner.body}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('ServerSelect')}
        style={({ pressed }) => [styles.serverCard, pressed ? styles.serverPressed : null]}
      >
        {server ? (
          <>
            <Text style={styles.serverFlag}>{countryFlag(server.country)}</Text>
            <View style={styles.serverText}>
              <Text style={styles.serverName}>{server.name}</Text>
              <Text style={styles.serverMeta}>
                {server.city ? `${server.city} · ` : ''}
                {t('servers.ping', { ms: server.pingMs })}
              </Text>
            </View>
            <View style={[styles.dot, { backgroundColor: qualityColor(server.quality) }]} />
            <Text style={styles.chevron}>›</Text>
          </>
        ) : (
          <Text style={styles.serverEmpty}>{t('home.noServers')}</Text>
        )}
      </Pressable>

      <View style={styles.center}>
        {/* VPN connect lands in Stage B (sing-box) — disabled but центральный. */}
        <ConnectButton status="disconnected" disabled />
        <Text style={styles.status}>{t('home.statusDisconnected')}</Text>
        <Text style={styles.comingSoon}>{t('home.connectSoon')}</Text>
      </View>

      <View style={styles.bottom}>
        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.busyText}>
              {watchState === 'verifying' ? t('home.verifying') : t('home.loadingAd')}
            </Text>
          </View>
        ) : (
          <>
            <Button
              label={t('home.watchAd', { minutes: rewardMinutes })}
              onPress={() => void watch()}
              disabled={!deviceId}
            />
            {watchState === 'error' ? (
              <Text style={styles.errorText}>{t('home.adError')}</Text>
            ) : (
              <Text style={styles.rewardHint}>
                {t('home.rewardHint', { minutes: rewardMinutes })}
              </Text>
            )}
          </>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  timeLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  timeValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 2,
  },
  timeSpinner: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  gear: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearPressed: {
    borderColor: colors.primary,
  },
  gearIcon: {
    color: colors.textMuted,
    fontSize: 18,
  },
  bannerCard: {
    marginTop: spacing.md,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.md,
    gap: spacing.xs,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  bannerBody: {
    color: colors.textMuted,
    fontSize: 13,
  },
  serverCard: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  serverPressed: {
    borderColor: colors.primary,
  },
  serverFlag: {
    fontSize: 30,
  },
  serverText: {
    flex: 1,
  },
  serverName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  serverMeta: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  serverEmpty: {
    color: colors.textMuted,
    fontSize: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  chevron: {
    color: colors.textFaint,
    fontSize: 22,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  status: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.lg,
  },
  comingSoon: {
    color: colors.textFaint,
    fontSize: 13,
  },
  bottom: {
    gap: spacing.sm,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  busyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  rewardHint: {
    color: colors.textFaint,
    fontSize: 13,
    textAlign: 'center',
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
  },
});
