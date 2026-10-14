import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { formatLapTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { Challenge, Match } from '@/types/models';

export function ResultSummary({ challenge, match }: { challenge: Challenge; match: Match }) {
  const isLap = challenge.format === 'lap_time';
  const rows = [
    {
      pilot: challenge.challenger,
      value: isLap ? match.challenger_best_lap_ms : match.challenger_position,
    },
    {
      pilot: challenge.opponent,
      value: isLap ? match.opponent_best_lap_ms : match.opponent_position,
    },
  ];
  const submitter = match.submitted_by === challenge.challenger_id ? challenge.challenger : challenge.opponent;

  return (
    <Card style={styles.card}>
      <Text variant="label">Résultat déclaré par {submitter.username}</Text>
      {rows.map(({ pilot, value }) => {
        const won = match.winner_id === pilot.id;
        return (
          <View key={pilot.id} style={[styles.row, won && styles.winner]}>
            <Text variant="heading" style={styles.name}>
              {pilot.username}
            </Text>
            <Text style={[styles.value, { color: won ? colors.neon : colors.text }]}>
              {value === null ? '—' : isLap ? formatLapTime(value) : `P${value}`}
            </Text>
          </View>
        );
      })}
      <Text variant="caption">{match.winner_id === null ? 'Égalité' : 'Le vainqueur est surligné en vert.'}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
  },
  winner: { borderWidth: 1, borderColor: colors.neon },
  name: { flexShrink: 1 },
  value: { fontSize: 22, fontWeight: '900', fontStyle: 'italic', fontVariant: ['tabular-nums'] },
});
