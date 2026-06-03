import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

export function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        hitSlop={12}
        style={({ pressed }) => [styles.back, pressed ? styles.pressed : null]}
      >
        <Text style={styles.chevron}>‹</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    borderColor: colors.primary,
  },
  chevron: {
    color: colors.text,
    fontSize: 26,
    marginTop: -4,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
});
