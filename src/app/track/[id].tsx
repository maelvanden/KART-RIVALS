import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useMyProfile, useUpdateProfile } from '@/features/profile/api';
import { useTrack, useTrackLapRecords, useTrackLeaderboard } from '@/features/tracks/api';
import { TrackEvents } from '@/features/events/components/track-events';
import { TrackManageLink } from '@/features/admin/components/track-manage-link';
import { TrackReviews } from '@/features/tracks/components/track-reviews';
import { WeatherCard } from '@/features/tracks/components/weather-card';
import { TrackSessions } from '@/features/sessions/components/track-sessions';
import { TrackHero } from '@/features/tracks/components/track-hero';
import { TrackGallery } from '@/features/tracks/components/track-gallery';
import { TrackLapRecords } from '@/features/tracks/components/track-lap-records';
import { TrackLayoutCard } from '@/features/tracks/components/track-layout-card';
import { TrackLinks } from '@/features/tracks/components/track-links';
import { TrackMap } from '@/features/tracks/components/track-map';
import { colors, spacing } from '@/theme';
import type { TrackDetails } from '@/types/models';

const podium = ['#FFC83D', '#C0C7D1', '#CD7F32'];

/** Itinéraire vers le complexe : recherche par nom + adresse (le GPS tombe sur l'entrée), sinon les coordonnées. */
function directionsUrl(t: TrackDetails) {
  const place = t.address ? [t.name, t.address, [t.postal_code, t.city].filter(Boolean).join(' ')].join(', ') : null;
  const dest = encodeURIComponent(place ?? `${t.lat},${t.lng}`);
  return Platform.OS === 'ios'
    ? `https://maps.apple.com/?daddr=${dest}`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

export default function TrackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const track = useTrack(id);
  const board = useTrackLeaderboard(id);
  const laps = useTrackLapRecords(id);
  const profile = useMyProfile();
  const update = useUpdateProfile();

  const t = track.data;
  const isFavorite = !!t && profile.data?.home_track_id === t.id;

  return (
    <Screen
      safeTop={false}
      refreshing={board.isRefetching}
      onRefresh={() => {
        board.refetch();
        laps.refetch();
      }}>
      {/* L'en-tête photo remplace la barre de navigation une fois le circuit chargé. */}
      <Stack.Screen options={{ title: t?.name ?? 'Circuit', headerShown: !t }} />
      {track.isPending ? <Loading /> : null}
      {track.error ? <ErrorState error={track.error} /> : null}
      {track.data === null ? <EmptyState title="Circuit introuvable" /> : null}
      {t ? (
        <>
          <TrackHero track={t} />

          <Card style={styles.info}>
            <Text variant="caption">
              {[t.address, [t.postal_code, t.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
            </Text>
            <View style={styles.facts}>
              <Fact label="Piste" value={t.length_m ? `${t.length_m.toLocaleString('fr-FR')} m` : '—'} />
              <Fact label="Karts" value={t.kart_power ?? '—'} />
              <Fact label="Département" value={t.region ?? '—'} />
            </View>
            {t.description ? <Text style={styles.description}>{t.description}</Text> : null}
          </Card>

          <TrackLinks track={t} />
          <WeatherCard track={t} />
          <TrackMap tracks={[t]} height={160} selectedId={t.id} />

          <View style={styles.actions}>
            <Button
              title="Itinéraire"
              variant="secondary"
              style={styles.action}
              onPress={() => Linking.openURL(directionsUrl(t))}
            />
            <Button
              title={isFavorite ? '★ Favori' : '☆ Favori'}
              // Une seule action Volt quand la réservation est proposée.
              variant={isFavorite ? 'ghost' : t.booking_url || t.phone ? 'secondary' : 'primary'}
              style={styles.action}
              loading={update.isPending}
              disabled={isFavorite}
              onPress={() => update.mutate({ home_track_id: t.id })}
            />
          </View>

          <TrackSessions trackId={t.id} />
          <TrackEvents trackId={t.id} />
          <TrackLayoutCard track={t} />
          <TrackGallery trackId={t.id} trackName={t.name} />
          <TrackReviews trackId={t.id} trackName={t.name} />

          <Text variant="label">Records du tour</Text>
          {laps.isPending ? <Loading /> : null}
          {laps.error ? <ErrorState error={laps.error} /> : null}
          {laps.data?.length === 0 ? (
            <EmptyState
              title="Aucun chrono validé"
              message="Le premier défi au format « meilleur tour » validé ici établira le record."
            />
          ) : null}
          {laps.data && laps.data.length > 0 ? <TrackLapRecords records={laps.data} myId={profile.data?.id} /> : null}

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
          <TrackManageLink trackId={t.id} trackName={t.name} />
          <Button
            title="Signaler une erreur sur cette fiche"
            variant="quiet"
            icon={<Icon name={icons.report} size={16} color={colors.textMuted} />}
            onPress={() => router.push({ pathname: '/track/correction', params: { id: t.id } })}
          />
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
  facts: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  fact: { gap: 2, minWidth: 80 },
  factValue: { fontSize: 16, fontWeight: '800' },
  description: { color: colors.textMuted, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
  position: { width: 28, textAlign: 'center', fontSize: 20, fontWeight: '900', fontStyle: 'italic' },
});
