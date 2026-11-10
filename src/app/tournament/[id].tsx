import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons, type IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { useMyProfile } from '@/features/profile/api';
import { useConversations } from '@/features/social/radio';
import {
  useAwardWalkover,
  useCancelTournament,
  useDeclineTournamentInvite,
  useForfeitTournamentMatch,
  useJoinTournament,
  useLeaveTournament,
  useRevokeTournamentInvite,
  useStartTournament,
  useTournament,
  useTournamentConversation,
  useTournamentInvites,
} from '@/features/tournaments/api';
import {
  conditionsLabel,
  eliminatedIn,
  isOverdue,
  isStillIn,
  meetsConditions,
  matchLabel,
  minPilotsToStart,
  myCurrentMatch,
  progress,
  roundCount,
  roundLabel,
  sizeSummary,
  statusLabel,
} from '@/features/tournaments/bracket';
import { Bracket } from '@/features/tournaments/components/bracket';
import { OfficialTag } from '@/features/tournaments/components/official-tag';
import { OnSiteResults } from '@/features/tournaments/components/on-site-results';
import { Podium } from '@/features/tournaments/components/podium';
import { TournamentBanner } from '@/features/tournaments/components/tournament-banner';
import { confirmAction } from '@/lib/confirm';
import { dateTimeFormat } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
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
  const decline = useDeclineTournamentInvite();
  const revoke = useRevokeTournamentInvite();
  const invites = useTournamentInvites(id);
  const me = useMyProfile();

  const t = tournament.data;
  const registered = !!t && !!userId && t.entries.some((e) => e.pilot_id === userId);
  // L'organisateur d'un tournoi officiel suit la discussion sans forcément être inscrit.
  const chat = useTournamentConversation(t?.id, registered || (!!t && t.organizer_id === userId));
  const unread = useConversations().data?.find((c) => c.id === chat.data)?.unread ?? 0;

  if (tournament.isPending) return <Screen safeTop={false}><Loading /></Screen>;
  if (tournament.error) return <Screen safeTop={false}><ErrorState error={tournament.error} /></Screen>;
  if (!t || !userId) return <Screen safeTop={false}><EmptyState title="Tournoi introuvable" /></Screen>;

  const rounds = roundCount(t.size);
  const isOrganizer = t.organizer_id === userId;
  const full = t.entries.length >= t.size;
  const waitingIndex = t.waitlist.findIndex((w) => w.pilot_id === userId);
  const waiting = waitingIndex >= 0;
  const conditions = conditionsLabel(t);
  // Tant que mon ELO n'est pas chargé, on ne bloque pas : le serveur vérifie de toute façon.
  const eligible = me.data ? meetsConditions(t, me.data.elo) : true;
  // Tableau plein lancé à la main : on peut s'inscrire en remplaçant.
  const canWait = full && !t.auto_start;
  const canStart = t.entries.length >= minPilotsToStart(t.size);
  const current = myCurrentMatch(t, userId);
  const organizer = t.entries.find((e) => e.pilot_id === t.organizer_id)?.pilot;
  const name = (pilotId: string | null) => t.entries.find((e) => e.pilot_id === pilotId)?.pilot.username ?? 'Pilote';
  const actionError = [join, leave, start, cancel, forfeit, walkover, decline, revoke].find((m) => m.error)?.error as Error | undefined;
  const editable = isOrganizer && (t.status === 'registration' || t.status === 'running');
  const duels = progress(t);
  const myInvite = (invites.data ?? []).find((i) => i.pilot_id === userId && i.status === 'pending');
  // Invitations en attente que je peux retirer (toutes pour l'organisateur, sinon les miennes).
  const pendingInvites = (invites.data ?? []).filter((i) => i.status === 'pending' && i.pilot_id !== userId);
  // Public : tout inscrit invite. Privé : l'organisateur seulement.
  const canInvite = t.status === 'registration' && (isOrganizer || (registered && !t.is_private));
  // Duels que l'organisateur peut arbitrer (il ne les joue pas).
  const refereeable =
    isOrganizer && t.status === 'running'
      ? t.matches
          .filter((m) => !m.decided_at && m.challenge_id && m.pilot_a !== userId && m.pilot_b !== userId)
          // Les duels en retard d'abord.
          .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || a.round - b.round || a.slot - b.slot)
      : [];

  const share = () =>
    Share.share({
      message: `🏆 ${t.name} : tournoi à élimination directe, ${t.size} pilotes à ${t.track.name} (${t.track.city}), sur Kart Rivals.${
        t.is_private ? ' Sur invitation :' : t.status === 'registration' ? ' Inscris-toi :' : ' Suis le tableau :'
      } kartrivals://tournament/${t.id}`,
    });

  return (
    <Screen safeTop={false} refreshing={tournament.isRefetching} onRefresh={tournament.refetch}>
      <Stack.Screen options={{ title: 'Tournoi' }} />

      <TournamentBanner bannerUrl={t.banner_url} coverUrl={t.track.cover_url} height={200}>
        {t.is_official ? <OfficialTag /> : null}
        <View style={[styles.status, t.status === 'registration' ? styles.statusOpen : t.status === 'running' ? styles.statusLive : null]}>
          <Text style={[styles.statusText, t.status === 'registration' && { color: colors.onNeon }]}>{statusLabel[t.status]}</Text>
        </View>
        <Text variant="title" numberOfLines={2}>
          {t.name}
        </Text>
        <Text style={styles.bannerLine} numberOfLines={1}>
          {t.track.name} · {t.track.city}
          {t.is_private ? ' · 🔒 privé' : ''}
        </Text>
      </TournamentBanner>

      <View style={styles.facts}>
        <Fact icon={icons.group} value={`${t.entries.length}/${t.size}`} label="pilotes" />
        <Fact icon={icons.trophy} value={String(rounds)} label={rounds > 1 ? 'tours' : 'tour'} />
        <Fact icon={t.format === 'lap_time' ? icons.timer : icons.challenge} value={t.format === 'lap_time' ? 'Chrono' : 'Position'} label="duels" />
      </View>

      <View style={styles.quick}>
        <Quick
          icon={icons.radio}
          label="Chat"
          badge={unread}
          disabled={!chat.data}
          onPress={() => router.push({ pathname: '/radio/[id]', params: { id: chat.data!, title: t.name } })}
        />
        {canInvite ? (
          <Quick icon={icons.recruit} label="Inviter" onPress={() => router.push({ pathname: '/tournament/invite', params: { id: t.id } })} />
        ) : null}
        <Quick icon={icons.share} label="Partager" onPress={share} />
        <Quick icon={icons.pin} label="Circuit" onPress={() => router.push({ pathname: '/track/[id]', params: { id: t.track.id } })} />
        {editable ? (
          <Quick icon={icons.edit} label="Modifier" onPress={() => router.push({ pathname: '/tournament/edit', params: { id: t.id } })} />
        ) : null}
      </View>
      {!registered && !isOrganizer ? (
        <Text variant="caption">La discussion du tournoi est réservée aux inscrits.</Text>
      ) : null}

      {t.prize ? (
        <Card style={styles.prize}>
          <Icon name={icons.gift} size={26} color={colors.neon} />
          <View style={styles.prizeBody}>
            <Text variant="label">À gagner</Text>
            <Text style={styles.prizeText}>{t.prize}</Text>
          </View>
        </Card>
      ) : null}

      {myInvite && t.status === 'registration' ? (
        <Card style={styles.invite}>
          <Text style={styles.inviteText}>
            {myInvite.inviter?.username ?? 'Un pilote'} t’invite à ce tournoi{t.is_private ? ' privé' : ''}.
          </Text>
          <View style={styles.actions}>
            <Button
              title="Refuser"
              variant="secondary"
              style={styles.action}
              disabled={decline.isPending || join.isPending}
              onPress={() => decline.mutate(t.id)}
            />
            <Button
              title={full && canWait ? 'Liste d’attente' : 'Accepter'}
              style={styles.action}
              loading={join.isPending}
              disabled={(full && !canWait) || !eligible}
              onPress={() => join.mutate(t.id)}
            />
          </View>
          {full ? (
            <Text variant="caption">
              {canWait ? 'Le tableau est complet : tu peux t’inscrire en remplaçant.' : 'Le tableau est déjà complet.'}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card style={styles.info}>
        {t.starts_at ? <Meta icon={icons.clock} text={dateTimeFormat.format(new Date(t.starts_at))} /> : <Meta icon={icons.clock} text="Date à définir" />}
        <Meta icon={icons.bolt} text={`${sizeSummary(t.size)} · ${t.format === 'lap_time' ? 'duels au meilleur tour' : 'duels à la position'}`} />
        <Meta icon={icons.medal} text={conditions ? `Réservé : ${conditions}` : 'Ouvert à tous les niveaux'} />
        {t.on_site ? (
          <Meta icon={icons.pin} text={`Sur place : l’organisateur saisit les résultats${t.is_official ? '' : ' (hors ELO)'}`} />
        ) : t.round_days ? (
          <Meta icon={icons.timer} text={`${t.round_days} jour${t.round_days > 1 ? 's' : ''} pour jouer chaque duel`} />
        ) : null}
        {t.third_place ? <Meta icon={icons.trophy} text="Petite finale pour la 3e place" /> : null}
        {t.status === 'registration' && t.registration_closes_at ? (
          <Meta icon={icons.lock} text={`Clôture des inscriptions : ${dateTimeFormat.format(new Date(t.registration_closes_at))}`} />
        ) : null}
        {t.is_official ? (
          <Meta icon={icons.verified} text={`Tournoi officiel de ${t.track.name}${isOrganizer ? ' · tu l’organises' : ''}`} />
        ) : organizer ? (
          <Meta icon={icons.helmet} text={`Organisé par ${isOrganizer ? 'toi' : organizer.username}`} />
        ) : null}
        {t.message ? <Text style={styles.message}>« {t.message} »</Text> : null}
      </Card>

      {t.champion_id ? <Podium tournament={t} /> : null}

      {t.status === 'running' && duels.total > 0 ? (
        <View style={styles.progress}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(duels.played / duels.total) * 100}%` }]} />
          </View>
          <Text variant="caption">
            {duels.played}/{duels.total} duels joués
          </Text>
        </View>
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
          <View style={styles.progress}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(t.entries.length / t.size) * 100}%` }]} />
            </View>
            <Text variant="caption">
              {full ? 'Tableau complet' : `Encore ${t.size - t.entries.length} place${t.size - t.entries.length > 1 ? 's' : ''}`}
            </Text>
          </View>
          {waiting ? (
            <Card style={[styles.notice, { borderColor: colors.orange }]}>
              <Text style={{ color: colors.orange }}>
                Tu es {waitingIndex === 0 ? 'premier' : `${waitingIndex + 1}e`} sur la liste d’attente. Si un pilote se
                désiste, {waitingIndex === 0 ? 'tu prends sa place' : 'la liste avance'} et tu es prévenu.
              </Text>
            </Card>
          ) : null}
          {!registered && !waiting && !eligible ? (
            <Card style={styles.notice}>
              <Text style={{ color: colors.textMuted }}>
                Ce tournoi est réservé : {conditions}. Avec {me.data?.elo} ELO, tu ne peux pas t’y inscrire
                {isOrganizer ? ' : tu l’organises et l’arbitres' : ''}.
              </Text>
            </Card>
          ) : null}
          {!registered && !waiting && eligible && !myInvite && (!full || canWait) ? (
            <Button
              title={full ? 'Rejoindre la liste d’attente' : 'M’inscrire'}
              variant={full ? 'secondary' : 'primary'}
              loading={join.isPending}
              onPress={() => join.mutate(t.id)}
            />
          ) : null}
          {waiting ? (
            <Button title="Quitter la liste d’attente" variant="secondary" loading={leave.isPending} onPress={() => leave.mutate(t.id)} />
          ) : null}
          {registered && (!isOrganizer || t.is_official) ? (
            <Button
              title="Me désinscrire"
              variant="secondary"
              loading={leave.isPending}
              onPress={() =>
                t.waitlist.length > 0
                  ? confirmAction(
                      'Te désinscrire ?',
                      `${t.waitlist[0].pilot.username}, premier sur la liste d’attente, prendra ta place.`,
                      'Me désinscrire',
                      () => leave.mutate(t.id),
                    )
                  : leave.mutate(t.id)
              }
            />
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
            {t.auto_start
              ? `Le tirage se fait tout seul quand les ${t.size} places sont prises.`
              : 'L’organisateur lance le tableau lui-même ; une fois plein, on s’inscrit en liste d’attente.'}{' '}
            Têtes de série par ELO : les deux meilleurs ne peuvent se croiser qu’en finale.
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

      {isOrganizer && t.on_site && t.status === 'running' ? <OnSiteResults tournament={t} myId={userId} /> : null}

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

      <Text variant="label">{t.status === 'registration' ? `Inscrits · ${t.entries.length}` : 'Têtes de série'}</Text>
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
            subtitle={entryStatus(t, e.pilot_id)}
            leading={e.seed ? <Text style={styles.seed}>{e.seed}</Text> : undefined}
          />
        ))}
      </View>

      {t.waitlist.length > 0 && t.status === 'registration' ? (
        <>
          <Text variant="label">Liste d’attente · {t.waitlist.length}</Text>
          <View style={styles.list}>
            {t.waitlist.map((w, i) => (
              <PilotRow
                key={w.pilot_id}
                pilotId={w.pilot_id}
                username={w.pilot.username}
                avatarUrl={w.pilot.avatar_url}
                rank={w.pilot.rank}
                elo={w.pilot.elo}
                highlighted={w.pilot_id === userId}
                subtitle={i === 0 ? '1er remplaçant' : `${i + 1}e remplaçant`}
                leading={<Text style={styles.seed}>{i + 1}</Text>}
              />
            ))}
          </View>
        </>
      ) : null}

      {pendingInvites.length > 0 && t.status === 'registration' ? (
        <>
          <Text variant="label">Invitations en attente · {pendingInvites.length}</Text>
          <View style={styles.list}>
            {pendingInvites.map((i) => (
              <PilotRow
                key={i.pilot_id}
                pilotId={i.pilot_id}
                username={i.pilot.username}
                avatarUrl={i.pilot.avatar_url}
                rank={i.pilot.rank}
                elo={i.pilot.elo}
                subtitle={i.invited_by === userId ? 'Invité par toi' : `Invité par ${i.inviter?.username ?? 'un pilote'}`}
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Retirer l’invitation de ${i.pilot.username}`}
                    hitSlop={10}
                    disabled={revoke.isPending}
                    onPress={() => revoke.mutate({ tournamentId: t.id, pilotId: i.pilot_id })}>
                    <Icon name={icons.close} size={18} color={colors.textMuted} />
                  </Pressable>
                }
              />
            ))}
          </View>
        </>
      ) : null}

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

/** Sous-titre d'un inscrit : où il en est dans le tableau. */
function entryStatus(t: Tournament, pilotId: string): string {
  const organizer = pilotId === t.organizer_id ? ' · organisateur' : '';
  if (t.status === 'registration' || t.status === 'cancelled') return `Inscrit${organizer}`;
  if (t.champion_id === pilotId) return `Vainqueur${organizer}`;
  if (t.runner_up_id === pilotId) return `Finaliste${organizer}`;
  if (t.third_place_id === pilotId) return `3e place${organizer}`;
  const out = eliminatedIn(t, pilotId);
  if (out) return `Éliminé · ${roundLabel(out.round, roundCount(t.size), true).toLowerCase()}${organizer}`;
  return `En lice${organizer}`;
}

/** Situation du pilote connecté dans un tableau en cours. */
function MyRun({ tournament: t, myId, current }: { tournament: Tournament; myId: string; current: TournamentMatch | null }) {
  if (!t.entries.some((e) => e.pilot_id === myId)) return null;
  const rounds = roundCount(t.size);
  let text: string;
  let tone: string = colors.textMuted;
  if (current) {
    text = `${matchLabel(current.round, rounds, current.slot)} : tu affrontes ${
      t.entries.find((e) => e.pilot_id === (current.pilot_a === myId ? current.pilot_b : current.pilot_a))?.pilot.username ?? 'ton adversaire'
    }. ${
      t.on_site
        ? 'L’organisateur saisit le résultat à l’arrivée.'
        : 'Courez, saisissez le résultat et validez-le comme un défi.'
    }${current.deadline_at ? ` À jouer avant le ${dateTimeFormat.format(new Date(current.deadline_at))}.` : ''}`;
    if (isOverdue(current)) text += ' Le délai est dépassé : l’organisateur peut prononcer un forfait.';
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
        {matchLabel(match.round, rounds, match.slot)} · {name(match.pilot_a)} contre {name(match.pilot_b)}
      </Text>
      {match.deadline_at ? (
        <Text variant="caption" style={isOverdue(match) ? { color: colors.orange, fontWeight: '800' } : undefined}>
          {isOverdue(match) ? 'Délai dépassé depuis le ' : 'À jouer avant le '}
          {dateTimeFormat.format(new Date(match.deadline_at))}
        </Text>
      ) : null}
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

function Fact({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={18} color={colors.neon} />
      <Text style={styles.factValue}>{value}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

function Quick({
  icon,
  label,
  badge = 0,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  badge?: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge > 0 ? `${label}, ${badge} non lus` : label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.quickItem, disabled && styles.disabled, pressed && { opacity: 0.8 }]}>
      <View>
        <Icon name={icon} size={22} color={colors.text} />
        {badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text variant="caption" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Meta({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.metaRow}>
      <Icon name={icon} size={16} color={colors.textMuted} />
      <Text variant="caption" style={styles.metaText}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  status: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceAlt,
  },
  statusOpen: { backgroundColor: colors.neon },
  statusLive: { backgroundColor: colors.orange },
  statusText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  bannerLine: { color: colors.text, opacity: 0.85, fontWeight: '600' },
  facts: { flexDirection: 'row', gap: spacing.sm },
  fact: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  factValue: { fontSize: 18, fontWeight: '900' },
  quick: { flexDirection: 'row', gap: spacing.sm },
  quickItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  disabled: { opacity: 0.4 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.orange,
  },
  badgeText: { fontSize: 11, fontWeight: '900', color: colors.onNeon },
  info: { gap: spacing.sm },
  prize: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderColor: colors.neon },
  prizeBody: { flex: 1, gap: 2 },
  prizeText: { fontSize: 17, fontWeight: '800', color: colors.neon },
  invite: { gap: spacing.md, borderColor: colors.neon },
  inviteText: { fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaText: { flex: 1 },
  message: { fontStyle: 'italic', color: colors.textMuted },
  progress: { gap: 6 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.neon },
  notice: { paddingVertical: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
  walkover: { gap: spacing.sm },
  list: { gap: spacing.sm },
  seed: { width: 22, textAlign: 'center', fontWeight: '900', color: colors.textMuted },
});
