import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { colors, radius, spacing } from '@/theme';
import type { HeadToHead } from '@/types/models';

const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const outcomeLabel = { win: 'victoire', loss: 'défaite', draw: 'match nul' } as const;

export function HeadToHeadCard({ h2h, rival }: { h2h: HeadToHead; rival: string }) {
  if (h2h.matches === 0) {
    return (
      <Card style={styles.card}>
        <Text variant="label">Face-à-face</Text>
        <Text variant="heading">Jamais affrontés</Text>
        <Text variant="caption">Lance le premier défi pour ouvrir le compteur contre {rival}.</Text>
      </Card>
    );
  }

  const leading = h2h.my_wins > h2h.their_wins ? 'me' : h2h.my_wins < h2h.their_wins ? 'them' : 'tie';
  const decided = h2h.my_wins + h2h.their_wins;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="label">Face-à-face</Text>
        <Text variant="caption">
          {h2h.matches} match{h2h.matches > 1 ? 's' : ''}
          {h2h.draws ? ` · ${h2h.draws} nul${h2h.draws > 1 ? 's' : ''}` : ''}
        </Text>
      </View>

      <View style={styles.score}>
        <View style={styles.side}>
          <Text style={[styles.number, { color: colors.neon }]}>{h2h.my_wins}</Text>
          <Text variant="label">Toi</Text>
        </View>
        <Text style={styles.dash}>–</Text>
        <View style={styles.side}>
          <Text style={[styles.number, { color: colors.orange }]}>{h2h.their_wins}</Text>
          <Text variant="label" numberOfLines={1}>
            {rival}
          </Text>
        </View>
      </View>

      <View style={styles.bar} accessibilityLabel={`${h2h.my_wins} victoires contre ${h2h.their_wins}`}>
        {decided === 0 ? <View style={[styles.barEmpty, { flex: 1 }]} /> : null}
        {h2h.my_wins > 0 ? <View style={[styles.barMine, { flex: h2h.my_wins }]} /> : null}
        {h2h.their_wins > 0 ? <View style={[styles.barTheirs, { flex: h2h.their_wins }]} /> : null}
      </View>

      <Text style={styles.verdict}>
        {leading === 'me' ? 'Tu mènes le duel' : leading === 'them' ? `${rival} mène le duel` : 'Égalité parfaite'}
        {' · '}
        <Text style={{ color: h2h.elo_net >= 0 ? colors.neon : colors.danger, fontWeight: '800' }}>
          {h2h.elo_net >= 0 ? '+' : ''}
          {h2h.elo_net} ELO
        </Text>
      </Text>

      {h2h.last_outcome && h2h.last_played_at ? (
        <Text variant="caption">
          Dernier duel : {outcomeLabel[h2h.last_outcome]} · {h2h.last_track} ·{' '}
          {dayFormat.format(new Date(h2h.last_played_at))}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  score: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  side: { alignItems: 'center', gap: 2, minWidth: 90, maxWidth: 140 },
  number: { fontSize: 52, lineHeight: 56, fontWeight: '900', fontStyle: 'italic', fontVariant: ['tabular-nums'] },
  dash: { fontSize: 32, fontWeight: '900', color: colors.textMuted },
  bar: { flexDirection: 'row', height: 8, borderRadius: radius.pill, overflow: 'hidden', gap: 2 },
  barMine: { backgroundColor: colors.neon },
  barTheirs: { backgroundColor: colors.orange },
  barEmpty: { backgroundColor: colors.surfaceAlt },
  verdict: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
