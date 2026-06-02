import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { ScreenContainer } from '../components/ScreenContainer';
import { storage } from '../lib/storage';
import { useAppStore } from '../store/app-store';
import { colors, radius, spacing } from '../theme';

const SLIDES = ['free', 'reward', 'accumulate', 'autostop'] as const;

export function OnboardingScreen() {
  const { t } = useTranslation();
  const setOnboarded = useAppStore((s) => s.setOnboarded);
  const [index, setIndex] = useState(0);

  const slide = SLIDES[index] ?? SLIDES[0];
  const isLast = index === SLIDES.length - 1;

  const onNext = (): void => {
    if (!isLast) {
      setIndex((i) => i + 1);
      return;
    }
    void (async () => {
      await storage.setOnboarded();
      setOnboarded();
    })();
  };

  return (
    <ScreenContainer>
      <View style={styles.content}>
        <Text style={styles.title}>{t(`onboarding.slides.${slide}.title`)}</Text>
        <Text style={styles.body}>{t(`onboarding.slides.${slide}.body`)}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((name, i) => (
            <View key={name} style={[styles.dot, i === index ? styles.dotActive : null]} />
          ))}
        </View>
        <Text style={styles.privacy}>{t('onboarding.privacy')}</Text>
        <Button label={isLast ? t('onboarding.start') : t('onboarding.next')} onPress={onNext} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontSize: 17,
    lineHeight: 26,
  },
  footer: {
    gap: spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 22,
  },
  privacy: {
    color: colors.textFaint,
    fontSize: 13,
    textAlign: 'center',
  },
});
