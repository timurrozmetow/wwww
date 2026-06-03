import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LANGUAGES, type Language } from '@vpn/types';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { APP_VERSION } from '../config';
import { changeLanguage } from '../i18n';
import { storage } from '../lib/storage';
import { useAppStore } from '../store/app-store';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const NATIVE_NAMES: Record<Language, string> = {
  ru: 'Русский',
  tr: 'Türkçe',
  tk: 'Türkmençe',
};

export function SettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const lowEndMode = useAppStore((s) => s.lowEndMode);
  const setLowEndMode = useAppStore((s) => s.setLowEndMode);

  const onSelectLanguage = (lang: Language): void => {
    setLanguage(lang);
    void storage.setLanguage(lang);
    void changeLanguage(lang);
  };

  const onToggleLowEnd = (value: boolean): void => {
    setLowEndMode(value);
    void storage.setLowEndMode(value);
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={t('settings.title')} onBack={() => navigation.goBack()} />

      <Text style={styles.section}>{t('settings.language')}</Text>
      <View style={styles.langList}>
        {LANGUAGES.map((lang) => (
          <Pressable
            key={lang}
            accessibilityRole="button"
            onPress={() => onSelectLanguage(lang)}
            style={({ pressed }) => [
              styles.langRow,
              language === lang ? styles.langActive : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.langText}>{NATIVE_NAMES[lang]}</Text>
            {language === lang ? <Text style={styles.check}>✓</Text> : null}
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>{t('settings.app')}</Text>
      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text style={styles.toggleLabel}>{t('settings.lowEndMode')}</Text>
          <Text style={styles.toggleHint}>{t('settings.lowEndModeHint')}</Text>
        </View>
        <Switch
          value={lowEndMode}
          onValueChange={onToggleLowEnd}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors.text}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.privacy}>{t('settings.privacy')}</Text>
        <Text style={styles.version}>
          {t('settings.version')} {APP_VERSION}
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  langList: {
    gap: spacing.sm,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  langActive: {
    borderColor: colors.primary,
  },
  pressed: {
    backgroundColor: colors.bgElevated,
  },
  langText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  check: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  toggleText: {
    flex: 1,
    gap: spacing.xs,
  },
  toggleLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  toggleHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  footer: {
    marginTop: 'auto',
    gap: spacing.sm,
  },
  privacy: {
    color: colors.textFaint,
    fontSize: 13,
    textAlign: 'center',
  },
  version: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'center',
  },
});
