import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import {
  useAwardWalkover,
  useCancelTournament,
  useForfeitTournamentMatch,
  useJoinTournament,
  useLeaveTournament,
  useStartTournament,
  useTournament,
} from '@/features/tournaments/api';
import {
  eliminatedIn,
  isStillIn,
  minPilotsToStart,
  myCurrentMatch,
  roundCount,
  matchLabel,
  statusLabel,
} from '@/features/tournaments/bracket';
import { Bracket } from '@/features/tournaments/components/bracket';
import { confirmAction } from '@/lib/confirm';
import { dateTimeFormat } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { Tournament, TournamentMatch } from '@/types/models';

export default function TournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const tournament = useTournament(id);
  const join = useJoinTournament();
  const leave = useLeaveTournament();
  const start = useStartTournament();
  const cancel = useCancelTournament();
  const forfeit = useForfeitTournamentMatch();
  const walkover = useAwardWalkover();

  const t = tournament.data;
  if (tournament.isPending) return <Screen safeTop={false}><Loading /></Screen>;
  if (tournament.error) return <Screen safeTop={false}><ErrorState error={tournament.error} /></Screen>;
  if (!t || !userId) return <Screen safeTop={false}><EmptyState title="Tournoi introuvable" /></Screen>;

  const rounds = roundCount(t.size);
  const isOrganizer = t.organizer_id === userId;
  const registered = t.entries.some((e) => e.pilot_id === userId);
  const full = t.entries.length >= t.size;
  const canStart = t.entries.length >= minPilotsToStart(t.size);
  const current = myCurrentMatch(t, userId);
  const organizer = t.entries.find((e) => e.pilot_id === t.organizer_id)?.pilot;
  const champion = t.entries.find((e) => e.pilot_id === t.champion_id)?.pilot;
  const name = (pilotId: string | null) => t.entries.find((e) => e.pilot_id === pilotId)?.pilot.username ?? 'Pilote';
  const actionError = [join, leave, start, cancel, forfeit, walkover].find((m) => m.error)?.error as Error | undefined;
  // Duels que l'organisateur peut arbitrer (il ne les joue pas).
  const refereeable =
    isOrganizer && t.status === 'running'
      ? t.matches.filter((m) => !m.decided_at && m.challenge_id && m.pilot_a !== userId && m.pilot_b !== userId)
      : [];

  return (
    <Screen safeTop={false} refreshing={tournament.isRefetching} onRefresh={tournament.refetch}>
      <Stack.Screen options={{ title: t.name }} />

      <Card style={styles.header}>
        <Text variant="label" style={{ color: t.status === 'registration' ? colors.neon : colors.orange }}>
          {statusLabel[t.status]}
        </Text>
        <Text variant="title">{t.name}</Text>
        <View style={styles.meta}>
          <Meta icon={icons.pin} text={`${t.track.name} · ${t.track.city}`} />
          <Meta icon={icons.group} text={`${t.entries.length}/${t.size} pilotes`} />
          {t.starts_at ? <Meta icon={icons.clock} text={dateTimeFormat.format(new Date(t.starts_at))} /> : null}
          <Meta icon={icons.bolt} text={t.format === 'lap_time' ? 'Duels au meilleur tour' : 'Duels à la position'} />
          {organizer ? <Meta icon={icons.helmet} text={`Organisé par ${isOrganizer ? 'toi' : organizer.username}`} /> : null}
        </View>
        {t.message ? <Text style={styles.message}>« {t.message} »</Text> : null}
      </Card>

      {t.status === 'completed' && champion ? (
        <Card style={styles.championCard}>
          <Icon name={icons.trophy} size={40} color="#FFC83D" />
          <Text variant="label">Vainqueur</Text>
          <Text variant="title" style={styles.championName}>
            {champion.username}
          </Text>
          {t.runner_up_id ? <Text variant="caption">Finaliste : {name(t.runner_up_id)}</Text> : null}
        </Card>
      ) : null}

      {t.status === 'running' ? <MyRun tournament={t} myId={userId} current={current} /> : null}

      {current ? (
        <View style={styles.actions}>
          <Button
            title="Abandonner"
            variant="secondary"
            style={styles.action}
            loading={forfeit.isPending}
            onPress={() =>
              confirmAction(
                'Abandonner ce duel ?',
                `${name(current.pilot_a === userId ? current.pilot_b : current.pilot_a)} sera qualifié pour le tour suivant.`,
                'Abandonner',
                () => forfeit.mutate(current.id),
              )
            }
          />
          <Button
            title="Mon duel"
            style={styles.action}
            onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: current.challenge_id! } })}
          />
        </View>
      ) : null}

      {t.status === 'registration' ? (
        <>
          {!registered && !full ? (
            <Button title="M’inscrire" loading={join.isPending} onPress={() => join.mutate(t.id)} />
          ) : null}
          {registered && !isOrganizer ? (
            <Button title="Me désinscrire" variant="secondary" loading={leave.isPending} onPress={() => leave.mutate(t.id)} />
          ) : null}
          {isOrganizer ? (
            <Button
              title={canStart ? `Lancer le tableau · ${t.entries.length} pilotes` : `Lancer dès ${minPilotsToStart(t.size)} pilotes`}
              disabled={!canStart}
              loading={start.isPending}
              onPress={() =>
                confirmAction(
                  'Lancer le tableau ?',
                  `Les inscriptions seront closes et le tirage fait par ELO.${
                    full ? '' : ` ${t.size - t.entries.length} place(s) vide(s) : les meilleurs ELO seront qualifiés d’office.`
                  }`,
                  'Lancer',
                  () => start.mutate(t.id),
                )
              }
            />
          ) : null}
          <Text variant="caption">
            Le tirage se fait tout seul quand les {t.size} places sont prises. Têtes de série par ELO : les deux meilleurs
            ne peuvent se croiser qu’en finale.
          </Text>
        </>
      ) : null}

      {actionError ? <Text style={{ color: colors.danger }}>{actionError.message}</Text> : null}

      {t.matches.length > 0 ? (
        <>
          <Text variant="label">Tableau</Text>
          <Bracket tournament={t} myId={userId} />
        </>
      ) : null}

      {refereeable.length > 0 ? (
        <>
          <Text variant="label">Arbitrage</Text>
          <Text variant="caption">
            Un pilote ne se présente pas ? Prononce un forfait : son adversaire passe au tour suivant (sans ELO).
          </Text>
          {refereeable.map((m) => (
            <Walkover
              key={m.id}
              match={m}
              rounds={rounds}
              name={name}
              loading={walkover.isPending}
              onAward={(winnerId) =>
                confirmAction(
                  `Qualifier ${name(winnerId)} ?`,
                  `${name(winnerId === m.pilot_a ? m.pilot_b : m.pilot_a)} sera déclaré forfait.`,
                  'Confirmer',
                  () => walkover.mutate({ matchId: m.id, winnerId }),
                )
              }
            />
          ))}
        </>
      ) : null}

      <Text variant="label">{t.status === 'registration' ? 'Inscrits' : 'Têtes de série'}</Text>
      <View style={styles.list}>
        {t.entries.map((e) => (
          <PilotRow
            key={e.pilot_id}
            pilotId={e.pilot_id}
            username={e.pilot.username}
            avatarUrl={e.pilot.avatar_url}
            rank={e.pilot.rank}
            elo={e.pilot.elo}
            highlighted={e.pilot_id === userId}
            subtitle={`${e.pilot.elo} ELO${e.pilot_id === t.organizer_id ? ' · organisateur' : ''}`}
            leading={e.seed ? <Text style={styles.seed}>{e.seed}</Text> : undefined}
          />
        ))}
      </View>

      {isOrganizer && t.status === 'registration' ? (
        <Button
          title="Annuler le tournoi"
          variant="quiet"
          loading={cancel.isPending}
          onPress={() =>
            confirmAction('Annuler le tournoi ?', 'Les inscrits seront prévenus.', 'Annuler le tournoi', () =>
              cancel.mutate(t.id),
            )
          }
        />
      ) : null}
    </Screen>
  );
}

