import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { useAuth } from '@/features/auth/auth-provider';
import { useMyChallenges } from '@/features/challenges/api';
import { ChallengeCard } from '@/features/challenges/components/challenge-card';
import { useMyRaces } from '@/features/races/api';
import { RaceCard } from '@/features/races/components/race-card';
import { raceStep } from '@/features/races/state';

type Filter = 'received' | 'sent' | 'races';

export default function ChallengesScreen() {
  const { userId } = useAuth();
  const [filter, setFilter] = useState<Filter>('received');
  const challenges = useMyChallenges();
  const races = useMyRaces();

  const list = (challenges.data ?? []).filter((c) =>
    filter === 'received' ? c.opponent_id === userId : c.challenger_id === userId,
  );
  // Les courses closes (refusées, annulées) n'encombrent pas la liste.
  const raceList = (races.data ?? []).filter((r) => userId && raceStep(r, userId) !== 'closed');

  const active = filter === 'races' ? races : challenges;

  return (
    <Screen subtitle="Grille de départ" title="Défis" refreshing={active.isRefetching} onRefresh={active.refetch}>
      <Segmented
        options={[
          { value: 'received', label: 'Reçus' },
          { value: 'sent', label: 'Envoyés' },
          { value: 'races', label: 'Courses' },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {filter === 'races' ? (
        <>
          <Button title="Organiser une course" onPress={() => router.push('/race/new')} />
          <Button title="Time Attack solo" variant="secondary" onPress={() => router.push('/time-attack')} />
          {races.isPending ? <Loading /> : null}
          {races.error ? <ErrorState error={races.error} /> : null}
          {races.data && raceList.length === 0 ? (
            <EmptyState title="Aucune course en cours" message="Invite 2 à 7 pilotes pour une course à plusieurs, de 3 à 8 karts." />
          ) : null}
          {raceList.map((r) => (
            <RaceCard key={r.id} race={r} myId={userId!} />
          ))}
        </>
      ) : (
        <>
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
        </>
      )}
    </Screen>
  );
}
