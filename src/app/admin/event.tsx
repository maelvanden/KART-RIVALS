import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { normalizeUrl, useCanManageTrack } from '@/features/admin/api';
import {
  CATEGORY_LABELS,
  useDeleteEvent,
  useManagedEventStats,
  useSaveEvent,
  useTrackEvent,
  type EventCategory,
  type EventKind,
  type TrackEvent,
} from '@/features/events/api';
import { parseLocalDate, splitLocalDate } from '@/features/events/format';
import { useTrack } from '@/features/tracks/api';
import { confirmAction } from '@/lib/confirm';
import { colors, spacing } from '@/theme';

/** Publier ou modifier un événement / une promo d'un karting (admins du karting). */
export default function EventFormScreen() {
  const { trackId, id } = useLocalSearchParams<{ trackId: string; id?: string }>();
  const track = useTrack(trackId);
  const canManage = useCanManageTrack(trackId);
  const existing = useTrackEvent(id);
  const stats = useManagedEventStats(trackId, canManage && !!id);

  const loading = track.isPending || (!!id && (existing.isPending || stats.isPending));
  return (
    <Screen safeTop={false}>
      <Stack.Screen options={{ title: id ? 'Modifier' : 'Publier', presentation: 'modal' }} />
      {loading ? <Loading /> : null}
      {!loading && !canManage ? <EmptyState title="Accès réservé" message="Seuls les admins de ce karting publient ici." /> : null}
      {!loading && canManage && track.data ? (
        <EventForm
          key={id ?? 'new'}
          trackId={trackId}
          trackName={track.data.name}
          event={existing.data ?? null}
          promoCode={id ? (stats.data?.[id]?.promo_code ?? '') : ''}
        />
      ) : null}
    </Screen>
  );
}

const CATEGORIES = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value: value as EventCategory, label }));

