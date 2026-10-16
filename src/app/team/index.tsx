import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { pickSquarePhoto } from '@/features/profile/avatar';
import { TeamColorPicker } from '@/features/social/components/color-picker';
import { SectionTitle } from '@/features/social/components/section-title';
import { TeamCard } from '@/features/social/components/team-card';
import { TeamCrest } from '@/features/social/components/team-crest';
import { useConversations } from '@/features/social/radio';
import {
  useCancelApplication,
  useMyApplications,
  useRespondApplication,
  useSetMemberRole,
  useSetRecruiting,
  useTeamApplications,
} from '@/features/social/recruitment';
import { isStaff, roleLabel } from '@/features/social/roles';
import {
  useKickTeamMember,
  useLeaveTeam,
  useMyTeam,
  useMyTeamInvites,
  useRespondTeamInvite,
  useSentTeamInvites,
  useSetTeamColor,
  useSetTeamLogo,
} from '@/features/social/teams';
import { confirmAction } from '@/lib/confirm';
import { colors, fonts, radius, spacing } from '@/theme';
import type { Team, TeamMember } from '@/types/models';

const podium = ['#FFC83D', '#C0C7D1', '#CD7F32'];

/** Écran « Mon Écurie » : carte héros, candidatures, classement interne, réglages ; ou création et candidatures. */
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
  const leave = useLeaveTeam();
  const myRole = team.members.find((m) => m.pilot.id === userId)?.role;
  const isPrincipal = myRole === 'team_principal';
  const staff = isStaff(myRole);
  const unread = conversations.data?.find((c) => c.id === team.conversation_id)?.unread ?? 0;

  function confirmLeave() {
    const last = team.members.length === 1;
    const message = last
      ? 'Tu es le dernier pilote : l’écurie sera dissoute.'
      : isPrincipal
        ? 'Un Directeur Sportif (ou à défaut le pilote le plus ancien) deviendra Team Principal.'
        : 'Tu pourras rejoindre une autre écurie.';
    confirmAction(`Quitter ${team.name} ?`, message, 'Quitter', () => leave.mutate());
  }

  return (
    <>
      <TeamCard
        team={team}
        unread={unread}
        onChat={() => team.conversation_id && router.push({ pathname: '/radio/[id]', params: { id: team.conversation_id } })}
        onInvite={staff ? () => router.push('/team/invite') : undefined}
      />

      {staff ? <Applications team={team} /> : null}

      <SectionTitle
        title="Classement interne"
        detail={`${team.members.length} pilote${team.members.length > 1 ? 's' : ''}`}
        accent={team.color}
      />
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
                {m.role === 'team_principal' ? <Icon name={icons.crown} size={16} color={team.color} /> : null}
                {m.role === 'directeur_sportif' ? <Icon name={icons.premium} size={16} color={team.color} /> : null}
                <Text style={styles.elo}>{m.pilot.elo}</Text>
              </View>
            }
          />
        ))}
      </View>

      {staff ? <SentInvites team={team} /> : null}
      {isPrincipal ? <Recruitment team={team} /> : null}
      {isPrincipal ? <TeamLook team={team} /> : null}
      {staff && team.members.length > 1 ? <Staffing team={team} myRole={myRole!} /> : null}

      {leave.error ? <Text style={styles.error}>{(leave.error as Error).message}</Text> : null}
      <Button title="Quitter l’écurie" variant="quiet" loading={leave.isPending} onPress={confirmLeave} />
    </>
  );
}

/** Candidatures reçues (staff). */
function Applications({ team }: { team: Team }) {
  const applications = useTeamApplications(team.id);
  const respond = useRespondApplication();
  const list = applications.data ?? [];
  if (list.length === 0) return null;

  return (
    <>
      <SectionTitle title="Candidatures" detail={`${list.length}`} accent={colors.orange} />
      {list.map((a) => (
        <Card key={a.id} style={styles.application}>
          <PilotRow
            pilotId={a.applicant.id}
            username={a.applicant.username}
            avatarUrl={a.applicant.avatar_url}
            rank={a.applicant.rank}
            elo={a.applicant.elo}
            subtitle={`${a.applicant.elo} ELO`}
          />
          {a.message ? <Text style={styles.quote}>« {a.message} »</Text> : null}
          <View style={styles.actions}>
            <Button
              title="Refuser"
              variant="secondary"
              style={styles.flex}
              disabled={respond.isPending}
              onPress={() => respond.mutate({ id: a.id, accept: false })}
            />
            <Button title="Signer" style={styles.flex} loading={respond.isPending} onPress={() => respond.mutate({ id: a.id, accept: true })} />
          </View>
        </Card>
      ))}
      {respond.error ? <Text style={styles.error}>{(respond.error as Error).message}</Text> : null}
    </>
  );
}

function SentInvites({ team }: { team: Team }) {
  const sent = useSentTeamInvites(team.id);
  if (!sent.data || sent.data.length === 0) return null;
  return (
    <>
      <SectionTitle title="Recrutement en cours" detail={`${sent.data.length}`} accent={team.color} />
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
  );
}

