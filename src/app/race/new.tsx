import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { useApproxLocation, useNearbyPilots, useSearchPilots } from '@/features/nearby/api';
import { useCreateRace } from '@/features/races/api';
import { useTracks } from '@/features/tracks/api';
import { HOURS, nextDays, toScheduledAt } from '@/lib/schedule';
import { colors, radius, rankMeta, spacing } from '@/theme';
import type { RaceFormat, RankTier } from '@/types/models';

const MAX_INVITES = 7;

type Candidate = { id: string; username: string; avatar_url: string | null; rank: RankTier; elo: number };

export default function NewRaceScreen() {
  const tracks = useTracks();
  const location = useApproxLocation();
  const [query, setQuery] = useState('');
  const nearby = useNearbyPilots(location.data, 100);
  const search = useSearchPilots(query);
  const createRace = useCreateRace();

  const days = useMemo(() => nextDays(8), []);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [day, setDay] = useState<number | null>(days[0].value);
  const [hour, setHour] = useState(19);
  const [format, setFormat] = useState<RaceFormat>('position');
  const [message, setMessage] = useState('');
  const [invited, setInvited] = useState<Candidate[]>([]);

  const selectedTrack = trackId ?? tracks.data?.[0]?.id ?? null;
  const candidates: Candidate[] = (query.trim().length >= 2 ? search.data : nearby.data) ?? [];
  const isInvited = (id: string) => invited.some((p) => p.id === id);

  function toggle(p: Candidate) {
    setInvited((list) =>
      isInvited(p.id) ? list.filter((x) => x.id !== p.id) : list.length >= MAX_INVITES ? list : [...list, p],
    );
  }

  async function create() {
    if (!selectedTrack) return;
    const id = await createRace.mutateAsync({
      trackId: selectedTrack,
      invitees: invited.map((p) => p.id),
      scheduledAt: toScheduledAt(day, hour),
      format,
      message: message.trim() || null,
    });
    router.replace({ pathname: '/race/[id]', params: { id } });
  }

  return (
    <Screen safeTop={false} subtitle="De 3 à 8 pilotes" title="Course à plusieurs">
      <Section label="Circuit">
        <Chips
          options={(tracks.data ?? []).map((t) => ({ value: t.id, label: `${t.name} · ${t.city}` }))}
          value={selectedTrack}
          onChange={setTrackId}
        />
      </Section>

      <Section label="Date">
        <Chips options={[...days, { value: null, label: 'À définir' }]} value={day} onChange={setDay} />
        {day !== null ? (
          <Chips options={HOURS.map((h) => ({ value: h, label: `${h}h00` }))} value={hour} onChange={setHour} />
        ) : null}
      </Section>

      <Section label="Classement">
        <Segmented
          options={[
            { value: 'position', label: 'Position à l’arrivée' },
            { value: 'lap_time', label: 'Meilleur tour' },
          ]}
          value={format}
          onChange={setFormat}
        />
      </Section>

      <Section label={`Pilotes invités · ${invited.length}/${MAX_INVITES}`}>
        {invited.length > 0 ? (
          <View style={styles.selected}>
            {invited.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => toggle(p)}
                accessibilityLabel={`Retirer ${p.username}`}
                style={styles.selectedChip}>
                <Text style={styles.selectedText}>{p.username}</Text>
                <Icon name={icons.close} size={14} color={colors.onNeon} />
              </Pressable>
            ))}
          </View>
        ) : (
          <Text variant="caption">Invite au moins 2 pilotes. Tu fais partie de la course.</Text>
        )}

        <Input
          label="Chercher un pseudo"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ou choisis parmi les pilotes proches"
        />
        <View style={styles.candidates}>
          {candidates.map((p) => {
            const on = isInvited(p.id);
            const full = !on && invited.length >= MAX_INVITES;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: full }}
                accessibilityLabel={p.username}
                onPress={() => toggle(p)}
                disabled={full}
                style={[styles.candidate, on && styles.candidateOn, full && styles.disabled]}>
                <Avatar username={p.username} url={p.avatar_url} size={34} borderColor={rankMeta[p.rank].color} />
                <View style={styles.candidateBody}>
                  <Text style={styles.candidateName}>{p.username}</Text>
                  <Text variant="caption">{p.elo} ELO</Text>
                </View>
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Icon name={icons.check} size={14} color={colors.onNeon} /> : null}
                </View>
              </Pressable>
            );
          })}
          {candidates.length === 0 ? (
            <Text variant="caption">
              {query.trim().length >= 2 ? 'Aucun pilote trouvé.' : 'Aucun pilote proche. Cherche un pseudo.'}
            </Text>
          ) : null}
        </View>
      </Section>

      <Input label="Message (optionnel)" value={message} onChangeText={setMessage} maxLength={280} placeholder="Qui sera sur la plus haute marche ?" multiline />

      {createRace.error ? <Text style={{ color: colors.danger }}>{(createRace.error as Error).message}</Text> : null}
      <Button
        title={invited.length >= 2 ? `Créer la course · ${invited.length + 1} pilotes` : 'Créer la course'}
        onPress={create}
        loading={createRace.isPending}
        disabled={invited.length < 2 || !selectedTrack}
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
  selected: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.neon,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  selectedText: { color: colors.onNeon, fontWeight: '800', fontSize: 13 },
  candidates: { gap: spacing.sm },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  candidateOn: { borderColor: colors.neon, backgroundColor: '#12190F' },
  disabled: { opacity: 0.4 },
  candidateBody: { flex: 1, gap: 2 },
  candidateName: { fontWeight: '800', fontSize: 15 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.neon, borderColor: colors.neon },
});
