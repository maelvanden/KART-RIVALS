import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { useApproxLocation } from '@/features/nearby/api';
import { useOpenTournaments } from '@/features/tournaments/api';
import { TournamentCard } from '@/features/tournaments/components/tournament-card';
import { useTracksMap } from '@/features/tracks/api';
import { distanceKm } from '@/lib/geo';
import { spacing } from '@/theme';

/** Rayon des tournois proposés dans l'onglet Circuits. */
const NEARBY_KM = 100;
const CARD_WIDTH = 270;

/**
 * Onglet Circuits : tournois ouverts aux inscriptions à moins de 100 km, les officiels d'abord puis du plus proche au
 * plus loin. Rien ne s'affiche sans position ou sans tournoi dans le rayon.
 */
export function NearbyTournaments() {
  const { userId } = useAuth();
  const location = useApproxLocation();
  const tracks = useTracksMap();
  const open = useOpenTournaments();

  const list = useMemo(() => {
    const here = location.data;
    if (!here || !tracks.data || !open.data) return [];
    const byId = new Map(tracks.data.map((t) => [t.id, t]));
    return open.data
      .filter((t) => !t.is_private)
      .map((t) => {
        const track = byId.get(t.track.id);
        return { tournament: t, km: track ? distanceKm(here, track) : null };
      })
      .filter((x): x is { tournament: (typeof open.data)[number]; km: number } => x.km !== null && x.km <= NEARBY_KM)
      .sort((a, b) => Number(b.tournament.is_official) - Number(a.tournament.is_official) || a.km - b.km);
  }, [location.data, tracks.data, open.data]);

  if (!userId || list.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text variant="label">
        Tournois autour de toi · {list.length}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {list.map(({ tournament, km }) => (
          <TournamentCard key={tournament.id} tournament={tournament} myId={userId} km={km} width={CARD_WIDTH} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { gap: spacing.md, paddingRight: spacing.lg },
});
