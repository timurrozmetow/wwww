import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import LOGO from '../../assets/logo-light.png';
import { colors, radius } from '../theme';

/** How long the welcome holds before handing off to Home. */
const HOLD_MS = 1900;

/**
 * Branded entry (CLAUDE.md §6 — no language/onboarding gates). A cyan halo
 * breathes behind the NURSEYIT HJ logo, the mark fades+scales in, then the
 * localized greeting rises. All transforms run on the native driver, so it
 * stays 60 FPS even on low-end devices. Calls onFinish after a short hold.
 */
export function WelcomeScreen({ onFinish }: { onFinish?: () => void }) {
  const { t } = useTranslation();
  const logo = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logo, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(text, {
        toValue: 1,
        duration: 500,
        delay: 60,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    const timer = setTimeout(() => onFinish?.(), HOLD_MS);
    return () => {
      pulse.stop();
      clearTimeout(timer);
    };
  }, [logo, text, glow, onFinish]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.glow,
          {
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.34] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.18] }) }],
          },
        ]}
      />
      <Animated.Image
        source={LOGO}
        resizeMode="contain"
        style={[
          styles.logo,
          {
            opacity: logo,
            transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.textWrap,
          {
            opacity: text,
            transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          },
        ]}
      >
        <Text style={styles.greeting}>{t('welcome.greeting')}</Text>
        <Text style={styles.tagline}>{t('welcome.tagline')}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    // sits behind the logo; pull it up to centre the halo on the mark
    marginBottom: 90,
  },
  logo: {
    width: 248,
    height: 162,
  },
  textWrap: {
    position: 'absolute',
    bottom: 96,
    alignItems: 'center',
    gap: 6,
  },
  greeting: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
