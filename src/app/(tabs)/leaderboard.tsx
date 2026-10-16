import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Segmented } from '@/components/ui/segmented';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { useLeaderboard } from '@/features/leaderboard/api';
import { useApproxLocation } from '@/features/nearby/api';
import { colors } from '@/theme';

const podium = ['#FFC83D', '#C0C7D1', '#CD7F32'];

export default function LeaderboardScreen() {
  const { userId } = useAuth();
  const [scope, setScope] = useState<'local' | 'global'>('global');
  const location = useApproxLocation();
  const board = useLeaderboard(
    scope === 'global' ? { kind: 'global' } : location.data ? { kind: 'local', ...location.data } : null,
  );

  return (
    <Screen subtitle="Championnat" title="Classement" refreshing={board.isRefetching} onRefresh={board.refetch}>
      <Segmented
        options={[
          { value: 'local', label: 'Local · 50 km' },
          { value: 'global', label: 'Général' },
        ]}
        value={scope}
        onChange={setScope}
      />
      {board.isLoading ? <Loading /> : null}
      {board.error ? <ErrorState error={board.error} /> : null}
      {scope === 'local' && location.data === null ? (
        <EmptyState title="Localisation désactivée" message="Active-la pour voir le classement de ta région." />
      ) : null}
      {board.data?.length === 0 ? (
        <EmptyState title="Classement vide" message="Valide ton premier match pour y apparaître !" />
      ) : null}
      {board.data?.map((entry) => (
        <PilotRow
          key={entry.id}
          pilotId={entry.id}
          username={entry.username}
          avatarUrl={entry.avatar_url}
          rank={entry.rank}
          elo={entry.elo}
          subtitle={`${entry.wins} V · ${entry.losses} D`}
          highlighted={entry.id === userId}
          leading={
            <Text style={[styles.position, { color: podium[entry.position - 1] ?? colors.textMuted }]}>
              {entry.position}
            </Text>
          }
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  position: { width: 28, textAlign: 'center', fontSize: 20, fontWeight: '900', fontStyle: 'italic' },
});
