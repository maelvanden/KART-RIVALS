import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, fonts, radius, spacing } from '@/theme';

export type StatTile = { label: string; value: string | number; color?: string };

/** Grille de grosses tuiles de chiffres (2 par ligne). */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <View style={styles.grid}>
      {tiles.map((t) => (
        <View key={t.label} style={styles.tile}>
          <View style={[styles.marker, { backgroundColor: t.color ?? colors.neon }]} />
          <Text style={[styles.value, t.color ? { color: t.color } : null]}>{t.value}</Text>
          <Text variant="label">{t.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: 2,
    overflow: 'hidden',
  },
  marker: { position: 'absolute', left: 0, top: spacing.lg, width: 3, height: 28 },
  value: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, color: colors.text, fontVariant: ['tabular-nums'] },
});