/** Situation du pilote connecté dans un tableau en cours. */
function MyRun({ tournament: t, myId, current }: { tournament: Tournament; myId: string; current: TournamentMatch | null }) {
  if (!t.entries.some((e) => e.pilot_id === myId)) return null;
  const rounds = roundCount(t.size);
  let text: string;
  let tone: string = colors.textMuted;
  if (current) {
    text = `${matchLabel(current.round, rounds)} : tu affrontes ${
      t.entries.find((e) => e.pilot_id === (current.pilot_a === myId ? current.pilot_b : current.pilot_a))?.pilot.username ?? 'ton adversaire'
    }. Courez, saisissez le résultat et validez-le comme un défi.`;
    tone = colors.orange;
  } else if (isStillIn(t, myId)) {
    text = 'Qualifié ! Ton prochain adversaire sera connu à la fin du duel en cours.';
    tone = colors.neon;
  } else {
    const out = eliminatedIn(t, myId);
    text = out ? `Éliminé en ${matchLabel(out.round, rounds).toLowerCase()}. Suis la suite du tableau !` : '';
  }
  if (!text) return null;
  return (
    <Card style={[styles.notice, { borderColor: tone === colors.textMuted ? colors.border : tone }]}>
      <Text style={{ color: tone }}>{text}</Text>
    </Card>
  );
}

function Walkover({
  match,
  rounds,
  name,
  loading,
  onAward,
}: {
  match: TournamentMatch;
  rounds: number;
  name: (id: string | null) => string;
  loading: boolean;
  onAward: (winnerId: string) => void;
}) {
  return (
    <Card style={styles.walkover}>
      <Text variant="caption">
        {matchLabel(match.round, rounds)} · {name(match.pilot_a)} contre {name(match.pilot_b)}
      </Text>
      <View style={styles.actions}>
        <Button
          title={`Qualifier ${name(match.pilot_a)}`}
          variant="secondary"
          style={styles.action}
          disabled={loading}
          onPress={() => onAward(match.pilot_a!)}
        />
        <Button
          title={`Qualifier ${name(match.pilot_b)}`}
          variant="secondary"
          style={styles.action}
          disabled={loading}
          onPress={() => onAward(match.pilot_b!)}
        />
      </View>
    </Card>
  );
}

function Meta({ icon, text }: { icon: (typeof icons)[keyof typeof icons]; text: string }) {
  return (
    <View style={styles.metaRow}>
      <Icon name={icon} size={16} color={colors.textMuted} />
      <Text variant="caption">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  meta: { gap: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  message: { fontStyle: 'italic', color: colors.textMuted },
  championCard: { alignItems: 'center', gap: spacing.xs, borderColor: colors.neon, paddingVertical: spacing.xl },
  championName: { color: colors.neon },
  notice: { paddingVertical: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
  walkover: { gap: spacing.sm },
  list: { gap: spacing.sm },
  seed: { width: 22, textAlign: 'center', fontWeight: '900', color: colors.textMuted },
});
