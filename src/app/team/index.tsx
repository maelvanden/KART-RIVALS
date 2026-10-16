import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { TeamCard } from '@/features/social/components/team-card';
import { TeamCrest } from '@/features/social/components/team-crest';
import { useConversations } from '@/features/social/radio';
import {
  useKickTeamMember,
  useLeaveTeam,
  useMyTeam,
  useMyTeamInvites,
  useRespondTeamInvite,
  useSentTeamInvites,
} from '@/features/social/teams';
import { colors, fonts, radius, spacing } from '@/theme';
import type { Team, TeamMember } from '@/types/models';

const podium = ['#FFC83D', '#C0C7D1', '#CD7F32'];
const roleLabel = { team_principal: 'Team Principal', pilote_officiel: 'Pilote officiel' } as const;

/** Écran « Mon Écurie » : carte héros, classement interne, invitations ; ou création / invitations reçues. */
export default function MyTeamScreen() {
  const team = useMyTeam();
  const invites = useMyTeamInvites();

  return (
    <Screen
      safeTop={false}
      refreshing={team.isRefetching}
      onRefresh={() => {
        team.refetch();
        invites.refetch();
      }}>
      {team.isPending ? <Loading /> : null}
      {team.error ? <ErrorState error={team.error} /> : null}
      {team.data ? <TeamView team={team.data} /> : null}
      {team.data === null ? <NoTeam /> : null}
    </Screen>
  );
}

