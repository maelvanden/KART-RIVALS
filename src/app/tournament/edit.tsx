import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useTournament, useUpdateTournament, type TournamentEdit } from '@/features/tournaments/api';
import { BannerField } from '@/features/tournaments/components/banner-field';
import { PrivacyField } from '@/features/tournaments/components/privacy-field';
import { dateTimeFormat } from '@/lib/format';
import { nextDays, toScheduledAt } from '@/lib/schedule';
import { colors, spacing } from '@/theme';
import type { Tournament } from '@/types/models';

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

/** Modifier un tournoi (organisateur) : bannière, nom, date et message. */
export default function EditTournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tournament = useTournament(id);

  if (tournament.isPending) return <Screen safeTop={false}><Loading /></Screen>;
  if (tournament.error) return <Screen safeTop={false}><ErrorState error={tournament.error} /></Screen>;
  if (!tournament.data) return <Screen safeTop={false}><EmptyState title="Tournoi introuvable" /></Screen>;
  return <Form tournament={tournament.data} />;
}

function Form({ tournament: t }: { tournament: Tournament }) {
  const update = useUpdateTournament();
  const days = useMemo(() => nextDays(21), []);
  const [name, setName] = useState(t.name);
  const [message, setMessage] = useState(t.message ?? '');
  // undefined = date inchangée ; null = « à définir ».
  const [day, setDay] = useState<number | null | undefined>(undefined);
  const [hour, setHour] = useState(14);
  // undefined = bannière inchangée ; null = retirée ; sinon l'URI locale de la nouvelle image.
  const [banner, setBanner] = useState<string | null | undefined>(undefined);

  const [isPrivate, setIsPrivate] = useState(t.is_private);

  const validName = name.trim().length >= 3;

  async function save() {
    const edit: TournamentEdit = { id: t.id, name: name.trim(), message: message.trim() || null };
    if (day !== undefined) edit.startsAt = toScheduledAt(day, hour);
    if (banner !== undefined) edit.bannerUri = banner;
    if (isPrivate !== t.is_private) edit.isPrivate = isPrivate;
    await update.mutateAsync(edit);
    router.back();
  }

  return (
    <Screen safeTop={false} subtitle={t.name} title="Modifier le tournoi">
      <View style={styles.section}>
        <Text variant="label">Bannière</Text>
        <BannerField uri={banner === undefined ? t.banner_url : banner} coverUrl={t.track.cover_url} onChange={setBanner} />
      </View>

      <Input label="Nom du tournoi" value={name} onChangeText={setName} maxLength={60} />

      {t.status === 'registration' ? (
        <View style={styles.section}>
          <Text variant="label">Accès</Text>
          <PrivacyField isPrivate={isPrivate} onChange={setIsPrivate} />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text variant="label">Date</Text>
        <Chips
          options={[
            { value: undefined, label: t.starts_at ? `Inchangée · ${dateTimeFormat.format(new Date(t.starts_at))}` : 'Inchangée · à définir' },
            { value: null, label: 'À définir' },
            ...days,
          ]}
          value={day}
          onChange={setDay}
        />
        {typeof day === 'number' ? (
          <Chips options={HOURS.map((h) => ({ value: h, label: `${h}h00` }))} value={hour} onChange={setHour} />
        ) : null}
      </View>

      <Input
        label="Message"
        value={message}
        onChangeText={setMessage}
        maxLength={280}
        placeholder="Règlement, horaires, lot pour le vainqueur…"
        multiline
      />

      <Text variant="caption">Le circuit, la taille du tableau et le format des duels ne se modifient plus après la création.</Text>

      {update.error ? <Text style={{ color: colors.danger }}>{(update.error as Error).message}</Text> : null}
      <Button title="Enregistrer" onPress={save} loading={update.isPending} disabled={!validName} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
});
