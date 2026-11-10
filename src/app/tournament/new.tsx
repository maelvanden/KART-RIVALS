import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { useTracks } from '@/features/tracks/api';
import { useCreateTournament } from '@/features/tournaments/api';
import { minPilotsToStart } from '@/features/tournaments/bracket';
import { HOURS, nextDays, toScheduledAt } from '@/lib/schedule';
import { colors, spacing } from '@/theme';
import type { RaceFormat, TournamentSize } from '@/types/models';

export default function NewTournamentScreen() {
  const tracks = useTracks();
  const create = useCreateTournament();

  const days = useMemo(() => nextDays(15), []);
  const [name, setName] = useState('');
  const [trackId, setTrackId] = useState<string | null>(null);
  const [size, setSize] = useState<TournamentSize>(8);
  const [format, setFormat] = useState<RaceFormat>('position');
  const [day, setDay] = useState<number | null>(null);
  const [hour, setHour] = useState(14);
  const [message, setMessage] = useState('');

  const selectedTrack = trackId ?? tracks.data?.[0]?.id ?? null;
  const validName = name.trim().length >= 3;

  async function submit() {
    if (!selectedTrack || !validName) return;
    const id = await create.mutateAsync({
      trackId: selectedTrack,
      name: name.trim(),
      size,
      format,
      startsAt: toScheduledAt(day, hour),
      message: message.trim() || null,
    });
    router.replace({ pathname: '/tournament/[id]', params: { id } });
  }

  return (
    <Screen safeTop={false} subtitle="Élimination directe" title="Nouveau tournoi">
      <Input label="Nom du tournoi" value={name} onChangeText={setName} maxLength={60} placeholder="Coupe d’hiver d’Inwall" />

      <Section label="Circuit">
        <Chips
          options={(tracks.data ?? []).map((t) => ({ value: t.id, label: `${t.name} · ${t.city}` }))}
          value={selectedTrack}
          onChange={setTrackId}
        />
      </Section>

      <Section label="Tableau">
        <Segmented
          options={[
            { value: '8', label: '8 pilotes' },
            { value: '16', label: '16 pilotes' },
          ]}
          value={String(size)}
          onChange={(v) => setSize(v === '16' ? 16 : 8)}
        />
        <Text variant="caption">
          Le tirage se fait tout seul quand le tableau est complet. Tu peux aussi le lancer dès{' '}
          {minPilotsToStart(size)} inscrits : les meilleurs ELO sont alors qualifiés d’office au premier tour.
        </Text>
      </Section>

      <Section label="Classement des duels">
        <Segmented
          options={[
            { value: 'position', label: 'Position à l’arrivée' },
            { value: 'lap_time', label: 'Meilleur tour' },
          ]}
          value={format}
          onChange={setFormat}
        />
      </Section>

      <Section label="Date">
        <Chips options={[{ value: null, label: 'À définir' }, ...days]} value={day} onChange={setDay} />
        {day !== null ? (
          <Chips options={HOURS.map((h) => ({ value: h, label: `${h}h00` }))} value={hour} onChange={setHour} />
        ) : null}
      </Section>

      <Input
        label="Message (optionnel)"
        value={message}
        onChangeText={setMessage}
        maxLength={280}
        placeholder="Règlement, horaires, lot pour le vainqueur…"
        multiline
      />

      <Text variant="caption">
        Chaque duel est un défi classique : saisie, validation et ELO comme d’habitude, mais pas d’égalité possible. Le
        vainqueur remporte le trophée et 300 points, le finaliste 100 points.
      </Text>

      {create.error ? <Text style={{ color: colors.danger }}>{(create.error as Error).message}</Text> : null}
      <Button
        title="Ouvrir les inscriptions"
        onPress={submit}
        loading={create.isPending}
        disabled={!validName || !selectedTrack}
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
});
