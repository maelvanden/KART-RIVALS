import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, radius, spacing } from '@/theme';

type Props<T extends string> = { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void };

export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.row}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.item, active && styles.active]}>
            <Text style={[styles.text, active && styles.activeText]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  item: { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radius.pill, alignItems: 'center' },
  active: { backgroundColor: colors.neon },
  text: { fontWeight: '800', fontSize: 13, color: colors.textMuted },
  activeText: { color: colors.onNeon },
});
