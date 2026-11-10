import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

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
import { TIME_ATTACK_ENABLED } from '@/features/time-attack/config';
import { useMyTournamentInvites, useMyTournaments, useOpenTournaments } from '@/features/tournaments/api';
import { TournamentCard } from '@/features/tournaments/components/tournament-card';
import { Text } from '@/components/ui/text';

type Filter = 'received' | 'sent' | 'races' | 'tournaments';

export default function ChallengesScreen() {
  const { userId } = useAuth();
  const [filter, setFilter] = useState<Filter>('received');
  const challenges = useMyChallenges();
  const races = useMyRaces();
  const myTournaments = useMyTournaments();
  const openTournaments = useOpenTournaments();
  const tournamentInvites = useMyTournamentInvites();

  const list = (challenges.data ?? []).filter((c) =>
    filter === 'received' ? c.opponent_id === userId : c.challenger_id === userId,
  );
  // Les courses closes (refusées, annulées) n'encombrent pas la liste.
  const raceList = (races.data ?? []).filter((r) => userId && raceStep(r, userId) !== 'closed');

  // Tournois ouverts où je ne suis pas encore inscrit (les miens sont déjà listés au-dessus).
  const invitedIds = new Set((tournamentInvites.data ?? []).map((t) => t.id));
  const joinable = (openTournaments.data ?? []).filter(
    (t) => !t.is_private && !invitedIds.has(t.id) && !t.entries.some((e) => e.pilot_id === userId),
  );

  const active = filter === 'races' ? races : filter === 'tournaments' ? myTournaments : challenges;
  const refresh = () => {
    active.refetch();
    if (filter === 'tournaments') {
      openTournaments.refetch();
      tournamentInvites.refetch();
    }
  };

  return (
    <Screen subtitle="Grille de départ" title="Défis" refreshing={active.isRefetching} onRefresh={refresh}>
      <Segmented
        options={[
          { value: 'received', label: 'Reçus' },
          { value: 'sent', label: 'Envoyés' },
          { value: 'races', label: 'Courses' },
          { value: 'tournaments', label: 'Tournois' },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {filter === 'tournaments' ? (
        <>
          <Button title="Organiser un tournoi" onPress={() => router.push('/tournament/new')} />
          {(tournamentInvites.data ?? []).length > 0 ? (
            <>
              <Text variant="label">Invitations · {tournamentInvites.data!.length}</Text>
              {tournamentInvites.data!.map((t) => (
                <View key={t.id} style={{ gap: 4 }}>
                  <Text variant="caption">{t.invited_by_name ?? 'Un pilote'} t’invite :</Text>
                  <TournamentCard tournament={t} myId={userId!} />
                </View>
              ))}
            </>
          ) : null}
          {myTournaments.isPending ? <Loading /> : null}
          {myTournaments.error ? <ErrorState error={myTournaments.error} /> : null}
          {(myTournaments.data ?? []).map((t) => (
            <TournamentCard key={t.id} tournament={t} myId={userId!} />
          ))}
          <Text variant="label">Inscriptions ouvertes</Text>
          {openTournaments.error ? <ErrorState error={openTournaments.error} /> : null}
          {openTournaments.data && joinable.length === 0 ? (
            <EmptyState
              title="Aucun tournoi ouvert"
              message="Organise le premier : un tableau de 8 ou 16 pilotes sur ton circuit, et un trophée pour le vainqueur."
            />
          ) : null}
          {joinable.map((t) => (
            <TournamentCard key={t.id} tournament={t} myId={userId!} />
          ))}
        </>
      ) : filter === 'races' ? (
        <>
          <Button title="Organiser une course" onPress={() => router.push('/race/new')} />
          {TIME_ATTACK_ENABLED ? (
            <Button title="Time Attack solo" variant="secondary" onPress={() => router.push('/time-attack')} />
          ) : null}
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
