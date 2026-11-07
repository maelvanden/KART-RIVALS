import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Chips } from '@/components/ui/chips';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { LapChart } from '@/features/lap-progress/components/lap-chart';
import { groupByTrack, headline, subline } from '@/features/lap-progress/progress';
import { formatLapTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { LapProgressPoint } from '@/types/models';

type Props = {
  points: LapProgressPoint[];
  /** Sur la fiche d'un circuit : uniquement celui-ci, sans sélecteur. */
  trackId?: string;
};

/** « −1,2 s en 2 mois sur Inwall » : courbe des chronos du pilote connecté, circuit par circuit. */
export function LapProgressCard({ points, trackId }: Props) {
  const tracks = groupByTrack(trackId ? points.filter((p) => p.track_id === trackId) : points);
  const [selected, setSelected] = useState<string | null>(null);
  const current = tracks.find((t) => t.trackId === selected) ?? tracks[0];
  if (!current) return null;

  const improved = current.gainMs > 0;
  const title = headline(current);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="label">{trackId ? 'Ta progression ici' : 'Progression par circuit'}</Text>
        <Icon name={icons.timer} size={16} color={colors.textMuted} />
      </View>
      {!trackId && tracks.length > 1 ? (
        <Chips
          options={tracks.map((t) => ({ value: t.trackId, label: t.trackName }))}
          value={current.trackId}
          onChange={setSelected}
        />
      ) : null}
      <View style={styles.summary}>
        <Text style={[styles.headline, improved && { color: colors.neon }]}>{title}</Text>
        <Text variant="caption">{subline(current)}</Text>
      </View>
      {current.laps.length > 1 ? (
        <LapChart
          laps={current.laps}
          bestIndex={current.laps.indexOf(current.best)}
          accessibilityLabel={`${title}. Record : ${formatLapTime(current.best.lap_ms)}.`}
        />
      ) : null}
      {current.laps.length > 1 ? (
        <View style={styles.stats}>
          <Stat label="Premier" value={formatLapTime(current.first.lap_ms)} />
          <Stat label="Record" value={formatLapTime(current.best.lap_ms)} highlight />
          <Stat label="Dernier" value={formatLapTime(current.last.lap_ms)} />
        </View>
      ) : null}
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text variant="caption">{label}</Text>
      <Text style={[styles.statValue, highlight && { color: colors.neon }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summary: { gap: 2 },
  headline: { fontSize: 18, fontWeight: '800' },
  stats: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { gap: 2 },
  statValue: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
