import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { colors, radius, spacing } from '@/theme';
import type { PilotMatch } from '@/types/models';

const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

const outcomeMeta = {
  win: { label: 'V', color: colors.neon, background: colors.neonDim },
  loss: { label: 'D', color: colors.danger, background: 'rgba(255, 59, 92, 0.14)' },
  draw: { label: 'N', color: colors.textMuted, background: colors.surfaceAlt },
} as const;

export function MatchHistory({ matches, title = 'Derniers matchs' }: { matches: PilotMatch[]; title?: string }) {
  return (
    <Card style={styles.card}>
      <Text variant="label">{title}</Text>
      {matches.length === 0 ? (
        <Text variant="caption">Aucun match validé pour l’instant.</Text>
      ) : (
        matches.map((m) => {
          const meta = outcomeMeta[m.outcome];
          return (
            <View key={m.match_id} style={styles.row}>
              <View style={[styles.outcome, { backgroundColor: meta.background }]}>
                <Text style={[styles.outcomeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <View style={styles.body}>
                <Link href={{ pathname: '/pilot/[id]', params: { id: m.opponent_id } }} asChild>
                  <Pressable hitSlop={6}>
                    <Text style={styles.opponent} numberOfLines={1}>
                      vs {m.opponent_username}
                    </Text>
                  </Pressable>
                </Link>
                <Text variant="caption" numberOfLines={1}>
                  {m.track_name} · {dayFormat.format(new Date(m.confirmed_at))}
                  {m.format === 'lap_time' ? ' · meilleur tour' : ''}
                </Text>
              </View>
              {m.elo_delta !== null ? (
                <Text style={[styles.delta, { color: m.elo_delta >= 0 ? colors.neon : colors.danger }]}>
                  {m.elo_delta >= 0 ? '+' : ''}
                  {m.elo_delta}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  outcome: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  outcomeText: { fontWeight: '900', fontStyle: 'italic', fontSize: 15 },
  body: { flex: 1, gap: 2 },
  opponent: { fontWeight: '700', fontSize: 15 },
  delta: { fontWeight: '900', fontSize: 15, fontVariant: ['tabular-nums'] },
});
