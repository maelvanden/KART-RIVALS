import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { colors, spacing } from '@/theme';
import type { EloPoint } from '@/types/models';

const HEIGHT = 90;

/** Mini-graphique en barres de l'évolution ELO (un trait par match). */
export function EloChart({ points }: { points: EloPoint[] }) {
  if (points.length === 0) return null;
  const values = points.map((p) => p.elo_after);
  const min = Math.min(...values) - 20;
  const max = Math.max(...values) + 20;
  const last = points[points.length - 1];

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="label">Progression ELO</Text>
        <Text style={[styles.delta, { color: last.delta >= 0 ? colors.neon : colors.danger }]}>
          {last.delta >= 0 ? '+' : ''}
          {last.delta} dernier match
        </Text>
      </View>
      <View style={styles.chart}>
        {points.map((p, i) => (
          <View
            key={`${p.created_at}-${i}`}
            style={[
              styles.bar,
              {
                height: ((p.elo_after - min) / (max - min)) * HEIGHT,
                backgroundColor: p.delta >= 0 ? colors.neon : colors.danger,
                opacity: 0.35 + (0.65 * (i + 1)) / points.length,
              },
            ]}
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  delta: { fontSize: 13, fontWeight: '800' },
  chart: { height: HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  bar: { flex: 1, borderRadius: 3, minHeight: 4 },
});
