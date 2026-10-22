import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { AnnouncementCard } from '@/features/admin/components/announcement-banner';
import {
  useAdminAnnouncements,
  useAnnouncementAudience,
  useArchiveAnnouncement,
  usePublishAnnouncement,
  useTrackAudience,
  type Announcement,
} from '@/features/admin/panel';
import { SectionTitle } from '@/features/social/components/section-title';
import { useTracksMap } from '@/features/tracks/api';
import { confirmAction } from '@/lib/confirm';
import { REGIONS, normalize } from '@/lib/regions';
import { colors, radius, spacing } from '@/theme';

const DURATIONS = [
  { value: '1', label: '1 j' },
  { value: '3', label: '3 j' },
  { value: '7', label: '7 j' },
  { value: '14', label: '14 j' },
  { value: '30', label: '30 j' },
];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7 h → 23 h
const MINUTES = [
  { value: '0', label: ':00' },
  { value: '15', label: ':15' },
  { value: '30', label: ':30' },
  { value: '45', label: ':45' },
];

type Target = 'all' | 'region' | 'track';

const isLive = (a: Announcement) => !a.archived_at && Date.parse(a.starts_at) <= Date.now() && Date.parse(a.ends_at) > Date.now();
const isScheduled = (a: Announcement) => !a.archived_at && Date.parse(a.starts_at) > Date.now();
const isPast = (d: Date) => d.getTime() <= Date.now();
const pilots = (n: number) => `${n} pilote${n > 1 ? 's' : ''}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const targetLabel = (a: Pick<Announcement, 'region' | 'track_name'>) => a.track_name ?? a.region ?? 'Toute la France';

/** Les 8 prochains jours : « Aujourd’hui », « Demain », « sam. 25 »… */
function nextDays() {
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const label =
      i === 0 ? 'Aujourd’hui' : i === 1 ? 'Demain' : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    return { value: String(i), label, date: d };
  });
}

/**
 * Annonces officielles : affichées en haut de l'accueil et de l'Actu, tout de suite ou à l'heure programmée,
 * à tous les pilotes, à ceux d'une région ou à ceux d'un circuit.
 */
export default function AdminAnnouncementsScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const list = useAdminAnnouncements(isAppAdmin);
  const publish = usePublishAnnouncement();
  const archive = useArchiveAnnouncement();
  const audience = useAnnouncementAudience(isAppAdmin);
  const tracks = useTracksMap();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [days, setDays] = useState('7');
  const [target, setTarget] = useState<Target>('all');
  const [region, setRegion] = useState<string | null>(null);
  const [track, setTrack] = useState<{ id: string; name: string; city: string } | null>(null);
  const [trackSearch, setTrackSearch] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [day, setDay] = useState('1');
  const [hour, setHour] = useState(18);
  const [minute, setMinute] = useState('0');
  const [notice, setNotice] = useState<string | null>(null);
  const trackAudience = useTrackAudience(target === 'track' ? (track?.id ?? null) : null);

  if (!isAppAdmin) {
    return (
      <Screen safeTop={false}>
        <EmptyState title="Réservé aux admins appli" />
      </Screen>
    );
  }

  const pilotsIn = (r: string | null) =>
    audience.data ? audience.data.filter((a) => r === null || a.region === r).reduce((n, a) => n + a.pilots, 0) : null;
  const chosenRegion = target === 'region' ? region : null;
  const chosenTrack = target === 'track' ? track : null;
  const reach = chosenTrack ? (trackAudience.data ?? null) : pilotsIn(chosenRegion);
  const who = chosenTrack
    ? `les pilotes de ${chosenTrack.name}`
    : chosenRegion
      ? `les pilotes de la région ${chosenRegion}`
      : 'tous les pilotes';
  const missingTarget = (target === 'region' && !region) || (target === 'track' && !track);

  const days8 = nextDays();
  const startDate = new Date(days8[Number(day)].date);
  startDate.setHours(hour, Number(minute), 0, 0);
  const startInPast = scheduled && isPast(startDate);
  const startsAt = scheduled ? startDate : null;

  const query = normalize(trackSearch);
  const trackMatches =
    query.length >= 2
      ? (tracks.data ?? []).filter((t) => normalize(`${t.name} ${t.city}`).includes(query)).slice(0, 6)
      : [];

  const live = (list.data ?? []).filter(isLive);
  const upcoming = (list.data ?? []).filter(isScheduled).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = (list.data ?? []).filter((a) => !isLive(a) && !isScheduled(a));
  const preview: Announcement | null =
    title.trim() || body.trim()
      ? {
          id: 'preview',
          title: title.trim() || 'Titre',
          body: body.trim() || 'Message',
          link_url: link.trim() || null,
          created_at: '',
          starts_at: '',
          ends_at: '',
          archived_at: null,
          region: chosenRegion,
          track_id: chosenTrack?.id ?? null,
          track_name: chosenTrack?.name ?? null,
        }
      : null;

  const submit = () =>
    confirmAction(
      scheduled ? 'Programmer cette annonce ?' : 'Publier cette annonce ?',
      `${who.charAt(0).toUpperCase()}${who.slice(1)} la verront ${scheduled ? `à partir de ${when(startDate.toISOString())}, ` : ''}pendant ${days} jour${days === '1' ? '' : 's'}${reach != null ? ` (${pilots(reach)})` : ''}.`,
      scheduled ? 'Programmer' : 'Publier',
      () =>
        publish.mutate(
          { title, body, link, days: Number(days), region: chosenRegion, track: chosenTrack, startsAt },
          {
            onSuccess: () => {
              setTitle('');
              setBody('');
              setLink('');
              setNotice(scheduled ? `Annonce programmée pour ${when(startDate.toISOString())} ✓` : `Annonce publiée pour ${who} ✓`);
            },
          },
        ),
    );

  return (
    <Screen safeTop={false} refreshing={list.isRefetching} onRefresh={list.refetch}>
      <SectionTitle title="Nouvelle annonce" />
      <Input
        label={`Titre (${title.length}/80)`}
        value={title}
        onChangeText={(v) => (setTitle(v), setNotice(null))}
        maxLength={80}
        placeholder="Nouveau : …"
      />
      <Input
        label={`Message (${body.length}/600)`}
        value={body}
        onChangeText={(v) => (setBody(v), setNotice(null))}
        maxLength={600}
        multiline
        style={styles.multiline}
        placeholder="Ce qui change, ce que les pilotes doivent savoir…"
      />
      <Input label="Lien (facultatif)" value={link} onChangeText={setLink} autoCapitalize="none" keyboardType="url" placeholder="https://…" />

      <Text variant="label">Destinataires</Text>
      <Segmented
        options={[
          { value: 'all', label: 'France' },
          { value: 'region', label: 'Une région' },
          { value: 'track', label: 'Un circuit' },
        ]}
        value={target}
        onChange={(t) => (setTarget(t), setNotice(null))}
      />
      {target === 'region' ? (
        <Chips
          options={REGIONS.map((r) => ({
            value: r.name as string | null,
            label: `${r.name}${pilotsIn(r.name) ? ` · ${pilotsIn(r.name)}` : ''}`,
          }))}
          value={region}
          onChange={setRegion}
        />
      ) : null}
      {target === 'track' ? (
        track ? (
          <View style={styles.picked}>
            <View style={styles.flex}>
              <Text style={styles.bold}>{track.name}</Text>
              <Text variant="caption">{track.city}</Text>
            </View>
            <Button title="Changer" variant="quiet" onPress={() => setTrack(null)} />
          </View>
        ) : (
          <>
            <Input label="Circuit" value={trackSearch} onChangeText={setTrackSearch} placeholder="Nom ou ville du karting" />
            {trackMatches.map((t) => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                onPress={() => (setTrack({ id: t.id, name: t.name, city: t.city }), setTrackSearch(''))}
                style={({ pressed }) => [styles.match, pressed && styles.pressed]}>
                <Text style={styles.bold}>{t.name}</Text>
                <Text variant="caption">
                  {t.city}
                  {t.postal_code ? ` (${t.postal_code.slice(0, 2)})` : ''}
                </Text>
              </Pressable>
            ))}
          </>
        )
      ) : null}
      <Text variant="caption">
        {target === 'track'
          ? track
            ? `Pilotes dont c’est le circuit favori ou qui y ont roulé ces 90 jours${reach != null ? ` : ${pilots(reach)}` : ''}.`
            : 'Cherche le karting : seuls ses habitués la verront (circuit favori, ou défi / Time Attack sur place ces 90 jours).'
          : target === 'region'
            ? region
              ? `Pilotes dont le circuit favori (ou le plus proche) est dans la région${reach != null ? ` : ${pilots(reach)}` : ''}.`
              : 'Choisis la région.'
            : `Tous les pilotes la verront${reach != null ? ` : ${pilots(reach)}` : ''}.`}
      </Text>

      <Text variant="label">Publication</Text>
      <Segmented
        options={[
          { value: 'now', label: 'Maintenant' },
          { value: 'later', label: 'Programmer' },
        ]}
        value={scheduled ? 'later' : 'now'}
        onChange={(v) => (setScheduled(v === 'later'), setNotice(null))}
      />
      {scheduled ? (
        <>
          <Chips options={days8.map(({ value, label }) => ({ value, label }))} value={day} onChange={setDay} />
          <Chips options={HOURS.map((h) => ({ value: h, label: `${h} h` }))} value={hour} onChange={setHour} />
          <Segmented options={MINUTES} value={minute} onChange={setMinute} />
          <Text variant="caption" style={startInPast ? { color: colors.danger } : undefined}>
            {startInPast ? 'Cette heure est déjà passée : choisis plus tard.' : `Affichée à partir de ${when(startDate.toISOString())}.`}
          </Text>
        </>
      ) : null}

      <Text variant="label">Affichée pendant</Text>
      <Segmented options={DURATIONS} value={days} onChange={setDays} />
      {preview ? (
        <>
          <Text variant="label">Aperçu</Text>
          <AnnouncementCard announcement={preview} />
        </>
      ) : null}
      {publish.error ? <Text style={styles.error}>{publish.error.message}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Button
        title={scheduled ? 'Programmer l’annonce' : 'Publier l’annonce'}
        disabled={missingTarget || startInPast}
        loading={publish.isPending}
        onPress={submit}
      />

      {list.isPending ? <Loading /> : null}
      {list.error ? <ErrorState error={list.error} /> : null}

      {upcoming.length > 0 ? (
        <>
          <SectionTitle title="Programmées" detail={`${upcoming.length}`} accent={colors.orange} />
          {upcoming.map((a) => (
            <View key={a.id} style={styles.item}>
              <AnnouncementCard announcement={a} />
              <View style={styles.meta}>
                <Text variant="caption" style={styles.flex}>
                  {targetLabel(a)} · {when(a.starts_at)}
                </Text>
                <Button
                  title="Annuler"
                  variant="quiet"
                  loading={archive.isPending}
                  onPress={() =>
                    confirmAction('Annuler cette annonce ?', 'Elle ne sera jamais publiée.', 'Annuler l’annonce', () =>
                      archive.mutate(a.id),
                    )
                  }
                />
              </View>
            </View>
          ))}
        </>
      ) : null}

      <SectionTitle title="En cours" detail={`${live.length}`} />
      {live.length === 0 ? <Text variant="caption">Aucune annonce affichée.</Text> : null}
      {live.map((a) => (
        <View key={a.id} style={styles.item}>
          <AnnouncementCard announcement={a} />
          <View style={styles.meta}>
            <Text variant="caption" style={styles.flex}>
              {targetLabel(a)} · jusqu’au {new Date(a.ends_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
            </Text>
            <Button
              title="Retirer"
              variant="quiet"
              loading={archive.isPending}
              onPress={() =>
                confirmAction('Retirer cette annonce ?', 'Elle disparaît pour ses destinataires.', 'Retirer', () => archive.mutate(a.id))
              }
            />
          </View>
        </View>
      ))}

      {past.length > 0 ? (
        <>
          <SectionTitle title="Terminées" />
          {past.map((a) => (
            <Card key={a.id} style={styles.past}>
              <Text style={styles.bold}>{a.title}</Text>
              <Text variant="caption" numberOfLines={2}>
                {a.body}
              </Text>
              <Text variant="caption">
                {new Date(a.starts_at).toLocaleDateString('fr-FR')} · {targetLabel(a)} · {a.archived_at ? 'retirée' : 'expirée'}
              </Text>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
  notice: { color: colors.neon, fontWeight: '700' },
  item: { gap: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  past: { gap: 2, opacity: 0.75 },
  bold: { fontWeight: '800' },
  flex: { flex: 1 },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neon,
    backgroundColor: colors.surfaceAlt,
  },
  match: { gap: 2, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  pressed: { opacity: 0.7 },
});