/** Recrutement ouvert (Team Principal) : l'écurie apparaît dans « Écuries qui recrutent ». */
function Recruitment({ team }: { team: Team }) {
  const setRecruiting = useSetRecruiting();
  const [message, setMessage] = useState(team.recruiting_message ?? '');
  const dirty = message.trim() !== (team.recruiting_message ?? '');

  return (
    <>
      <SectionTitle title="Recrutement ouvert" accent={team.color} />
      <Card style={styles.look}>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.switchTitle}>{team.recruiting ? 'L’écurie recrute' : 'Recrutement fermé'}</Text>
            <Text variant="caption">
              {team.recruiting
                ? 'Les pilotes sans écurie te trouvent dans « Écuries qui recrutent » et peuvent postuler.'
                : 'Ouvre le recrutement pour recevoir des candidatures.'}
            </Text>
          </View>
          <Switch
            value={team.recruiting}
            disabled={setRecruiting.isPending}
            onValueChange={(open) => setRecruiting.mutate({ open, message })}
            trackColor={{ true: team.color, false: colors.surfaceAlt }}
            thumbColor={colors.text}
          />
        </View>
        {team.recruiting ? (
          <>
            <Input
              label="Annonce (optionnel)"
              value={message}
              onChangeText={setMessage}
              maxLength={140}
              placeholder="On roule tous les samedis, niveau Argent minimum"
            />
            {dirty ? (
              <Button
                title="Publier l’annonce"
                variant="secondary"
                loading={setRecruiting.isPending}
                onPress={() => setRecruiting.mutate({ open: true, message })}
              />
            ) : null}
          </>
        ) : null}
        {setRecruiting.error ? <Text style={styles.error}>{(setRecruiting.error as Error).message}</Text> : null}
      </Card>
    </>
  );
}

/** Couleurs et blason de l'écurie (Team Principal). */
function TeamLook({ team }: { team: Team }) {
  const setColor = useSetTeamColor();
  const setLogo = useSetTeamLogo();
  const [pickError, setPickError] = useState<string | null>(null);

  async function changeLogo() {
    setPickError(null);
    try {
      const uri = await pickSquarePhoto();
      if (uri) setLogo.mutate({ teamId: team.id, logoUri: uri });
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Impossible d’ouvrir les photos.');
    }
  }

  const error = (setColor.error ?? setLogo.error) as Error | null;
  return (
    <>
      <SectionTitle title="Couleurs et blason" accent={team.color} />
      <Card style={styles.look}>
        <TeamColorPicker
          value={team.color}
          disabled={setColor.isPending}
          onChange={(color) => color !== team.color && setColor.mutate({ teamId: team.id, color })}
        />
        <Text variant="caption">Les couleurs habillent le blason et le tag affiché à côté du pseudo de tes pilotes.</Text>
        <Button
          title={team.logo_url ? 'Changer le blason' : 'Ajouter un blason'}
          variant="secondary"
          loading={setLogo.isPending}
          onPress={changeLogo}
        />
        {pickError || error ? <Text style={styles.error}>{pickError ?? error?.message}</Text> : null}
      </Card>
    </>
  );
}

/**
 * Gestion des pilotes. Le Team Principal nomme ou rétrograde les Directeurs Sportifs et libère n'importe qui ;
 * un Directeur Sportif ne libère que des Pilotes officiels.
 */
function Staffing({ team, myRole }: { team: Team; myRole: TeamMember['role'] }) {
  const { userId } = useAuth();
  const setRole = useSetMemberRole();
  const kick = useKickTeamMember();
  const isPrincipal = myRole === 'team_principal';
  const others = team.members.filter((m) => m.pilot.id !== userId && m.role !== 'team_principal');
  if (others.length === 0) return null;

  function confirmKick(m: TeamMember) {
    confirmAction(`Libérer ${m.pilot.username} ?`, 'Il quittera l’écurie et son canal radio.', 'Libérer', () => kick.mutate(m.pilot.id));
  }

  const error = (setRole.error ?? kick.error) as Error | null;
  return (
    <>
      <SectionTitle title="Gestion des pilotes" accent={team.color} />
      <Card style={styles.staffing}>
        {others.map((m) => {
          const canKick = isPrincipal || m.role === 'pilote_officiel';
          return (
            <View key={m.pilot.id} style={styles.staffRow}>
              <View style={styles.flex}>
                <Text style={styles.staffName} numberOfLines={1}>
                  {m.pilot.username}
                </Text>
                <Text variant="caption">{roleLabel[m.role]}</Text>
              </View>
              {isPrincipal ? (
                <Chip
                  title={m.role === 'directeur_sportif' ? 'Rétrograder' : 'Nommer DS'}
                  color={team.color}
                  disabled={setRole.isPending}
                  onPress={() =>
                    setRole.mutate({ pilotId: m.pilot.id, role: m.role === 'directeur_sportif' ? 'pilote_officiel' : 'directeur_sportif' })
                  }
                />
              ) : null}
              {canKick ? <Chip title="Libérer" danger disabled={kick.isPending} onPress={() => confirmKick(m)} /> : null}
            </View>
          );
        })}
        <Text variant="caption">
          {isPrincipal
            ? 'Un Directeur Sportif recrute, traite les candidatures et libère les Pilotes officiels. Couleurs, blason et rôles restent entre tes mains.'
            : 'En tant que Directeur Sportif, tu peux libérer les Pilotes officiels.'}
        </Text>
      </Card>
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
    </>
  );
}

