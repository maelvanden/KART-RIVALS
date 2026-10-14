import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, radius, spacing } from '@/theme';

type Props<T> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  isEqual?: (a: T, b: T) => boolean;
};

/** Rangée de choix défilable horizontalement (dates, heures, circuits…). */
export function Chips<T>({ options, value, onChange, isEqual = Object.is }: Props<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((o) => {
        const active = isEqual(o.value, value);
        return (
          <Pressable
            key={o.label}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, active && styles.active]}>
            <Text style={[styles.text, active && styles.activeText]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  active: { backgroundColor: colors.neonDim, borderColor: colors.neon },
  text: { fontWeight: '700', fontSize: 14, color: colors.textMuted },
  activeText: { color: colors.neon },
});
