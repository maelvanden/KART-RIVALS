import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useApproxLocation } from '@/features/nearby/api';
import { useMyProfile } from '@/features/profile/api';
import { useCreateSession, type SessionVisibility } from '@/features/sessions/api';
import { useTracksMap } from '@/features/tracks/api';
import { TrackPicker } from '@/features/tracks/components/track-picker';
import { distanceKm } from '@/lib/geo';
import { nextDays } from '@/lib/schedule';
import { colors } from '@/theme';
import type { RaceFormat } from '@/types/models';

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const SPOTS = [2, 3, 4, 5, 6, 7, 8];

/** Proposer une session ouverte : circuit, créneau, places, format et qui peut la voir. */
export default function NewSessionScreen() {
  const params = useLocalSearchParams<{ trackId?: string }>();
  const tracks = useTracksMap();
  const location = useApproxLocation();
  const profile = useMyProfile();
  const create = useCreateSession();
  const days = useMemo(() => nextDays(14), []);
  // undefined = pas encore choisi : circuit favori par défaut.
  const [trackId, setTrackId] = useState<string | null | undefined>(params.trackId);
  const [day, setDay] = useState(days[0].value);
  const [hour, setHour] = useState(14);
  const [spots, setSpots] = useState(4);
  const [format, setFormat] = useState<RaceFormat>('position');
  const [visibility, setVisibility] = useState<SessionVisibility>('public');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const chosenTrack = trackId === undefined ? (profile.data?.home_track_id ?? null) : trackId;
  const sorted = useMemo(() => {
    const here = location.data;
    return [...(tracks.data ?? [])].sort((a, b) => (here ? distanceKm(here, a) - distanceKm(here, b) : a.name.localeCompare(b.name)));
  }, [tracks.data, location.data]);

  function submit() {
    setError(null);
    if (!chosenTrack) return setError('Choisis un circuit.');
    const startsAt = new Date(day + hour * 3_600_000);
    if (startsAt.getTime() < Date.now() + 15 * 60_000) return setError('Choisis un créneau dans au moins 15 minutes.');
    create.mutate(
      { trackId: chosenTrack, startsAt: startsAt.toISOString(), spots, format, visibility, message },
      { onSuccess: (id) => router.replace({ pathname: '/sessions/[id]', params: { id } }) },
    );
  }

  return (
    <Screen safeTop={false}>
      <Text variant="label">Quand ?</Text>
      <Chips options={days} value={day} onChange={setDay} />
      <Chips options={HOURS.map((h) => ({ value: h, label: `${h}h00` }))} value={hour} onChange={setHour} />

      <Text variant="label">Combien de pilotes (toi compris) ?</Text>
      <Chips options={SPOTS.map((n) => ({ value: n, label: `${n}` }))} value={spots} onChange={setSpots} />
      <Text variant="caption">
        À l’heure prévue : 3 pilotes ou plus → une course à plusieurs ; 2 pilotes → un défi en face-à-face.
      </Text>

      <Text variant="label">Format</Text>
      <Segmented
        options={[
          { value: 'position', label: 'Classement' },
          { value: 'lap_time', label: 'Meilleur tour' },
        ]}
        value={format}
        onChange={setFormat}
      />

      <Text variant="label">Ouverte à</Text>
      <Segmented
        options={[
          { value: 'public', label: 'Tous les pilotes' },
          { value: 'teammates', label: 'Mes coéquipiers' },
        ]}
        value={visibility}
        onChange={setVisibility}
      />

      <Input
        label="Message (facultatif)"
        value={message}
        onChangeText={setMessage}
        maxLength={280}
        multiline
        placeholder="Tous niveaux, on prend 3 séries puis on finit au bar…"
        style={styles.multiline}
      />

      <Text variant="label">Circuit</Text>
      {tracks.isPending ? <Loading /> : null}
      <TrackPicker tracks={sorted} value={chosenTrack} onChange={setTrackId} />

      {error || create.error ? <Text style={styles.error}>{error ?? create.error?.message}</Text> : null}
      <Button title="Publier la session" size="lg" loading={create.isPending} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 80, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
});
