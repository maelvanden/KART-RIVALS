import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { useCreateChallenge } from '@/features/challenges/api';
import { useApproxLocation } from '@/features/nearby/api';
import { useCreateTrack, useTracks } from '@/features/tracks/api';
import { colors, spacing } from '@/theme';
import { HOURS, nextDays, toScheduledAt } from '@/lib/schedule';
import type { RaceFormat } from '@/types/models';

export default function NewChallengeScreen() {
  const { opponentId, username } = useLocalSearchParams<{ opponentId: string; username: string }>();
  const tracks = useTracks();
  const location = useApproxLocation();
  const createTrack = useCreateTrack();
  const createChallenge = useCreateChallenge();

  const days = useMemo(() => nextDays(8), []);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [day, setDay] = useState<number | null>(days[0].value);
  const [hour, setHour] = useState(19);
  const [format, setFormat] = useState<RaceFormat>('position');
  const [message, setMessage] = useState('');
  const [addingTrack, setAddingTrack] = useState(false);
  const [trackName, setTrackName] = useState('');
  const [trackCity, setTrackCity] = useState('');

  const selectedTrack = trackId ?? tracks.data?.[0]?.id ?? null;
  const scheduledAt = toScheduledAt(day, hour);
  const error = (createChallenge.error ?? createTrack.error) as Error | null;

  async function addTrack() {
    if (!location.data) return;
    const track = await createTrack.mutateAsync({ name: trackName.trim(), city: trackCity.trim(), coords: location.data });
    setTrackId(track.id);
    setAddingTrack(false);
    setTrackName('');
    setTrackCity('');
  }

  async function send() {
    if (!opponentId || !selectedTrack) return;
    const id = await createChallenge.mutateAsync({
      opponentId,
      trackId: selectedTrack,
      scheduledAt,
      format,
      message: message.trim() || null,
    });
    router.replace({ pathname: '/challenge/[id]', params: { id } });
  }

  return (
    <Screen safeTop={false} subtitle="Nouveau défi" title={`VS ${username ?? 'pilote'}`}>
      <Section label="Circuit">
        {tracks.data && tracks.data.length > 0 ? (
          <Chips
            options={tracks.data.map((t) => ({ value: t.id, label: `${t.name} · ${t.city}` }))}
            value={selectedTrack}
            onChange={setTrackId}
          />
        ) : (
          <Text variant="caption">Aucun circuit enregistré pour l’instant : ajoute le tien.</Text>
        )}
        {addingTrack ? (
          <Card style={styles.addTrack}>
            <Input label="Nom du circuit" value={trackName} onChangeText={setTrackName} placeholder="Kart Indoor Angers" />
            <Input label="Ville" value={trackCity} onChangeText={setTrackCity} placeholder="Angers" />
            {location.data === null ? (
              <Text variant="caption" style={{ color: colors.danger }}>
                Active la localisation pour ajouter un circuit près de toi.
              </Text>
            ) : null}
            <Button
              title="Ajouter le circuit"
              variant="secondary"
              onPress={addTrack}
              loading={createTrack.isPending}
              disabled={!trackName.trim() || !trackCity.trim() || !location.data}
            />
          </Card>
        ) : (
          <Button title="+ Ajouter un circuit" variant="ghost" onPress={() => setAddingTrack(true)} />
        )}
      </Section>

      <Section label="Date">
        <Chips options={[...days, { value: null, label: 'À définir' }]} value={day} onChange={setDay} />
        {day !== null ? (
          <Chips options={HOURS.map((h) => ({ value: h, label: `${h}h00` }))} value={hour} onChange={setHour} />
        ) : null}
      </Section>

      <Section label="Format">
        <Segmented
          options={[
            { value: 'position', label: 'Position à l’arrivée' },
            { value: 'lap_time', label: 'Meilleur tour' },
          ]}
          value={format}
          onChange={setFormat}
        />
      </Section>

      <Input
        label="Message (optionnel)"
        value={message}
        onChangeText={setMessage}
        placeholder="Prêt à perdre ? 🏁"
        maxLength={280}
        multiline
      />

      {error ? <Text style={{ color: colors.danger }}>{error.message}</Text> : null}

      <Button
        title="Envoyer le défi"
        onPress={send}
        loading={createChallenge.isPending}
        disabled={!opponentId || !selectedTrack}
      />
    </Screen>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label">{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  addTrack: { gap: spacing.md },
});
