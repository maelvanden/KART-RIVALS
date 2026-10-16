import { StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors, radius, spacing } from '@/theme';

/** Solde de points du pilote. */
export function PointsChip({ points, large = false }: { points: number; large?: boolean }) {
  return (
    <View style={[styles.chip, large && styles.large]} accessibilityLabel={`${points} points`}>
      <Icon name={icons.coin} size={large ? 22 : 16} color={colors.neon} />
      <Text style={[styles.value, large && styles.valueLarge]}>{points.toLocaleString('fr-FR')}</Text>
      <Text style={[styles.unit, large && styles.unitLarge]}>pts</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.neonDim,
    borderWidth: 1,
    borderColor: 'rgba(222, 255, 0, 0.35)',
  },
  large: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  value: { color: colors.neon, fontWeight: '900', fontSize: 15, fontVariant: ['tabular-nums'] },
  valueLarge: { fontSize: 24 },
  unit: { color: colors.neon, fontWeight: '700', fontSize: 11 },
  unitLarge: { fontSize: 14 },
});
