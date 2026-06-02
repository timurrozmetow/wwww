import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { ScreenContainer } from '../components/ScreenContainer';
import { useWatchAd } from '../features/ads/useWatchAd';
import { useAppConfig, useBalance, useBanners } from '../hooks/queries';
import { storage } from '../lib/storage';
import { useAppStore } from '../store/app-store';
import { colors, radius, spacing } from '../theme';

export function HomeScreen() {
  const { t } = useTranslation();
  const deviceId = useAppStore((s) => s.deviceId);
  const lowEndMode = useAppStore((s) => s.lowEndMode);
  const setLowEndMode = useAppStore((s) => s.setLowEndMode);
  const config = useAppConfig();
  const balance = useBalance(deviceId);
  const banners = useBanners(deviceId);
  const { watch, state: watchState } = useWatchAd();

  const toggleLowEnd = (value: boolean) => {
    setLowEndMode(value);
    void storage.setLowEndMode(value);
  };

  const minutes = balance.data?.balanceMinutes ?? 0;
  const rewardMinutes = config.data?.rewardMinutesPerAd ?? 30;
  const busy = watchState === 'loading' || watchState === 'showing' || watchState === 'verifying';
  // Highest-priority active banner (server already sorts by priority desc).
  const banner = banners.data?.[0];

  return (
    <ScreenContainer>
      <Text style={styles.greeting}>{t('home.greeting')}</Text>

      {banner ? (
        <View style={styles.bannerCard}>
          <Text style={styles.bannerTitle}>{banner.title}</Text>
          <Text style={styles.bannerBody}>{banner.body}</Text>
        </View>
      ) : null}

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{t('home.balance')}</Text>
        {balance.isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.spinner} />
        ) : (
          <Text style={styles.balanceValue}>
            {minutes} <Text style={styles.balanceUnit}>{t('home.minutes')}</Text>
          </Text>
        )}
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{t('home.statusDisconnected')}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          label={t('home.watchAd', { minutes: rewardMinutes })}
          onPress={() => void watch()}
          disabled={!deviceId || busy}
        />
        {/* VPN connect lands in Stage 3. */}
        <Button label={t('home.connect')} variant="secondary" disabled />
        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.statusText}>
              {watchState === 'verifying' ? t('home.verifying') : t('home.loadingAd')}
            </Text>
          </View>
        ) : watchState === 'error' ? (
          <Text style={styles.errorText}>{t('home.adError')}</Text>
        ) : (
          <Text style={styles.hint}>{t('home.comingSoon')}</Text>
        )}
      </View>

      <View style={styles.settingsRow}>
        <View style={styles.settingsText}>
          <Text style={styles.settingsLabel}>{t('settings.lowEndMode')}</Text>
          <Text style={styles.settingsHint}>{t('settings.lowEndModeHint')}</Text>
        </View>
        <Switch
          value={lowEndMode}
          onValueChange={toggleLowEnd}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors.text}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  greeting: {
    color: colors.textMuted,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  bannerCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  bannerBody: {
    color: colors.textMuted,
    fontSize: 13,
  },
  balanceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  balanceLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  spinner: {
    alignSelf: 'flex-start',
    marginVertical: spacing.sm,
  },
  balanceValue: {
    color: colors.text,
    fontSize: 44,
    fontWeight: '800',
  },
  balanceUnit: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.textFaint,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 13,
    textAlign: 'center',
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsText: {
    flex: 1,
    gap: spacing.xs,
  },
  settingsLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  settingsHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
