import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { ActionLine } from '@/features/admin/components/action-line';
import { waitingFor } from '@/features/admin/queue';
import {
  TOURNAMENT_STATUS,
  useAdminCancelTournament,
  useAdminRemoveTournamentPilot,
  useAdminSetTournamentOfficial,
  useAdminTournament,
  useAdminTournamentWalkover,
  type AdminTournamentDetail,
  type AdminTournamentDuel,
  type AdminTournamentPilot,
} from '@/features/admin/tournaments';
import { SectionTitle } from '@/features/social/components/section-title';
import { confirmAction } from '@/lib/confirm';
import { colors, spacing } from '@/theme';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Arbitrage d'un tournoi par un admin appli : forfaits, retrait d'un inscrit, statut officiel, annulation. */
export default function AdminTournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const tournament = useAdminTournament(id, isAppAdmin);
  const cancel = useAdminCancelTournament();
  const remove = useAdminRemoveTournamentPilot();
  const walkover = useAdminTournamentWalkover();
  const official = useAdminSetTournamentOfficial();
  const [reason, setReason] = useState('');
  const t = tournament.data;

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  const open = t?.status === 'registration' || t?.status === 'running';
  const error = [cancel, remove, walkover, official].find((m) => m.error)?.error;
  const busy = cancel.isPending || remove.isPending || walkover.isPending || official.isPending;
  const sent = reason.trim() ? `Motif : « ${reason.trim()} »` : 'Aucun motif indiqué.';

  return (
    <Screen safeTop={false} refreshing={tournament.isRefetching} onRefresh={tournament.refetch}>
      <Stack.Screen options={{ title: t?.name ?? 'Tournoi' }} />
      {tournament.isPending ? <Loading /> : null}
      {tournament.error ? <ErrorState error={tournament.error} /> : null}
      {t ? (
        <>
          <Summary tournament={t} />
          <Button title="Voir le tournoi et son tableau" variant="secondary" onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: t.id } })} />

          {open ? (
            <Input
              label="Motif de ta décision"
              value={reason}
              onChangeText={setReason}
              placeholder="Noté au journal, et envoyé au pilote retiré ou à l’organisateur d’un tournoi annulé"
              multiline
              maxLength={280}
              style={styles.multiline}
            />
          ) : null}
          {error ? <Text style={styles.error}>{error.message}</Text> : null}

          {t.status === 'running' ? (
            <>
              <SectionTitle title="Duels à jouer" detail={`${t.duels.length}`} />
              {t.duels.length === 0 ? <Text variant="caption">Aucun duel en attente : le tableau avance.</Text> : null}
              {t.duels.map((d) => (
                <DuelCard
                  key={d.id}
                  duel={d}
                  busy={busy}
                  onWalkover={(winner, loser) =>
                    confirmAction(
                      `Forfait de ${loser.username} ?`,
                      `${winner.username} est qualifié pour la suite du tableau. Irréversible. ${sent}`,
                      'Prononcer le forfait',
                      () => walkover.mutate({ tournamentId: t.id, matchId: d.id, winnerId: winner.id, reason }),
                    )
                  }
                />
              ))}
            </>
          ) : null}

          <SectionTitle title="Inscrits" detail={`${t.entries.length}/${t.size}`} />
          {t.entries.length === 0 ? <Text variant="caption">Aucun inscrit.</Text> : null}
          {t.entries.map((p) => (
            <Entrant
              key={p.id}
              pilot={p}
              subtitle={[
                p.id === t.organizer_id ? 'Organisateur' : null,
                p.seed ? `Tête de série ${p.seed}` : null,
                p.restricted ? 'Compte sanctionné' : null,
              ].filter(Boolean).join(' · ') || 'Inscrit'}
              // Un organisateur ordinaire ne quitte pas son tournoi : on l'annule.
              removable={t.status === 'registration' && (p.id !== t.organizer_id || t.is_official)}
              busy={busy}
              onRemove={() =>
                confirmAction(
                  `Retirer ${p.username} ?`,
                  `Son inscription est supprimée${t.waitlist.length > 0 ? ' et le premier remplaçant prend sa place' : ''}. ${sent}`,
                  'Retirer',
                  () => remove.mutate({ id: t.id, pilotId: p.id, reason }),
                )
              }
            />
          ))}
          {t.status !== 'registration' && open ? (
            <Text variant="caption">Tableau lancé : pour écarter un pilote, prononce son forfait sur son duel.</Text>
          ) : null}

          {t.waitlist.length > 0 ? (
            <>
              <SectionTitle title="Liste d’attente" detail={`${t.waitlist.length}`} />
              {t.waitlist.map((p) => (
                <Entrant
                  key={p.id}
                  pilot={p}
                  subtitle="Remplaçant"
                  removable={t.status === 'registration'}
                  busy={busy}
                  onRemove={() =>
                    confirmAction(`Retirer ${p.username} de la liste d’attente ?`, sent, 'Retirer', () =>
                      remove.mutate({ id: t.id, pilotId: p.id, reason }),
                    )
                  }
                />
              ))}
            </>
          ) : null}

          {t.status === 'registration' ? (
            <>
              <SectionTitle title="Statut officiel" />
              <Text variant="caption">
                Un tournoi officiel est tenu par le karting : mis en avant dans les listes, et ses duels saisis sur place
                comptent pour l’ELO. Modifiable seulement pendant les inscriptions.
                {t.is_private && !t.is_official ? ' Ce tournoi est privé : il ne peut pas devenir officiel.' : ''}
              </Text>
              <Button
                title={t.is_official ? 'Retirer le statut officiel' : 'Passer en tournoi officiel'}
                variant={t.is_official ? 'quiet' : 'secondary'}
                disabled={busy || (t.is_private && !t.is_official)}
                loading={official.isPending}
                onPress={() =>
                  confirmAction(
                    t.is_official ? 'Retirer le statut officiel ?' : 'Passer en tournoi officiel ?',
                    t.is_official
                      ? `${t.name} redevient un tournoi ordinaire.`
                      : `${t.name} sera présenté comme le tournoi officiel de ${t.track_name}.`,
                    'Confirmer',
                    () => official.mutate({ id: t.id, official: !t.is_official }),
                  )
                }
              />
            </>
          ) : null}

          {open ? (
            <>
              <SectionTitle title="Annulation" accent={colors.danger} />
              <Text variant="caption">
                {t.status === 'running'
                  ? 'Le tableau s’arrête et les duels pas encore joués sont annulés. Les résultats déjà validés et leur ELO sont conservés.'
                  : 'Les inscriptions sont fermées et les inscrits prévenus.'}{' '}
                Irréversible.
              </Text>
              <Button
                title="Annuler le tournoi"
                variant="quiet"
                disabled={busy}
                loading={cancel.isPending}
                onPress={() =>
                  confirmAction(`Annuler ${t.name} ?`, `Tous les inscrits sont prévenus. ${sent}`, 'Annuler le tournoi', () =>
                    cancel.mutate({ id: t.id, reason }, { onSuccess: () => setReason('') }),
                  )
                }
              />
            </>
          ) : null}

          {t.actions.length > 0 ? (
            <>
              <SectionTitle title="Historique admin" detail={`${t.actions.length}`} />
              <Card style={styles.card}>
                {t.actions.map((a) => (
                  <ActionLine key={a.id} action={a} />
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function Summary({ tournament: t }: { tournament: AdminTournamentDetail }) {
  const tags = [t.is_official ? 'Officiel' : null, t.is_private ? 'Privé' : 'Public', t.on_site ? 'Sur place' : null].filter(Boolean);
  const color = t.status === 'cancelled' ? colors.danger : t.status === 'completed' ? colors.textMuted : colors.neon;
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="heading" style={styles.flex}>{t.name}</Text>
        <Text style={[styles.status, { color, borderColor: color }]}>{TOURNAMENT_STATUS[t.status]}</Text>
      </View>
      <Text variant="caption">
        {t.track_name} · tableau de {t.size} · {t.format === 'lap_time' ? 'au meilleur tour' : 'à la position'} · {tags.join(', ')}
      </Text>
      <Text variant="caption">
        Créé le {dateTime(t.created_at)}
        {t.started_at ? ` · lancé le ${dateTime(t.started_at)}` : ''}
        {t.completed_at ? ` · terminé le ${dateTime(t.completed_at)}` : ''}
        {t.status === 'registration' && t.registration_closes_at ? ` · clôture le ${dateTime(t.registration_closes_at)}` : ''}
      </Text>
      {t.champion ? <Text variant="caption">Vainqueur : {t.champion}</Text> : null}
      {t.prize ? <Text variant="caption">Lot : {t.prize}</Text> : null}
      <Button
        title={`Organisateur : ${t.organizer ?? 'compte supprimé'}`}
        variant="ghost"
        disabled={!t.organizer}
        onPress={() => router.push({ pathname: '/admin/pilot/[id]', params: { id: t.organizer_id } })}
      />
    </Card>
  );
}

type Side = AdminTournamentDuel['a'];

function DuelCard({ duel: d, busy, onWalkover }: { duel: AdminTournamentDuel; busy: boolean; onWalkover: (winner: Side, loser: Side) => void }) {
  // Un résultat saisi ou contesté se règle d'abord dans « Résultats et anti-triche ».
  const locked = d.awaiting || d.disputed;
  return (
    <Card style={[styles.card, (d.stuck_since || d.disputed) && styles.warn]}>
      <Text variant="label">{d.label}</Text>
      <Text style={styles.bold}>
        {d.a.username} contre {d.b.username}
      </Text>
      <Text variant="caption">
        Ouvert depuis {waitingFor(d.opened_at)}
        {d.deadline_at ? ` · à jouer avant le ${dateTime(d.deadline_at)}` : ' · sans délai'}
      </Text>
      {d.stuck_since ? <Text style={styles.flag}>Bloqué depuis {waitingFor(d.stuck_since)} : l’organisateur a été prévenu.</Text> : null}
      {d.disputed ? <Text style={styles.flag}>Résultat contesté : tranche-le dans « Résultats et anti-triche ».</Text> : null}
      {d.awaiting ? <Text variant="caption">Un résultat saisi attend la validation de l’autre pilote.</Text> : null}
      {d.disputed ? (
        <Button title="Ouvrir les litiges" variant="secondary" onPress={() => router.push('/admin/results')} />
      ) : (
        <View style={styles.actions}>
          <Button title={`Forfait de ${d.a.username}`} variant="secondary" style={styles.flex} disabled={busy || locked} onPress={() => onWalkover(d.b, d.a)} />
          <Button title={`Forfait de ${d.b.username}`} variant="secondary" style={styles.flex} disabled={busy || locked} onPress={() => onWalkover(d.a, d.b)} />
        </View>
      )}
    </Card>
  );
}

function Entrant({ pilot: p, subtitle, removable, busy, onRemove }: { pilot: AdminTournamentPilot; subtitle: string; removable: boolean; busy: boolean; onRemove: () => void }) {
  // Le bouton reste hors de la ligne : celle-ci est un lien vers la licence du pilote.
  return (
    <View style={styles.entrant}>
      <View style={styles.flex}>
        <PilotRow pilotId={p.id} username={p.username} avatarUrl={p.avatar_url} rank={p.rank} elo={p.elo} subtitle={subtitle} />
      </View>
      {removable ? <Button title="Retirer" variant="quiet" disabled={busy} onPress={onRemove} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '800' },
  card: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  status: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  warn: { borderLeftWidth: 3, borderLeftColor: colors.orange },
  flag: { fontSize: 13, fontWeight: '700', color: colors.orange },
  actions: { flexDirection: 'row', gap: spacing.sm },
  entrant: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  multiline: { minHeight: 80, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
});
