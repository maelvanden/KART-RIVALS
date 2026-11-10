import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { bracketRounds, roundCount, roundLabel } from '@/features/tournaments/bracket';
import { colors, radius, spacing } from '@/theme';
import type { PilotSummary, Tournament, TournamentMatch } from '@/types/models';

const BOX_HEIGHT = 68;
const BOX_GAP = spacing.md;
const COLUMN_WIDTH = 168;

/** Tableau à élimination : une colonne par tour, défilant horizontalement. */
export function Bracket({ tournament, myId }: { tournament: Tournament; myId: string }) {
  const rounds = bracketRounds(tournament);
  const total = roundCount(tournament.size);
  const pilots = new Map(tournament.entries.map((e) => [e.pilot_id, { ...e.pilot, seed: e.seed }]));
  // Hauteur fixée par le premier tour : les tours suivants se centrent entre leurs deux cases d'origine.
  const height = (tournament.size / 2) * (BOX_HEIGHT + BOX_GAP);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      {rounds.map((matches, i) => (
        <View key={i} style={styles.column}>
          <Text variant="label" style={styles.roundTitle}>
            {roundLabel(i + 1, total, true)}
          </Text>
          <View style={[styles.matches, { height }]}>
            {matches.map((m) => (
              <MatchBox key={m.id} match={m} pilots={pilots} myId={myId} isFinal={i + 1 === total} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

type Pilot = PilotSummary & { seed: number | null };

function MatchBox({
  match,
  pilots,
  myId,
  isFinal,
}: {
  match: TournamentMatch;
  pilots: Map<string, Pilot>;
  myId: string;
  isFinal: boolean;
}) {
  const mine = match.pilot_a === myId || match.pilot_b === myId;
  const live = !match.decided_at && !!match.challenge_id;
  // Le défi n'est lisible que par ses deux pilotes.
  const canOpen = mine && !!match.challenge_id && match.outcome !== 'forfeit';

  const box = (
    <View style={[styles.box, live && styles.live, mine && live && styles.mine, isFinal && match.decided_at && styles.final]}>
      <Line pilotId={match.pilot_a} match={match} pilots={pilots} myId={myId} />
      <View style={styles.divider} />
      <Line pilotId={match.pilot_b} match={match} pilots={pilots} myId={myId} />
    </View>
  );

  if (!canOpen) return box;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ouvrir le duel"
      onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: match.challenge_id! } })}
      style={({ pressed }) => pressed && { opacity: 0.8 }}>
      {box}
    </Pressable>
  );
}

function Line({
  pilotId,
  match,
  pilots,
  myId,
}: {
  pilotId: string | null;
  match: TournamentMatch;
  pilots: Map<string, Pilot>;
  myId: string;
}) {
  const pilot = pilotId ? pilots.get(pilotId) : undefined;
  const won = !!match.decided_at && !!pilotId && match.winner_id === pilotId;
  const lost = !!match.decided_at && !!pilotId && match.winner_id !== pilotId;
  // Case vide : qualifié d'office en face au premier tour, ou vainqueur pas encore connu ensuite.
  const placeholder = match.round === 1 ? 'Exempt' : 'À venir';

  return (
    <View style={styles.line}>
      <Text style={styles.seed}>{pilot?.seed ?? ''}</Text>
      <Text
        numberOfLines={1}
        style={[
          styles.name,
          !pilot && styles.placeholder,
          won && styles.winner,
          lost && styles.loser,
          pilotId === myId && styles.me,
        ]}>
        {pilot?.username ?? placeholder}
      </Text>
      {won ? (
        match.outcome === 'race' ? (
          <Icon name={icons.check} size={14} color={colors.neon} />
        ) : (
          <Text style={styles.outcome}>{match.outcome === 'bye' ? 'EXE' : 'FOR'}</Text>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.md, paddingRight: spacing.lg },
  column: { width: COLUMN_WIDTH, gap: spacing.sm },
  roundTitle: { textAlign: 'center' },
  matches: { justifyContent: 'space-around' },
  box: {
    height: BOX_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  live: { borderColor: colors.borderStrong },
  mine: { borderColor: colors.orange, backgroundColor: colors.orangeDim },
  final: { borderColor: colors.neon },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24 },
  seed: { width: 18, fontSize: 11, color: colors.textMuted, textAlign: 'right' },
  name: { flex: 1, fontSize: 14, fontWeight: '700' },
  placeholder: { color: colors.textMuted, fontStyle: 'italic', fontWeight: '400' },
  winner: { color: colors.neon },
  loser: { color: colors.textMuted, textDecorationLine: 'line-through' },
  me: { fontWeight: '900' },
  outcome: { fontSize: 10, fontWeight: '900', color: colors.textMuted, letterSpacing: 1 },
});
