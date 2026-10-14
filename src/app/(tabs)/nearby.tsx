import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { useApproxLocation, useNearbyPilots } from '@/features/nearby/api';
import { spacing } from '@/theme';

type Radius = '10' | '30' | '100';

export default function NearbyScreen() {
  const [radius, setRadius] = useState<Radius>('30');
  const location = useApproxLocation();
  const pilots = useNearbyPilots(location.data, Number(radius));

  return (
    <Screen subtitle="Autour de toi" title="Pilotes" refreshing={pilots.isRefetching} onRefresh={pilots.refetch}>
      <Segmented
        options={[
          { value: '10', label: '10 km' },
          { value: '30', label: '30 km' },
          { value: '100', label: '100 km' },
        ]}
        value={radius}
        onChange={setRadius}
      />
      {location.isPending || pilots.isLoading ? <Loading /> : null}
      {location.data === null ? (
        <EmptyState
          title="Localisation désactivée"
          message="Autorise la localisation pour trouver des pilotes près de toi. Seule une position approximative (~1 km) est partagée."
        />
      ) : null}
      {location.error ? <ErrorState error={location.error} /> : null}
      {pilots.error ? <ErrorState error={pilots.error} /> : null}
      {pilots.data?.length === 0 ? (
        <EmptyState title="Personne en piste ici" message="Élargis le rayon de recherche ou reviens plus tard." />
      ) : null}
      {pilots.data?.map((p) => (
        <PilotRow
          key={p.id}
          username={p.username}
          rank={p.rank}
          elo={p.elo}
          subtitle={`${p.distance_km} km · ${p.elo} ELO · ${p.wins}V ${p.losses}D`}
          trailing={<Button title="Défier" style={styles.challenge} />}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  challenge: { minHeight: 38, paddingHorizontal: spacing.lg },
});
