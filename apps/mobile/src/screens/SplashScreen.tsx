import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function SplashScreen() {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.center, { opacity }]}>
        <Text style={styles.logo}>VPN</Text>
        <Text style={styles.tagline}>Free · Fast · Secure</Text>
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
  center: {
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 4,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 14,
    letterSpacing: 1,
  },
});
