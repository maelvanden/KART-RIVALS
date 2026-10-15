import { router, Stack, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { useAuth } from '@/features/auth/auth-provider';
import { useBadgeStats, useEloHistory, useHeadToHead, usePilotMatches, useProfile } from '@/features/profile/api';
import { BadgesCard } from '@/features/profile/components/badges-card';
import { EloChart } from '@/features/profile/components/elo-chart';
import { HeadToHeadCard } from '@/features/profile/components/head-to-head-card';
import { LicenseCard } from '@/features/profile/components/license-card';
import { MatchHistory } from '@/features/profile/components/match-history';

export default function PilotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const profile = useProfile(id);
  const history = useEloHistory(id);
  const matches = usePilotMatches(id);
  const h2h = useHeadToHead(id);
  const badges = useBadgeStats(id);
  const isMe = id === userId;

  return (
    <Screen
      safeTop={false}
      refreshing={profile.isRefetching}
      onRefresh={() => {
        profile.refetch();
        history.refetch();
        matches.refetch();
        h2h.refetch();
        badges.refetch();
      }}>
      <Stack.Screen options={{ title: profile.data?.username ?? 'Pilote' }} />
      {profile.isPending ? <Loading /> : null}
      {profile.error ? <ErrorState error={profile.error} /> : null}
      {profile.data === null ? <EmptyState title="Pilote introuvable" /> : null}
      {profile.data ? (
        <>
          <LicenseCard profile={profile.data} />
          {!isMe && h2h.data ? <HeadToHeadCard h2h={h2h.data} rival={profile.data.username} /> : null}
          {!isMe ? (
            <Button
              title={`Défier ${profile.data.username}`}
              onPress={() =>
                router.push({
                  pathname: '/challenge/new',
                  params: { opponentId: profile.data!.id, username: profile.data!.username },
                })
              }
            />
          ) : null}
          {badges.data ? <BadgesCard stats={badges.data} /> : null}
          {history.data && history.data.length > 1 ? <EloChart points={history.data} /> : null}
          {matches.data ? <MatchHistory matches={matches.data} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
