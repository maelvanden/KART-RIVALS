import { router, Stack, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { useAuth } from '@/features/auth/auth-provider';
import { VirtualGarage } from '@/features/garage/components/VirtualGarage';
import { StandingsCard } from '@/features/leaderboard/components/standings-card';
import {
  useBadgeStats,
  useEloHistory,
  useHeadToHead,
  usePilotLapRecords,
  usePilotMatches,
  useProfile,
} from '@/features/profile/api';
import { LapRecordsCard } from '@/features/profile/components/lap-records-card';
import { useMyLapProgress } from '@/features/lap-progress/api';
import { LapProgressCard } from '@/features/lap-progress/components/lap-progress-card';
import { BadgesCard } from '@/features/profile/components/badges-card';
import { EloChart } from '@/features/profile/components/elo-chart';
import { HeadToHeadCard } from '@/features/profile/components/head-to-head-card';
import { LicenseCard } from '@/features/profile/components/license-card';
import { MatchHistory } from '@/features/profile/components/match-history';
import { FollowButton } from '@/features/social/components/follow-button';
import { PilotSafety } from '@/features/social/components/pilot-safety';
import { useIsBlocked } from '@/features/social/safety';
import { usePilotTrophies } from '@/features/tournaments/api';
import { TrophyCabinet } from '@/features/tournaments/components/trophy-cabinet';

export default function PilotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const profile = useProfile(id);
  const history = useEloHistory(id);
  const matches = usePilotMatches(id);
  const h2h = useHeadToHead(id);
  const badges = useBadgeStats(id);
  const laps = usePilotLapRecords(id);
  const trophies = usePilotTrophies(id);
  const isMe = id === userId;
  // Historique détaillé des chronos : visible seulement sur sa propre fiche.
  const progress = useMyLapProgress();
  const blocked = useIsBlocked(id);
  const reachable = !isMe && !blocked;

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
        laps.refetch();
        trophies.refetch();
        if (isMe) progress.refetch();
      }}>
      <Stack.Screen options={{ title: profile.data?.username ?? 'Pilote' }} />
      {profile.isPending ? <Loading /> : null}
      {profile.error ? <ErrorState error={profile.error} /> : null}
      {profile.data === null ? <EmptyState title="Pilote introuvable" /> : null}
      {profile.data ? (
        <>
          <LicenseCard profile={profile.data} />
          <StandingsCard pilotId={profile.data.id} isMe={isMe} />
          {!isMe && h2h.data ? <HeadToHeadCard h2h={h2h.data} rival={profile.data.username} /> : null}
          {reachable ? (
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
          {reachable ? <FollowButton pilotId={profile.data.id} username={profile.data.username} /> : null}
          {!isMe ? (
            <PilotSafety
              pilot={{
                id: profile.data.id,
                username: profile.data.username,
                avatar_url: profile.data.avatar_url,
                elo: profile.data.elo,
                rank: profile.data.rank,
              }}
            />
          ) : null}
          <VirtualGarage profileId={profile.data.id} editable={isMe} />
          {trophies.data ? <TrophyCabinet trophies={trophies.data} /> : null}
          {badges.data ? <BadgesCard stats={badges.data} /> : null}
          {history.data && history.data.length > 1 ? <EloChart points={history.data} /> : null}
          {isMe && progress.data ? <LapProgressCard points={progress.data} /> : null}
          {laps.data ? <LapRecordsCard records={laps.data} isMe={isMe} /> : null}
          {matches.data ? <MatchHistory matches={matches.data} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
