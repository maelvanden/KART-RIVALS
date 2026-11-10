import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chips } from '@/components/ui/chips';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { bracketRounds, currentRound, roundCount, roundLabel, thirdPlaceMatch } from '@/features/tournaments/bracket';
import { formatLapTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import type { PilotSummary, Tournament, TournamentMatch } from '@/types/models';

const BOX_HEIGHT = 68;
const BOX_GAP = spacing.md;
// Deux colonnes et leurs traits tiennent sur un écran de téléphone.
const COLUMN_WIDTH = 160;
/** Largeur des traits qui relient deux duels à celui du tour suivant. */
const LINK_WIDTH = 22;
const LINE = colors.borderStrong;

/**
 * Tableau à élimination : une colonne par tour, reliées par des traits, défilant horizontalement.
 * Les puces choisissent le tour de départ : sur un grand tableau, on saute les tours déjà joués.
 */
export function Bracket({ tournament, myId }: { tournament: Tournament; myId: string }) {
  const rounds = bracketRounds(tournament);
  const total = roundCount(tournament.size);
  const [from, setFrom] = useState(() => Math.min(currentRound(tournament), Math.max(1, total - 1)));
  const pilots = new Map(tournament.entries.map((e) => [e.pilot_id, { ...e.pilot, seed: e.seed }]));
  const visible = rounds.slice(from - 1);
  const third = thirdPlaceMatch(tournament);
  // Hauteur fixée par le premier tour affiché : chaque tour suivant se centre entre ses deux duels d'origine.
  const height = (visible[0]?.length ?? 1) * (BOX_HEIGHT + BOX_GAP);

  return (
    <View style={styles.wrapper}>
      {total > 2 ? (
        <Chips
          options={rounds.slice(0, total - 1).map((_, i) => ({ value: i + 1, label: roundLabel(i + 1, total, true) }))}
          value={from}
          onChange={setFrom}
        />
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {visible.map((matches, i) => {
          const round = from + i;
          const cell = height / matches.length;
          return (
            <View key={round} style={styles.round}>
              <View style={styles.column}>
                <Text variant="label" style={[styles.roundTitle, round === total && styles.finalTitle]}>
                  {roundLabel(round, total, true)}
                </Text>
                <View style={{ height }}>
                  {matches.map((m) => (
                    <View key={m.id} style={[styles.cell, { height: cell }]}>
                      <MatchBox
                        match={m}
                        pilots={pilots}
                        myId={myId}
                        isFinal={round === total}
                        lapTime={tournament.format === 'lap_time'}
                      />
                    </View>
                  ))}
                </View>
                {/* Petite finale : sous la finale, hors de l'arbre. */}
                {round === total && third ? (
                  <View style={styles.third}>
                    <Text variant="label" style={[styles.roundTitle, styles.thirdTitle]}>
                      Petite finale
                    </Text>
                    <MatchBox match={third} pilots={pilots} myId={myId} isFinal={false} lapTime={tournament.format === 'lap_time'} bronze />
                  </View>
                ) : null}
              </View>
              {round < total ? <Links count={matches.length / 2} cell={cell} height={height} /> : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Traits entre deux tours : une accolade par paire de duels, puis un trait vers le duel suivant. */
function Links({ count, cell, height }: { count: number; cell: number; height: number }) {
  return (
    <View style={[styles.links, { height }]}>
      {Array.from({ length: count }, (_, k) => (
        <View key={k}>
          <View style={[styles.brace, { top: (2 * k + 0.5) * cell, height: cell }]} />
          <View style={[styles.stub, { top: (2 * k + 1) * cell }]} />
        </View>
      ))}
    </View>
  );
}

type Pilot = PilotSummary & { seed: number | null };

function MatchBox({
  match,
  pilots,
  myId,
  isFinal,
  lapTime,
  bronze,
}: {
  match: TournamentMatch;
  pilots: Map<string, Pilot>;
  myId: string;
  isFinal: boolean;
  lapTime: boolean;
  /** Petite finale : liseré bronze, et « À venir » tant que les demi-finales ne sont pas jouées. */
  bronze?: boolean;
}) {
  const mine = match.pilot_a === myId || match.pilot_b === myId;
  const live = !match.decided_at && !!match.challenge_id;
  // Le défi n'est lisible que par ses deux pilotes.
  const canOpen = mine && !!match.challenge_id && match.outcome !== 'forfeit';
  const score = (side: 'a' | 'b') => {
    if (match.outcome !== 'race') return null;
    if (lapTime) {
      const ms = side === 'a' ? match.a_best_lap_ms : match.b_best_lap_ms;
      return ms ? formatLapTime(ms) : null;
    }
    const position = side === 'a' ? match.a_position : match.b_position;
    return position ? `P${position}` : null;
  };

  const box = (
    <View style={[styles.box, live && styles.live, bronze && styles.bronze, mine && live && styles.mine, isFinal && styles.final]}>
      {live ? <View style={[styles.liveDot, mine && { backgroundColor: colors.orange }]} /> : null}
      <Line pilotId={match.pilot_a} match={match} pilots={pilots} myId={myId} score={score('a')} pending={bronze} />
      <View style={styles.divider} />
      <Line pilotId={match.pilot_b} match={match} pilots={pilots} myId={myId} score={score('b')} pending={bronze} />
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
  score,
  pending,
}: {
  pilotId: string | null;
  match: TournamentMatch;
  pilots: Map<string, Pilot>;
  myId: string;
  score: string | null;
  /** Case alimentée par un tour précédent même au premier tour affiché (petite finale). */
  pending?: boolean;
}) {
  const pilot = pilotId ? pilots.get(pilotId) : undefined;
  const won = !!match.decided_at && !!pilotId && match.winner_id === pilotId;
  const lost = !!match.decided_at && !!pilotId && match.winner_id !== pilotId;
  // Case vide : qualifié d'office en face au premier tour, ou vainqueur pas encore connu ensuite.
  const placeholder = match.decided_at ? 'Personne' : match.round === 1 && !pending ? 'Exempt' : 'À venir';

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
      {score && pilot ? (
        <Text style={[styles.score, won && styles.winner]}>{score}</Text>
      ) : won ? (
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
  wrapper: { gap: spacing.md },
  scroll: { paddingRight: spacing.lg },
  round: { flexDirection: 'row' },
  column: { width: COLUMN_WIDTH, gap: spacing.sm },
  roundTitle: { textAlign: 'center' },
  finalTitle: { color: colors.neon },
  cell: { justifyContent: 'center' },
  // Décalé de la hauteur du titre de colonne (libellé + espace) pour s'aligner sur les cases.
  links: { width: LINK_WIDTH, marginTop: 24 },
  brace: {
    position: 'absolute',
    left: 0,
    width: LINK_WIDTH / 2,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: LINE,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  stub: { position: 'absolute', left: LINK_WIDTH / 2, width: LINK_WIDTH / 2, height: 1, backgroundColor: LINE },
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
  final: { borderColor: colors.neon, backgroundColor: colors.selected },
  bronze: { borderColor: '#CD7F32' },
  third: { gap: spacing.sm, marginTop: spacing.md },
  thirdTitle: { color: '#CD7F32' },
  liveDot: { position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.neon },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24 },
  seed: { width: 18, fontSize: 11, color: colors.textMuted, textAlign: 'right' },
  name: { flex: 1, fontSize: 14, fontWeight: '700' },
  placeholder: { color: colors.textMuted, fontStyle: 'italic', fontWeight: '400' },
  winner: { color: colors.neon },
  loser: { color: colors.textMuted, textDecorationLine: 'line-through' },
  me: { fontWeight: '900' },
  score: { fontSize: 12, fontWeight: '800', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  outcome: { fontSize: 10, fontWeight: '900', color: colors.textMuted, letterSpacing: 1 },
});
