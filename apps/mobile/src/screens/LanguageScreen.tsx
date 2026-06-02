import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LANGUAGES, type Language } from '@vpn/types';
import { ScreenContainer } from '../components/ScreenContainer';
import { changeLanguage } from '../i18n';
import { storage } from '../lib/storage';
import { useAppStore } from '../store/app-store';
import { colors, radius, spacing } from '../theme';

const NATIVE_NAMES: Record<Language, string> = {
  ru: 'Русский',
  tr: 'Türkçe',
  tk: 'Türkmençe',
};

export function LanguageScreen() {
  const { t } = useTranslation();
  const setLanguage = useAppStore((s) => s.setLanguage);

  const onSelect = async (language: Language): Promise<void> => {
    await storage.setLanguage(language);
    await changeLanguage(language);
    setLanguage(language);
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>{t('language.title')}</Text>
        <Text style={styles.subtitle}>{t('language.subtitle')}</Text>
      </View>
      <View style={styles.list}>
        {LANGUAGES.map((language) => (
          <Pressable
            key={language}
            accessibilityRole="button"
            style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}
            onPress={() => void onSelect(language)}
          >
            <Text style={styles.itemText}>{NATIVE_NAMES[language]}</Text>
          </Pressable>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
  },
  list: {
    gap: spacing.md,
  },
  item: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  itemPressed: {
    borderColor: colors.primary,
  },
  itemText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
});
