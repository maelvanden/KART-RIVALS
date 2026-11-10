import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { useApproxLocation, useNearbyPilots, useSearchPilots } from '@/features/nearby/api';
import { useTeammates } from '@/features/social/friends';
import { useBlockedIds } from '@/features/social/safety';
import { useMyTeam } from '@/features/social/teams';
import { useInviteToTournament, useTournament, useTournamentInvites } from '@/features/tournaments/api';
import { colors, radius, rankMeta, spacing } from '@/theme';
import type { PilotSummary } from '@/types/models';

/** Inviter des pilotes à un tournoi : son écurie, ses coéquipiers, ou n'importe qui par son pseudo. */
export default function InviteToTournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const tournament = useTournament(id);
  const invites = useTournamentInvites(id);
  const team = useMyTeam();
  const { teammates } = useTeammates();
  const blocked = useBlockedIds();
  const location = useApproxLocation();
  const nearby = useNearbyPilots(location.data, 100);
  const [query, setQuery] = useState('');
  const search = useSearchPilots(query);
  const invite = useInviteToTournament();
  const [picked, setPicked] = useState<PilotSummary[]>([]);
  const [sent, setSent] = useState<number | null>(null);

  const t = tournament.data;
  // Pourquoi un pilote ne peut plus être invité.
  const taken = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of t?.entries ?? []) map.set(e.pilot_id, 'Inscrit');
    for (const i of invites.data ?? []) map.set(i.pilot_id, i.status === 'declined' ? 'A refusé' : 'Déjà invité');
    return map;
  }, [t, invites.data]);

  if (tournament.isPending) return <Screen safeTop={false}><Loading /></Screen>;
  if (tournament.error) return <Screen safeTop={false}><ErrorState error={tournament.error} /></Screen>;
  if (!t || !userId) return <Screen safeTop={false}><EmptyState title="Tournoi introuvable" /></Screen>;

  const usable = (p: PilotSummary) => p.id !== userId && !blocked.has(p.id);
  const teamPilots = (team.data?.members ?? []).map((m) => m.pilot).filter(usable);
  const friendPilots = teammates.map((f) => f.pilot).filter(usable);
  const searching = query.trim().length >= 2;
  // Sans recherche, les pilotes proches déjà listés au-dessus (écurie, coéquipiers) ne sont pas répétés.
  const listed = new Set([...teamPilots, ...friendPilots].map((p) => p.id));
  const others: PilotSummary[] = ((searching ? search.data : nearby.data) ?? [])
    .filter(usable)
    .filter((p) => searching || !listed.has(p.id));
  const isPicked = (pilotId: string) => picked.some((p) => p.id === pilotId);
  const free = (list: PilotSummary[]) => list.filter((p) => !taken.has(p.id));

  const toggle = (p: PilotSummary) =>
    setPicked((list) => (isPicked(p.id) ? list.filter((x) => x.id !== p.id) : [...list, p]));
  /** Ajoute tout un groupe (écurie, coéquipiers) ; le retire s'il est déjà entièrement coché. */
  function toggleAll(list: PilotSummary[]) {
    const group = free(list);
    const all = group.every((p) => isPicked(p.id));
    setPicked((current) =>
      all ? current.filter((p) => !group.some((g) => g.id === p.id)) : [...current, ...group.filter((g) => !current.some((p) => p.id === g.id))],
    );
  }

  async function send() {
    const count = await invite.mutateAsync({ tournamentId: t!.id, pilotIds: picked.map((p) => p.id) });
    setPicked([]);
    setSent(count);
  }

  const group = (label: string, list: PilotSummary[], allLabel?: string) =>
    list.length > 0 ? (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text variant="label">{label}</Text>
          {allLabel && free(list).length > 1 ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => toggleAll(list)}>
              <Text style={styles.all}>{free(list).every((p) => isPicked(p.id)) ? 'Tout décocher' : allLabel}</Text>
            </Pressable>
          ) : null}
        </View>
        {list.map((p) => (
          <Candidate key={p.id} pilot={p} on={isPicked(p.id)} state={taken.get(p.id)} onPress={() => toggle(p)} />
        ))}
      </View>
    ) : null;

  return (
    <Screen safeTop={false} subtitle={t.name} title="Inviter des pilotes">
      <Text variant="caption">
        {t.is_private
          ? 'Tournoi privé : seuls les pilotes invités le voient et peuvent s’inscrire.'
          : 'Tournoi public : une invitation prévient le pilote, mais tout le monde peut s’inscrire.'}{' '}
        {t.size - t.entries.length > 0 ? `${t.size - t.entries.length} place(s) restante(s).` : 'Le tableau est complet.'}
      </Text>

      {sent !== null ? (
        <View style={styles.sent}>
          <Icon name={icons.checkCircle} size={20} color={colors.neon} />
          <Text style={{ color: colors.neon, flex: 1 }}>
            {sent === 0
              ? 'Aucune nouvelle invitation : ces pilotes étaient déjà invités ou inscrits.'
              : `${sent} invitation${sent > 1 ? 's envoyées' : ' envoyée'}. Les pilotes reçoivent une notification.`}
          </Text>
        </View>
      ) : null}

      {group('Mon écurie', teamPilots, 'Inviter toute l’écurie')}
      {group('Mes coéquipiers', friendPilots, 'Tous les inviter')}

      <View style={styles.section}>
        <Text variant="label">Autres pilotes</Text>
        <Input
          label="Chercher un pseudo"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ou choisis parmi les pilotes proches"
        />
        {others.map((p) => (
          <Candidate key={p.id} pilot={p} on={isPicked(p.id)} state={taken.get(p.id)} onPress={() => toggle(p)} />
        ))}
        {others.length === 0 ? (
          <Text variant="caption">{searching ? 'Aucun pilote trouvé.' : 'Aucun pilote proche. Cherche un pseudo.'}</Text>
        ) : null}
      </View>

      {invite.error ? <Text style={{ color: colors.danger }}>{(invite.error as Error).message}</Text> : null}
      <Button
        title={picked.length > 0 ? `Inviter ${picked.length} pilote${picked.length > 1 ? 's' : ''}` : 'Choisis des pilotes'}
        onPress={send}
        loading={invite.isPending}
        disabled={picked.length === 0}
      />
      <Button title="Terminé" variant="quiet" onPress={() => router.back()} />
    </Screen>
  );
}

function Candidate({ pilot: p, on, state, onPress }: { pilot: PilotSummary; on: boolean; state?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: !!state }}
      accessibilityLabel={state ? `${p.username}, ${state}` : p.username}
      onPress={onPress}
      disabled={!!state}
      style={[styles.candidate, on && styles.candidateOn, !!state && styles.disabled]}>
      <Avatar username={p.username} url={p.avatar_url} size={34} borderColor={rankMeta[p.rank].color} />
      <View style={styles.candidateBody}>
        <Text style={styles.candidateName}>{p.username}</Text>
        <Text variant="caption">{p.elo} ELO</Text>
      </View>
      {state ? (
        <Text variant="caption">{state}</Text>
      ) : (
        <View style={[styles.check, on && styles.checkOn]}>{on ? <Icon name={icons.check} size={14} color={colors.onNeon} /> : null}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  all: { color: colors.neon, fontWeight: '800', fontSize: 13 },
  sent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neon,
    backgroundColor: colors.selected,
  },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  candidateOn: { borderColor: colors.neon, backgroundColor: colors.selected },
  disabled: { opacity: 0.45 },
  candidateBody: { flex: 1, gap: 2 },
  candidateName: { fontWeight: '800', fontSize: 15 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.neon, borderColor: colors.neon },
});
