import { useState } from 'react';

import { Segmented } from '@/components/ui/segmented';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { useAuth } from '@/features/auth/auth-provider';
import { useMyChallenges } from '@/features/challenges/api';
import { ChallengeCard } from '@/features/challenges/components/challenge-card';

type Filter = 'received' | 'sent';

export default function ChallengesScreen() {
  const { userId } = useAuth();
  const [filter, setFilter] = useState<Filter>('received');
  const challenges = useMyChallenges();

  const list = (challenges.data ?? []).filter((c) =>
    filter === 'received' ? c.opponent_id === userId : c.challenger_id === userId,
  );

  return (
    <Screen subtitle="Grille de départ" title="Défis" refreshing={challenges.isRefetching} onRefresh={challenges.refetch}>
      <Segmented
        options={[
          { value: 'received', label: 'Reçus' },
          { value: 'sent', label: 'Envoyés' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {challenges.isPending ? <Loading /> : null}
      {challenges.error ? <ErrorState error={challenges.error} /> : null}
      {challenges.data && list.length === 0 ? (
        <EmptyState
          title={filter === 'received' ? 'Aucun défi reçu' : 'Aucun défi envoyé'}
          message="Va dans l’onglet Pilotes pour trouver un adversaire près de chez toi."
        />
      ) : null}
      {list.map((c) => (
        <ChallengeCard key={c.id} challenge={c} myId={userId!} linked />
      ))}
    </Screen>
  );
}
