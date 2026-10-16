import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { withAlpha } from '@/features/social/colors';
import { SectionTitle } from '@/features/social/components/section-title';
import { TeamCard } from '@/features/social/components/team-card';
import { useApplyToTeam, useCancelApplication, useMyApplications, useTeam } from '@/features/social/recruitment';
import { roleLabel } from '@/features/social/roles';
import { TEAM_MAX_MEMBERS, useMyTeam } from '@/features/social/teams';
import { colors, radius, spacing } from '@/theme';
import type { Team } from '@/types/models';

/** Page publique d'une écurie : identité, annonce de recrutement, effectif, et « Postuler ». */
export default function TeamPublicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const team = useTeam(id);
  const mine = useMyTeam();

  if (mine.data?.id === id) return <Redirect href="/team" />;

  return (
    <Screen safeTop={false} refreshing={team.isRefetching} onRefresh={team.refetch}>
      <Stack.Screen options={{ title: team.data?.name ?? 'Écurie' }} />
      {team.isPending ? <Loading /> : null}
      {team.error ? <ErrorState error={team.error} /> : null}
      {team.data === null ? <EmptyState title="Écurie introuvable" /> : null}
      {team.data ? <TeamPublic team={team.data} hasTeam={!!mine.data} /> : null}
    </Screen>
  );
}

function TeamPublic({ team, hasTeam }: { team: Team; hasTeam: boolean }) {
  const applications = useMyApplications();
  const apply = useApplyToTeam();
  const cancel = useCancelApplication();
  const [message, setMessage] = useState('');
  const pending = applications.data?.find((a) => a.team_id === team.id);
  const full = team.members.length >= TEAM_MAX_MEMBERS;
  const error = (apply.error ?? cancel.error) as Error | null;

  return (
    <>
      <TeamCard team={team} kicker="Écurie" />

      {team.recruiting ? (
        <Card style={[styles.recruiting, { borderColor: team.color, backgroundColor: withAlpha(team.color, 0.06) }]}>
          <View style={styles.recruitingHeader}>
            <Icon name={icons.recruit} size={18} color={team.color} />
            <Text style={[styles.recruitingTitle, { color: team.color }]}>Recrute</Text>
          </View>
          {team.recruiting_message ? <Text>{team.recruiting_message}</Text> : null}

          {hasTeam ? (
            <Text variant="caption">Tu cours déjà pour une écurie : quitte-la pour postuler ici.</Text>
          ) : pending ? (
            <>
              <Text variant="caption">Candidature envoyée, le staff va te répondre.</Text>
              <Button title="Retirer ma candidature" variant="quiet" loading={cancel.isPending} onPress={() => cancel.mutate(pending.id)} />
            </>
          ) : full ? (
            <Text variant="caption">L’écurie est complète pour le moment.</Text>
          ) : (
            <>
              <Input
                label="Message au staff (optionnel)"
                value={message}
                onChangeText={setMessage}
                maxLength={280}
                multiline
                placeholder="Ton circuit, tes disponibilités, ton meilleur chrono…"
              />
              <Button
                title="Postuler"
                size="lg"
                loading={apply.isPending}
                onPress={() => apply.mutate({ teamId: team.id, message }, { onSuccess: () => setMessage('') })}
              />
            </>
          )}
          {error ? <Text style={styles.error}>{error.message}</Text> : null}
        </Card>
      ) : (
        <Text variant="caption" style={styles.closed}>
          Cette écurie ne recrute pas en ce moment. Son staff peut toutefois t’inviter directement.
        </Text>
      )}

      <SectionTitle title="Effectif" detail={`${team.members.length}/${TEAM_MAX_MEMBERS}`} accent={team.color} />
      <View style={styles.list}>
        {team.members.map((m) => (
          <PilotRow
            key={m.pilot.id}
            pilotId={m.pilot.id}
            username={m.pilot.username}
            avatarUrl={m.pilot.avatar_url}
            rank={m.pilot.rank}
            elo={m.pilot.elo}
            subtitle={roleLabel[m.role]}
          />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  recruiting: { gap: spacing.md, borderWidth: 1, borderLeftWidth: 3, borderRadius: radius.lg },
  recruitingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recruitingTitle: { fontWeight: '800', fontSize: 16, textTransform: 'uppercase', letterSpacing: 1 },
  closed: { textAlign: 'center' },
  list: { gap: spacing.sm },
  error: { color: colors.danger },
});