function TeamView({ team }: { team: Team }) {
  const { userId } = useAuth();
  const conversations = useConversations();
  const sent = useSentTeamInvites(team.id);
  const leave = useLeaveTeam();
  const kick = useKickTeamMember();
  const isPrincipal = team.members.some((m) => m.pilot.id === userId && m.role === 'team_principal');
  const unread = conversations.data?.find((c) => c.id === team.conversation_id)?.unread ?? 0;

  function confirmLeave() {
    const last = team.members.length === 1;
    const message = last
      ? 'Tu es le dernier pilote : l’écurie sera dissoute.'
      : isPrincipal
        ? 'Le pilote le plus ancien deviendra Team Principal.'
        : 'Tu pourras rejoindre une autre écurie.';
    confirm(`Quitter ${team.name} ?`, message, 'Quitter', () => leave.mutate());
  }

  function confirmKick(m: TeamMember) {
    confirm(`Libérer ${m.pilot.username} ?`, 'Il quittera l’écurie et son canal radio.', 'Libérer', () => kick.mutate(m.pilot.id));
  }

  const error = (leave.error ?? kick.error) as Error | null;

  return (
    <>
      <TeamCard
        team={team}
        unread={unread}
        onChat={() => team.conversation_id && router.push({ pathname: '/radio/[id]', params: { id: team.conversation_id } })}
        onInvite={isPrincipal ? () => router.push('/team/invite') : undefined}
      />

      <SectionTitle title="Classement interne" detail={`${team.members.length} pilotes`} />
      <View style={styles.list}>
        {team.members.map((m, i) => (
          <PilotRow
            key={m.pilot.id}
            pilotId={m.pilot.id}
            username={m.pilot.username}
            avatarUrl={m.pilot.avatar_url}
            rank={m.pilot.rank}
            elo={m.pilot.elo}
            highlighted={m.pilot.id === userId}
            subtitle={roleLabel[m.role]}
            leading={<Text style={[styles.position, { color: podium[i] ?? colors.textMuted }]}>{i + 1}</Text>}
            trailing={
              <View style={styles.trailing}>
                {m.role === 'team_principal' ? <Icon name={icons.crown} size={16} color={colors.neon} /> : null}
                <Text style={styles.elo}>{m.pilot.elo}</Text>
              </View>
            }
          />
        ))}
      </View>

      {isPrincipal && sent.data && sent.data.length > 0 ? (
        <>
          <SectionTitle title="Recrutement en cours" detail={`${sent.data.length}`} />
          <Card style={styles.pending}>
            {sent.data.map((p) => (
              <View key={p.id} style={styles.pendingRow}>
                <Icon name={icons.clock} size={14} color={colors.textMuted} />
                <Text style={styles.pendingName}>{p.username}</Text>
                <Text variant="caption">Invitation envoyée</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {isPrincipal && team.members.length > 1 ? (
        <>
          <SectionTitle title="Gestion de l’écurie" />
          <View style={styles.list}>
            {team.members
              .filter((m) => m.pilot.id !== userId)
              .map((m) => (
                <Button key={m.pilot.id} title={`Libérer ${m.pilot.username}`} variant="quiet" onPress={() => confirmKick(m)} />
              ))}
          </View>
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      <Button title="Quitter l’écurie" variant="quiet" loading={leave.isPending} onPress={confirmLeave} />
    </>
  );
}

function NoTeam() {
  const invites = useMyTeamInvites();
  const respond = useRespondTeamInvite();
  const [answering, setAnswering] = useState<string | null>(null);

  return (
    <>
      <View style={styles.empty}>
        <TeamCrest tag="?" logoUrl={null} size={96} />
        <Text variant="title" style={styles.emptyTitle}>
          Sans écurie
        </Text>
        <Text variant="caption" style={styles.emptyText}>
          Fonde ton écurie, choisis ton tag et ton blason, puis recrute tes coéquipiers. L’ELO de l’écurie est la
          moyenne de ses pilotes.
        </Text>
      </View>
      <Button
        title="Fonder une écurie"
        size="lg"
        icon={<Icon name={icons.team} size={20} color={colors.onNeon} />}
        onPress={() => router.push('/team/new')}
      />

      {invites.data && invites.data.length > 0 ? (
        <>
          <SectionTitle title="Invitations reçues" detail={`${invites.data.length}`} />
          {invites.data.map((inv) => (
            <Card key={inv.id} style={styles.invite}>
              <View style={styles.inviteHeader}>
                <TeamCrest tag={inv.team.tag} logoUrl={inv.team.logo_url} size={48} />
                <View style={styles.inviteText}>
                  <Text variant="heading" numberOfLines={1}>
                    {inv.team.name}
                  </Text>
                  <Text variant="caption">
                    [{inv.team.tag}]{inv.invited_by ? ` · recruté par ${inv.invited_by.username}` : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.inviteActions}>
                <Button
                  title="Décliner"
                  variant="secondary"
                  style={styles.flex}
                  disabled={respond.isPending}
                  onPress={() => {
                    setAnswering(inv.id);
                    respond.mutate({ id: inv.id, accept: false });
                  }}
                />
                <Button
                  title="Signer"
                  style={styles.flex}
                  loading={respond.isPending && answering === inv.id}
                  onPress={() => {
                    setAnswering(inv.id);
                    respond.mutate({ id: inv.id, accept: true });
                  }}
                />
              </View>
            </Card>
          ))}
          {respond.error ? <Text style={styles.error}>{(respond.error as Error).message}</Text> : null}
        </>
      ) : null}
    </>
  );
}

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionBar} />
      <Text variant="label" style={styles.sectionTitle}>
        {title}
      </Text>
      {detail ? <Text variant="label">{detail}</Text> : null}
    </View>
  );
}

/** Confirmation native (Alert) ; sur le web, window.confirm. */
function confirm(title: string, message: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Annuler', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  position: { width: 26, textAlign: 'center', fontFamily: fonts.display, fontSize: 22 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  elo: { fontFamily: fonts.display, fontSize: 20, color: colors.text, fontVariant: ['tabular-nums'] },
  section: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  sectionBar: { width: 10, height: 3, backgroundColor: colors.neon },
  sectionTitle: { flex: 1, color: colors.text },
  pending: { gap: spacing.md },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pendingName: { flex: 1, fontWeight: '700' },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  emptyTitle: { textAlign: 'center' },
  emptyText: { textAlign: 'center', maxWidth: 320 },
  invite: { gap: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.neon, borderRadius: radius.lg },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  inviteText: { flex: 1, gap: 2 },
  inviteActions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  error: { color: colors.danger },
});
