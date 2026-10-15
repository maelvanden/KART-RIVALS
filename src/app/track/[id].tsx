import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useMyProfile, useUpdateProfile } from '@/features/profile/api';
import { useTrack, useTrackLeaderboard } from '@/features/tracks/api';
import { TrackMap } from '@/features/tracks/components/track-map';
import { TrackTypeBadge } from '@/features/tracks/components/track-row';
import { colors, spacing } from '@/theme';
import type { TrackDetails } from '@/types/models';

const podium = ['#FFC83D', '#C0C7D1', '#CD7F32'];

function directionsUrl(t: TrackDetails) {
  const dest = `${t.lat},${t.lng}`;
  return Platform.OS === 'ios'
    ? `https://maps.apple.com/?daddr=${dest}&q=${encodeURIComponent(t.name)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

export default function TrackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const track = useTrack(id);
  const board = useTrackLeaderboard(id);
  const profile = useMyProfile();
  const update = useUpdateProfile();

  const t = track.data;
  const isFavorite = !!t && profile.data?.home_track_id === t.id;

  return (
    <Screen safeTop={false} refreshing={board.isRefetching} onRefresh={board.refetch}>
      <Stack.Screen options={{ title: t?.name ?? 'Circuit' }} />
      {track.isPending ? <Loading /> : null}
      {track.error ? <ErrorState error={track.error} /> : null}
      {track.data === null ? <EmptyState title="Circuit introuvable" /> : null}
      {t ? (
        <>
          <TrackMap tracks={[t]} height={180} selectedId={t.id} />

          <Card style={styles.info}>
            <View style={styles.titleRow}>
              <Text variant="title" style={styles.title}>
                {t.name}
              </Text>
              <TrackTypeBadge indoor={t.is_indoor} />
            </View>
            <Text variant="caption">
              {[t.address, [t.postal_code, t.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
            </Text>
            <View style={styles.facts}>
              <Fact label="Piste" value={t.length_m ? `${t.length_m.toLocaleString('fr-FR')} m` : '—'} />
              <Fact label="Karts" value={t.kart_power ?? '—'} />
              <Fact label="Département" value={t.region ?? '—'} />
            </View>
          </Card>

          <View style={styles.actions}>
            <Button
              title="Itinéraire"
              variant="secondary"
              style={styles.action}
              onPress={() => Linking.openURL(directionsUrl(t))}
            />
            <Button
              title={isFavorite ? '★ Favori' : 'Circuit favori'}
              variant={isFavorite ? 'ghost' : 'primary'}
              style={styles.action}
              loading={update.isPending}
              disabled={isFavorite}
              onPress={() => update.mutate({ home_track_id: t.id })}
            />
          </View>

          <Text variant="label">Classement du circuit</Text>
          {board.isPending ? <Loading /> : null}
          {board.error ? <ErrorState error={board.error} /> : null}
          {board.data?.length === 0 ? (
            <EmptyState
              title="Aucun match validé ici"
              message="Lance un défi sur ce circuit depuis l’onglet Pilotes pour ouvrir le classement."
            />
          ) : null}
          {board.data?.map((p, i) => (
            <PilotRow
              key={p.id}
              pilotId={p.id}
              username={p.username}
              rank={p.rank}
              elo={p.elo}
              highlighted={p.id === profile.data?.id}
              subtitle={`${p.wins} victoire${p.wins > 1 ? 's' : ''} · ${p.matches} match${p.matches > 1 ? 's' : ''} ici`}
              leading={<Text style={[styles.position, { color: podium[i] ?? colors.textMuted }]}>{i + 1}</Text>}
            />
          ))}
          {board.data && board.data.length > 0 ? (
            <Button title="Défier un pilote" variant="ghost" onPress={() => router.push('/nearby')} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text variant="label">{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  info: { gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { flexShrink: 1, fontSize: 24 },
  facts: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  fact: { gap: 2, minWidth: 80 },
  factValue: { fontSize: 16, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
  position: { width: 28, textAlign: 'center', fontSize: 20, fontWeight: '900', fontStyle: 'italic' },
});
