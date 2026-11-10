import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useCanManageTrack } from '@/features/admin/api';
import { useMyProfile } from '@/features/profile/api';
import { useCreateTournament, useUpdateTournament } from '@/features/tournaments/api';
import { minPilotsToStart, sizeSummary, TOURNAMENT_SIZES } from '@/features/tournaments/bracket';
import type { EloRange } from '@/features/tournaments/bracket';
import { BannerField } from '@/features/tournaments/components/banner-field';
import { ConditionsField } from '@/features/tournaments/components/conditions-field';
import { StartModeField } from '@/features/tournaments/components/start-mode-field';
import { PrivacyField } from '@/features/tournaments/components/privacy-field';
import { useTracksMap } from '@/features/tracks/api';
import { TrackPicker } from '@/features/tracks/components/track-picker';
import { nextDays, toScheduledAt } from '@/lib/schedule';
import { colors, radius, spacing } from '@/theme';
import type { RaceFormat, TournamentSize } from '@/types/models';

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

export default function NewTournamentScreen() {
  const params = useLocalSearchParams<{ trackId?: string }>();
  const tracks = useTracksMap();
  const profile = useMyProfile();
  const create = useCreateTournament();
  const update = useUpdateTournament();

  const days = useMemo(() => nextDays(21), []);
  const [name, setName] = useState('');
  // undefined = pas encore choisi : circuit favori par défaut.
  const [trackId, setTrackId] = useState<string | null | undefined>(params.trackId);
  const [size, setSize] = useState<TournamentSize>(8);
  const [format, setFormat] = useState<RaceFormat>('position');
  const [day, setDay] = useState<number | null>(null);
  const [hour, setHour] = useState(14);
  const [message, setMessage] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [prize, setPrize] = useState('');
  const [autoStart, setAutoStart] = useState(true);
  const [conditions, setConditions] = useState<{ range: EloRange; valid: boolean }>({
    range: { minElo: null, maxElo: null },
    valid: true,
  });
  const [official, setOfficial] = useState(true);
  const [participate, setParticipate] = useState(false);
  const [bannerFailed, setBannerFailed] = useState<string | null>(null);

  const chosenTrack = trackId === undefined ? (profile.data?.home_track_id ?? null) : trackId;
  const track = tracks.data?.find((t) => t.id === chosenTrack) ?? null;
  // Admin de ce karting : le tournoi peut être officiel (choix proposé, coché par défaut).
  const canBeOfficial = useCanManageTrack(chosenTrack ?? undefined);
  const isOfficial = canBeOfficial && official;
  const validName = name.trim().length >= 3;
  const pending = create.isPending || update.isPending;

  async function submit() {
    if (!chosenTrack || !validName || !conditions.valid) return;
    const id = await create.mutateAsync({
      trackId: chosenTrack,
      name: name.trim(),
      size,
      format,
      startsAt: toScheduledAt(day, hour),
      message: message.trim() || null,
      isPrivate: isPrivate && !isOfficial,
      prize: prize.trim() || null,
      isOfficial,
      participate: isOfficial ? participate : true,
      autoStart,
      minElo: conditions.range.minElo,
      maxElo: conditions.range.maxElo,
    });
    if (banner) {
      try {
        await update.mutateAsync({ id, bannerUri: banner });
      } catch {
        // Le tournoi existe déjà : on y va, la bannière se rajoute depuis « Modifier ».
        setBannerFailed(id);
        return;
      }
    }
    router.replace({ pathname: '/tournament/[id]', params: { id } });
    // Tournoi privé : personne ne le voit tant que personne n'est invité.
    if (isPrivate && !isOfficial) router.push({ pathname: '/tournament/invite', params: { id } });
  }

  if (bannerFailed) {
    return (
      <Screen safeTop={false} subtitle="Tournoi créé" title="Bannière non envoyée">
        <Text>
          Les inscriptions sont ouvertes, mais l’image n’a pas pu être envoyée. Tu pourras la remettre depuis « Modifier »
          sur la page du tournoi.
        </Text>
        <Button title="Voir le tournoi" onPress={() => router.replace({ pathname: '/tournament/[id]', params: { id: bannerFailed } })} />
      </Screen>
    );
  }

  return (
    <Screen safeTop={false} subtitle="Élimination directe" title="Nouveau tournoi">
      <Section label="Bannière">
        <BannerField uri={banner} coverUrl={track?.cover_url} onChange={setBanner} />
      </Section>

      <Input label="Nom du tournoi" value={name} onChangeText={setName} maxLength={60} placeholder="Coupe d’hiver d’Inwall" />

      <Section label="Tableau">
        <View style={styles.sizes}>
          {TOURNAMENT_SIZES.map((s) => {
            const on = s === size;
            return (
              <Pressable
                key={s}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${s} pilotes`}
                onPress={() => setSize(s)}
                style={[styles.size, on && styles.sizeOn]}>
                <Text style={[styles.sizeNumber, on && styles.sizeNumberOn]}>{s}</Text>
                <Text variant="caption" style={on && { color: colors.onNeon }}>
                  pilotes
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text variant="caption">
          {sizeSummary(size)}. Tu peux lancer le tableau dès {minPilotsToStart(size)} inscrits : les meilleurs ELO sont alors
          qualifiés d’office au premier tour.
        </Text>
      </Section>

      <Section label="Lancement">
        <StartModeField autoStart={autoStart} onChange={setAutoStart} />
      </Section>

      <Section label="Qui peut s’inscrire">
        <ConditionsField myElo={profile.data?.elo} onChange={(range, valid) => setConditions({ range, valid })} />
      </Section>

      {canBeOfficial ? (
        <Section label="Tournoi du karting">
          <Segmented
            options={[
              { value: 'official', label: 'Officiel' },
              { value: 'personal', label: 'Personnel' },
            ]}
            value={official ? 'official' : 'personal'}
            onChange={(v) => setOfficial(v === 'official')}
          />
          <Text variant="caption">
            {official
              ? `Organisé au nom de ${track?.name ?? 'ton karting'} : badge « Officiel », mis en avant dans les listes et annoncé aux pilotes du circuit qui acceptent les notifications.`
              : 'Un tournoi entre pilotes comme un autre, sans badge ni mise en avant.'}
          </Text>
          {official ? (
            <Segmented
              options={[
                { value: 'referee', label: 'J’arbitre' },
                { value: 'drive', label: 'Je roule aussi' },
              ]}
              value={participate ? 'drive' : 'referee'}
              onChange={(v) => setParticipate(v === 'drive')}
            />
          ) : null}
        </Section>
      ) : null}

      {isOfficial ? null : (
        <Section label="Accès">
          <PrivacyField isPrivate={isPrivate} onChange={setIsPrivate} />
        </Section>
      )}

      <Input
        label="Lot du vainqueur (optionnel)"
        value={prize}
        onChangeText={setPrize}
        maxLength={120}
        placeholder="Une session offerte, un casque…"
      />

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

      <Section label="Circuit">
        {tracks.isPending ? <Loading /> : null}
        <TrackPicker tracks={tracks.data ?? []} value={chosenTrack} onChange={setTrackId} noneLabel="Aucun circuit choisi" />
      </Section>

      <Text variant="caption">
        Chaque duel est un défi classique : saisie, validation et ELO comme d’habitude, mais pas d’égalité possible. Les
        inscrits ont leur discussion dans la Radio Paddock. Le vainqueur remporte le trophée et 300 points, le finaliste
        100 points.
      </Text>

      {create.error ? <Text style={{ color: colors.danger }}>{(create.error as Error).message}</Text> : null}
      <Button title="Ouvrir les inscriptions" onPress={submit} loading={pending} disabled={!validName || !chosenTrack || !conditions.valid} />
      {!chosenTrack || !validName ? (
        <Text variant="caption" style={styles.hint}>
          {!validName ? 'Donne un nom au tournoi (3 caractères minimum).' : 'Choisis le circuit du tournoi.'}
        </Text>
      ) : null}
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
  sizes: { flexDirection: 'row', gap: spacing.sm },
  size: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sizeOn: { backgroundColor: colors.neon, borderColor: colors.neon },
  sizeNumber: { fontSize: 24, fontWeight: '900' },
  sizeNumberOn: { color: colors.onNeon },
  hint: { textAlign: 'center' },
});
