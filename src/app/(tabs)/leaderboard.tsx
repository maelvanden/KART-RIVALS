import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Chips } from '@/components/ui/chips';
import { Segmented } from '@/components/ui/segmented';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { useLeaderboard, usePilotStandings, type LeaderboardScope } from '@/features/leaderboard/api';
import { StandingsCard } from '@/features/leaderboard/components/standings-card';
import { useApproxLocation } from '@/features/nearby/api';
import { DEPARTMENT_NAMES, REGIONS, ofDepartment, ofRegion, regionOfDepartment } from '@/lib/regions';
import { colors } from '@/theme';

const podium = ['#FFC83D', '#C0C7D1', '#CD7F32'];

type Tab = 'department' | 'region' | 'local' | 'global';

export default function LeaderboardScreen() {
  const { userId } = useAuth();
  const [tab, setTab] = useState<Tab>('global');
  // Région / département consultés : null = ceux du pilote connecté.
  const [region, setRegion] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const location = useApproxLocation();
  const standings = usePilotStandings(userId);
  const mine = standings.data;

  const shownRegion = region ?? mine?.region ?? null;
  const shownDepartment = department ?? mine?.department ?? null;
  // Départements proposés : ceux de la région du département affiché (ou de la mienne).
  const departmentRegion = regionOfDepartment(shownDepartment) ?? mine?.region ?? null;
  const departments = REGIONS.find((r) => r.name === departmentRegion)?.departments ?? [];

  const scope: LeaderboardScope | null =
    tab === 'global'
      ? { kind: 'global' }
      : tab === 'local'
        ? location.data
          ? { kind: 'local', ...location.data }
          : null
        : tab === 'region'
          ? shownRegion
            ? { kind: 'region', code: shownRegion }
            : null
          : shownDepartment
            ? { kind: 'department', code: shownDepartment }
            : null;
  const board = useLeaderboard(scope);

  const title =
    tab === 'region' && shownRegion
      ? `Classement ${ofRegion(shownRegion)}`
      : tab === 'department' && shownDepartment
        ? `Classement ${ofDepartment(shownDepartment)}`
        : null;

  return (
    <Screen
      subtitle="Championnat"
      title="Classement"
      refreshing={board.isRefetching}
      onRefresh={() => {
        board.refetch();
        standings.refetch();
      }}>
      {userId ? (
        <StandingsCard
          pilotId={userId}
          isMe
          active={tab === 'local' ? undefined : tab}
          onSelect={(s) => {
            setTab(s);
            setRegion(null);
            setDepartment(null);
          }}
        />
      ) : null}

      <Segmented
        options={[
          { value: 'department', label: 'Dépt' },
          { value: 'region', label: 'Région' },
          { value: 'local', label: '50 km' },
          { value: 'global', label: 'France' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'region' ? (
        <Chips
          options={[...REGIONS]
            .sort((a, b) => Number(b.name === mine?.region) - Number(a.name === mine?.region))
            .map((r) => ({ value: r.name, label: r.name === mine?.region ? `${r.name} · moi` : r.name }))}
          value={shownRegion}
          onChange={setRegion}
        />
      ) : null}
      {tab === 'department' && departments.length > 0 ? (
        <Chips
          options={departments.map((d) => ({
            value: d,
            label: `${DEPARTMENT_NAMES[d] ?? d}${d === mine?.department ? ' · moi' : ''}`,
          }))}
          value={shownDepartment}
          onChange={setDepartment}
        />
      ) : null}
      {title ? <Text variant="label">{title}</Text> : null}

      {board.isLoading ? <Loading /> : null}
      {board.error ? <ErrorState error={board.error} /> : null}
      {tab === 'local' && location.data === null ? (
        <EmptyState title="Localisation désactivée" message="Active-la pour voir le classement autour de toi." />
      ) : null}
      {(tab === 'region' && !shownRegion) || (tab === 'department' && !shownDepartment) ? (
        <EmptyState
          title="Région inconnue"
          message={
            tab === 'region'
              ? 'Choisis une région ci-dessus, ou ton circuit favori dans ton profil pour voir la tienne.'
              : 'Choisis ton circuit favori dans ton profil pour voir le classement de ton département.'
          }
        />
      ) : null}
      {board.data?.length === 0 ? (
        <EmptyState
          title="Classement vide"
          message={tab === 'global' ? 'Valide ton premier match pour y apparaître !' : 'Aucun pilote classé ici pour l’instant : sois le premier !'}
        />
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
