import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { TEAM_COLORS } from '@/features/social/colors';
import { colors, radius, spacing } from '@/theme';

type Props = { value: string; onChange: (color: string) => void; disabled?: boolean };

/** Nuancier des couleurs d'écurie. */
export function TeamColorPicker({ value, onChange, disabled }: Props) {
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {TEAM_COLORS.map((c) => {
        const selected = c.value === value;
        return (
          <Pressable
            key={c.value}
            accessibilityRole="radio"
            accessibilityLabel={c.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(c.value)}
            style={({ pressed }) => [styles.swatch, selected && styles.selected, pressed && styles.pressed]}>
            <View style={[styles.color, { backgroundColor: c.value }]}>
              {selected ? <Icon name={icons.check} size={18} color={colors.background} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { padding: 3, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: colors.text },
  color: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', transform: [{ skewX: '-8deg' }] },
  pressed: { opacity: 0.8 },
});
