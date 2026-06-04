import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '../theme';

export type ConnectStatus = 'disconnected' | 'connecting' | 'connected';

interface Props {
  status: ConnectStatus;
  disabled?: boolean;
  onPress?: () => void;
}

function ringColor(status: ConnectStatus): string {
  if (status === 'connected') return colors.success;
  if (status === 'connecting') return colors.warning;
  return colors.primary;
}

/**
 * Big circular power button — the centrepiece of Home. A halo pulses while
 * connecting/connected, and the ring springs on press. All on the native driver.
 */
export function ConnectButton({ status, disabled = false, onPress }: Props) {
  const color = disabled ? colors.border : ringColor(status);
  const active = status === 'connecting' || status === 'connected';

  // Always breathe: subtle when idle, stronger/faster when active.
  const maxOpacity = active ? 0.5 : 0.16;
  const maxScale = active ? 1.18 : 1.08;
  const duration = active ? 1100 : 1900;

  const pulse = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [duration, pulse]);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onPressIn={() =>
        !disabled && Animated.spring(press, { toValue: 0.95, useNativeDriver: true }).start()
      }
      onPressOut={() =>
        Animated.spring(press, { toValue: 1, friction: 4, useNativeDriver: true }).start()
      }
      style={styles.wrap}
    >
      <Animated.View
        style={[
          styles.halo,
          {
            borderColor: color,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, maxOpacity] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, maxScale] }) }],
          },
        ]}
      />
      <Animated.View style={[styles.outerRing, { borderColor: color, transform: [{ scale: press }] }]}>
        <Animated.View style={[styles.inner, { backgroundColor: disabled ? colors.card : color }]}>
          <Text style={[styles.icon, { color: disabled ? colors.textFaint : colors.text }]}>⏻</Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 224,
    height: 224,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 196,
    height: 196,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  outerRing: {
    width: 196,
    height: 196,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: 144,
    height: 144,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 60,
    fontWeight: '300',
  },
});
