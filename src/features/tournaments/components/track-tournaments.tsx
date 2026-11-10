import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useCanManageTrack } from '@/features/admin/api';
import { useAuth } from '@/features/auth/auth-provider';
import { useTrackTournaments } from '@/features/tournaments/api';
import { TournamentCard } from '@/features/tournaments/components/tournament-card';
import { colors, spacing } from '@/theme';

/** Fiche circuit : tournois à venir ou en cours ici (les officiels d'abord), et « Organiser un tournoi ici ». */
export function TrackTournaments({ trackId }: { trackId: string }) {
  const { userId } = useAuth();
  const tournaments = useTrackTournaments(trackId);
  const manages = useCanManageTrack(trackId);
  const list = tournaments.data ?? [];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text variant="label" style={styles.title}>
          Tournois à venir
        </Text>
        {list.length > 0 ? <Text variant="label">{list.length}</Text> : null}
      </View>
      {userId ? list.map((t) => <TournamentCard key={t.id} tournament={t} myId={userId} />) : null}
      {tournaments.data && list.length === 0 ? (
        <Text variant="caption">Aucun tournoi prévu ici pour l’instant.</Text>
      ) : null}
      <Button
        title={manages ? 'Organiser un tournoi officiel' : 'Organiser un tournoi ici'}
        variant="secondary"
        icon={<Icon name={icons.trophy} size={18} color={colors.text} />}
        onPress={() => router.push({ pathname: '/tournament/new', params: { trackId } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
});