function EventForm({
  trackId,
  trackName,
  event,
  promoCode,
}: {
  trackId: string;
  trackName: string;
  event: TrackEvent | null;
  promoCode: string;
}) {
  const save = useSaveEvent(trackId);
  const remove = useDeleteEvent();
  const start = splitLocalDate(event?.starts_at ?? null);
  const end = splitLocalDate(event?.ends_at ?? null);
  const [kind, setKind] = useState<EventKind>(event?.kind ?? 'event');
  const [category, setCategory] = useState<EventCategory>(event?.category ?? 'endurance');
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [startDate, setStartDate] = useState(start.date);
  const [startHour, setStartHour] = useState(start.hour);
  const [endDate, setEndDate] = useState(end.date);
  const [endHour, setEndHour] = useState(end.hour);
  const [price, setPrice] = useState(event?.price ?? '');
  const [bookingUrl, setBookingUrl] = useState(event?.booking_url ?? '');
  const [code, setCode] = useState(promoCode);
  const [conditions, setConditions] = useState(event?.promo_conditions ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const promo = kind === 'promo';

  function submit() {
    setFormError(null);
    if (title.trim().length < 3) return setFormError('Donne un titre (3 caractères minimum).');
    const startsAt = startDate.trim() ? parseLocalDate(startDate, startHour) : null;
    const endsAt = endDate.trim() ? parseLocalDate(endDate, endHour || (promo ? '23:59' : '')) : null;
    if (startDate.trim() && !startsAt) return setFormError('Date de début invalide : JJ/MM/AAAA et HH:MM.');
    if (endDate.trim() && !endsAt) return setFormError('Date de fin invalide : JJ/MM/AAAA et HH:MM.');
    if (!promo && !startsAt) return setFormError('Un événement a besoin d’une date de début.');
    if (promo && !endsAt) return setFormError('Une promo a besoin d’une date de fin.');
    if (promo && !code.trim()) return setFormError('Indique le code promo à donner à l’accueil.');
    if (startsAt && endsAt && endsAt < startsAt) return setFormError('La fin doit être après le début.');
    save.mutate(
      {
        id: event?.id,
        input: {
          kind,
          category: promo ? null : category,
          title,
          description,
          starts_at: startsAt,
          ends_at: endsAt,
          price,
          booking_url: normalizeUrl(bookingUrl),
          promo_code: promo ? code : '',
          promo_conditions: promo ? conditions : '',
        },
      },
      { onSuccess: (savedId) => router.replace({ pathname: '/event/[id]', params: { id: savedId } }) },
    );
  }

  return (
    <>
      <Text variant="caption">
        Publié sur la fiche de {trackName} et dans l’agenda des kartings, visible par tous les pilotes Kart Rivals.
      </Text>
      <Segmented
        options={[
          { value: 'event', label: 'Événement' },
          { value: 'promo', label: 'Promo' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {!promo ? <Chips options={CATEGORIES} value={category} onChange={setCategory} /> : null}
      <Input
        label="Titre"
        value={title}
        onChangeText={setTitle}
        maxLength={80}
        placeholder={promo ? '−20 % sur la 2e session le mardi' : 'Endurance 2 h par équipes de 3'}
      />
      <Input
        label="Description"
        value={description}
        onChangeText={setDescription}
        maxLength={1000}
        multiline
        style={styles.multiline}
        placeholder={promo ? 'À qui elle s’adresse, quand elle s’applique…' : 'Format, nombre de sessions, âge minimum, lots…'}
      />

      <Text variant="label">{promo ? 'Validité' : 'Date'}</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Input
            label={promo ? 'À partir du (facultatif)' : 'Début'}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="25/10/2026"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
        </View>
        <View style={styles.hour}>
          <Input label="Heure" value={startHour} onChangeText={setStartHour} placeholder="20:00" keyboardType="numbers-and-punctuation" maxLength={5} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Input
            label={promo ? 'Jusqu’au' : 'Fin (facultatif)'}
            value={endDate}
            onChangeText={setEndDate}
            placeholder="25/10/2026"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
        </View>
        <View style={styles.hour}>
          <Input label="Heure" value={endHour} onChangeText={setEndHour} placeholder={promo ? '23:59' : '23:00'} keyboardType="numbers-and-punctuation" maxLength={5} />
        </View>
      </View>

      {promo ? (
        <>
          <Input label="Code promo" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={40} placeholder="RIVALS20" />
          <Text variant="caption">Le code n’est affiché qu’aux pilotes connectés ; tu verras combien l’ont affiché.</Text>
          <Input label="Conditions" value={conditions} onChangeText={setConditions} maxLength={300} placeholder="Une utilisation par pilote et par jour, hors week-end…" />
        </>
      ) : (
        <Input label="Prix (facultatif)" value={price} onChangeText={setPrice} maxLength={40} placeholder="45 € par pilote" />
      )}
      <Input
        label="Lien d’inscription (facultatif)"
        value={bookingUrl}
        onChangeText={setBookingUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://monkarting.fr/endurance"
      />
      <Text variant="caption">Sans lien, le bouton renvoie vers la réservation ou le téléphone du karting.</Text>

      {formError || save.error ? <Text style={styles.error}>{formError ?? save.error?.message}</Text> : null}
      <Button title={event ? 'Enregistrer' : 'Publier'} size="lg" loading={save.isPending} onPress={submit} />
      {event ? (
        <Button
          title="Supprimer"
          variant="quiet"
          disabled={remove.isPending}
          onPress={() =>
            confirmAction('Supprimer ?', 'Il disparaîtra de l’agenda et de la fiche du circuit.', 'Supprimer', () =>
              remove.mutate(event.id, { onSuccess: () => router.replace({ pathname: '/track/[id]', params: { id: trackId } }) }),
            )
          }
        />
      ) : null}
      {remove.error ? <Text style={styles.error}>{remove.error.message}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  hour: { width: 110 },
  multiline: { minHeight: 100, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
});