function NoTeam() {
  const invites = useMyTeamInvites();
  const respond = useRespondTeamInvite();
  const applications = useMyApplications();
  const cancel = useCancelApplication();
  const [answering, setAnswering] = useState<string | null>(null);

  return (
    <>
      <View style={styles.empty}>
        <TeamCrest tag="?" logoUrl={null} size={96} />
        <Text variant="title" style={styles.emptyTitle}>
          Sans écurie
        </Text>
        <Text variant="caption" style={styles.emptyText}>
          Fonde ton écurie ou postule dans une écurie qui recrute. L’ELO de l’écurie est la moyenne de ses pilotes.
        </Text>
      </View>
      <Button
        title="Écuries qui recrutent"
        size="lg"
        icon={<Icon name={icons.recruit} size={20} color={colors.onNeon} />}
        onPress={() => router.push('/teams')}
      />
      <Button
        title="Fonder une écurie"
        variant="secondary"
        icon={<Icon name={icons.team} size={18} color={colors.text} />}
        onPress={() => router.push('/team/new')}
      />

      {invites.data && invites.data.length > 0 ? (
        <>
          <SectionTitle title="Invitations reçues" detail={`${invites.data.length}`} />
          {invites.data.map((inv) => (
            <Card key={inv.id} style={[styles.invite, { borderLeftColor: inv.team.color }]}>
              <View style={styles.inviteHeader}>
                <TeamCrest tag={inv.team.tag} logoUrl={inv.team.logo_url} color={inv.team.color} size={48} />
                <View style={styles.inviteText}>
                  <Text variant="heading" numberOfLines={1}>
                    {inv.team.name}
                  </Text>
                  <Text variant="caption">
                    {inv.team.tag}
                    {inv.invited_by ? ` · recruté par ${inv.invited_by.username}` : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.actions}>
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

      {applications.data && applications.data.length > 0 ? (
        <>
          <SectionTitle title="Mes candidatures" detail={`${applications.data.length}/3`} />
          {applications.data.map((a) => (
            <View key={a.id} style={[styles.applicationRow, { borderLeftColor: a.team.color }]}>
              {/* Deux zones distinctes : ouvrir l'écurie, ou retirer la candidature (pas de bouton dans un bouton). */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Voir ${a.team.name}`}
                onPress={() => router.push({ pathname: '/team/[id]', params: { id: a.team.id } })}
                style={({ pressed }) => [styles.applicationLink, pressed && styles.pressed]}>
                <TeamCrest tag={a.team.tag} logoUrl={a.team.logo_url} color={a.team.color} size={40} />
                <View style={styles.flex}>
                  <Text style={styles.staffName} numberOfLines={1}>
                    {a.team.name}
                  </Text>
                  <Text variant="caption">En attente de réponse du staff</Text>
                </View>
              </Pressable>
              <Chip title="Retirer" disabled={cancel.isPending} onPress={() => cancel.mutate(a.id)} danger />
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}

function Chip({ title, onPress, disabled, color, danger }: { title: string; onPress: () => void; disabled?: boolean; color?: string; danger?: boolean }) {
  const tone = danger ? colors.danger : (color ?? colors.neon);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.chip, { borderColor: tone }, (pressed || disabled) && styles.pressed]}>
      <Text style={[styles.chipText, { color: tone }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  position: { width: 26, textAlign: 'center', fontFamily: fonts.display, fontSize: 22 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  elo: { fontFamily: fonts.display, fontSize: 20, color: colors.text, fontVariant: ['tabular-nums'] },
  application: { gap: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.orange },
  quote: { fontStyle: 'italic', color: colors.textMuted },
  pending: { gap: spacing.md },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pendingName: { flex: 1, fontWeight: '700' },
  look: { gap: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchTitle: { fontWeight: '800', fontSize: 16 },
  staffing: { gap: spacing.md },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  staffName: { fontWeight: '800' },
  chip: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  chipText: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  emptyTitle: { textAlign: 'center' },
  emptyText: { textAlign: 'center', maxWidth: 320 },
  invite: { gap: spacing.lg, borderLeftWidth: 3, borderRadius: radius.lg },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  inviteText: { flex: 1, gap: 2 },
  applicationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
  },
  applicationLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  error: { color: colors.danger },
});
