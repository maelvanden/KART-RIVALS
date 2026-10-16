import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useSearchPilots } from '@/features/nearby/api';
import { useTeammates } from '@/features/social/friends';
import { useInviteToTeam, useMyTeam, useSentTeamInvites } from '@/features/social/teams';
import { colors, fonts, radius, spacing } from '@/theme';
import type { PilotSummary } from '@/types/models';

/** Recruter : coéquipiers d'abord, ou n'importe quel pilote par son @pseudo. */
export default function InviteToTeamScreen() {
  const team = useMyTeam();
  const sent = useSentTeamInvites(team.data?.id);
  const { teammates, isPending } = useTeammates();
  const [query, setQuery] = useState('');
  const search = useSearchPilots(query.replace(/^@/, ''));
  const invite = useInviteToTeam();
  const [lastInvited, setLastInvited] = useState<string | null>(null);

  const inTeam = new Set(team.data?.members.map((m) => m.pilot.id));
  const invited = new Set(sent.data?.map((p) => p.id));
  const searching = query.replace(/^@/, '').trim().length >= 2;
  const candidates: PilotSummary[] = searching
    ? (search.data ?? []).map(({ id, username, avatar_url, elo, rank }) => ({ id, username, avatar_url, elo, rank }))
    : teammates.map((f) => f.pilot);

  function recruit(p: PilotSummary) {
    setLastInvited(p.id);
    invite.mutate(p);
  }

  return (
    <Screen safeTop={false}>
      <Input
        label="Chercher un pilote"
        value={query}
        onChangeText={setQuery}
        placeholder="@pseudo"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text variant="label">{searching ? 'Résultats' : 'Tes coéquipiers'}</Text>

      {(searching ? search.isPending : isPending) ? <Loading /> : null}
      {!searching && !isPending && candidates.length === 0 ? (
        <EmptyState title="Pas encore de coéquipiers" message="Cherche un pilote par son @pseudo pour le recruter." />
      ) : null}
      {searching && search.data?.length === 0 ? <EmptyState title="Aucun pilote trouvé" /> : null}

      <View style={styles.list}>
        {candidates.map((p) => {
          const status = inTeam.has(p.id) ? 'Dans l’écurie' : invited.has(p.id) ? 'Invité' : null;
          return (
            <PilotRow
              key={p.id}
              pilotId={p.id}
              username={p.username}
              avatarUrl={p.avatar_url}
              rank={p.rank}
              elo={p.elo}
              subtitle={`${p.elo} ELO`}
              trailing={
                status ? (
                  <Text variant="caption" style={styles.status}>
                    {status}
                  </Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Recruter ${p.username}`}
                    disabled={invite.isPending}
                    onPress={() => recruit(p)}
                    style={({ pressed }) => [styles.recruit, pressed && styles.pressed]}>
                    <Text style={styles.recruitText}>{invite.isPending && lastInvited === p.id ? '…' : 'Recruter'}</Text>
                  </Pressable>
                )
              }
            />
          );
        })}
      </View>
      {invite.error ? <Text style={styles.error}>{(invite.error as Error).message}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  status: { color: colors.neon },
  recruit: {
    backgroundColor: colors.neon,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  recruitText: { fontFamily: fonts.display, fontSize: 14, letterSpacing: 1, color: colors.onNeon, textTransform: 'uppercase' },
  pressed: { opacity: 0.8 },
  error: { color: colors.danger },
});
