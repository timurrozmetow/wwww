import { Pressable, StyleSheet, Text, View } from 'react-native';
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

/** Big circular power button — the centrepiece of the Home screen. */
export function ConnectButton({ status, disabled = false, onPress }: Props) {
  const color = disabled ? colors.border : ringColor(status);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && !disabled ? styles.pressed : null]}
    >
      <View style={[styles.outerRing, { borderColor: color }]}>
        <View style={[styles.inner, { backgroundColor: disabled ? colors.card : color }]}>
          <Text style={[styles.icon, { color: disabled ? colors.textFaint : colors.text }]}>⏻</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
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
