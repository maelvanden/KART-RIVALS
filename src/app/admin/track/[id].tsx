import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import {
  normalizeUrl,
  uploadTrackCover,
  uploadTrackLayout,
  useAdminRoles,
  useCanManageTrack,
  useSetTrackAdmin,
  useTrackAdmins,
  useUpdateTrackPage,
  type TrackPageInput,
} from '@/features/admin/api';
import { useAuth } from '@/features/auth/auth-provider';
import { useSearchPilots } from '@/features/nearby/api';
import { SectionTitle } from '@/features/social/components/section-title';
import { useTrack } from '@/features/tracks/api';
import { TrackLayoutCard } from '@/features/tracks/components/track-layout-card';
import { confirmAction } from '@/lib/confirm';
import { colors, spacing } from '@/theme';
import type { TrackDetails } from '@/types/models';

/** Gestion d'une fiche circuit : admins de ce karting et admins appli. */
export default function ManageTrackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const track = useTrack(id);
  const roles = useAdminRoles();
  const canManage = useCanManageTrack(id);

  return (
    <Screen safeTop={false}>
      <Stack.Screen options={{ title: track.data ? `Gérer · ${track.data.name}` : 'Gérer la fiche' }} />
      {track.isPending || roles.isPending ? <Loading /> : null}
      {track.error ? <ErrorState error={track.error} /> : null}
      {track.data && roles.data && !canManage ? (
        <EmptyState title="Accès réservé" message="Seuls les admins de ce karting et les admins appli modifient cette fiche." />
      ) : null}
      {track.data && canManage ? (
        <>
          <CoverEditor track={track.data} />
          <TrackForm key={track.data.id} track={track.data} />
          <LayoutEditor track={track.data} />
          {roles.data?.is_app_admin ? <TrackAdmins trackId={track.data.id} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

const LINKS = [
  { key: 'booking_url', label: 'Réservation / billetterie', placeholder: 'https://monkarting.fr/reserver' },
  { key: 'website', label: 'Site officiel', placeholder: 'https://monkarting.fr' },
  { key: 'instagram_url', label: 'Instagram', placeholder: 'https://www.instagram.com/monkarting' },
  { key: 'facebook_url', label: 'Facebook', placeholder: 'https://www.facebook.com/monkarting' },
  { key: 'tiktok_url', label: 'TikTok', placeholder: 'https://www.tiktok.com/@monkarting' },
  { key: 'youtube_url', label: 'YouTube', placeholder: 'https://www.youtube.com/@monkarting' },
] as const;

type Form = Record<
  | 'name'
  | 'address'
  | 'postal_code'
  | 'city'
  | 'length_m'
  | 'kart_power'
  | 'description'
  | 'phone'
  | 'lat'
  | 'lng'
  | (typeof LINKS)[number]['key'],
  string
>;

const str = (v: string | number | null | undefined) => (v == null ? '' : String(v));

function TrackForm({ track }: { track: TrackDetails }) {
  const update = useUpdateTrackPage(track.id);
  const [indoor, setIndoor] = useState(track.is_indoor);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({
    name: track.name,
    address: str(track.address),
    postal_code: str(track.postal_code),
    city: track.city,
    length_m: str(track.length_m),
    kart_power: str(track.kart_power),
    description: str(track.description),
    phone: str(track.phone),
    lat: str(track.lat),
    lng: str(track.lng),
    booking_url: str(track.booking_url),
    website: str(track.website),
    instagram_url: str(track.instagram_url),
    facebook_url: str(track.facebook_url),
    tiktok_url: str(track.tiktok_url),
    youtube_url: str(track.youtube_url),
  });
  const set = (key: keyof Form) => (value: string) => {
    setNotice(null);
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function locate() {
    setLocating(true);
    setNotice(null);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) throw new Error('Autorise la localisation dans les réglages.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
      setNotice('Position relevée : enregistre pour la mettre sur la carte.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Position introuvable.');
    } finally {
      setLocating(false);
    }
  }

  function save() {
    const lat = Number(form.lat.replace(',', '.'));
    const lng = Number(form.lng.replace(',', '.'));
    const input: TrackPageInput = {
      name: form.name,
      address: form.address,
      postal_code: form.postal_code,
      city: form.city,
      length_m: form.length_m.replace(/\D/g, ''),
      kart_power: form.kart_power,
      is_indoor: indoor,
      description: form.description,
      phone: form.phone,
      ...Object.fromEntries(LINKS.map((l) => [l.key, normalizeUrl(form[l.key])])),
    };
    if (form.lat.trim() && form.lng.trim()) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setNotice('Coordonnées GPS invalides (ex. 47.4284 et -0.5434).');
        return;
      }
      input.lat = lat;
      input.lng = lng;
    }
    update.mutate(input, {
      onSuccess: () => {
        setForm((f) => ({ ...f, ...Object.fromEntries(LINKS.map((l) => [l.key, normalizeUrl(f[l.key])])) }));
        setNotice('Fiche enregistrée ✓');
      },
    });
  }

  return (
    <>
      <SectionTitle title="Infos du circuit" />
      <Input label="Nom" value={form.name} onChangeText={set('name')} maxLength={80} />
      <Segmented
        options={[
          { value: 'indoor', label: 'Indoor' },
          { value: 'outdoor', label: 'Outdoor' },
        ]}
        value={indoor ? 'indoor' : 'outdoor'}
        onChange={(v) => setIndoor(v === 'indoor')}
      />
      <Input label="Adresse" value={form.address} onChangeText={set('address')} placeholder="17 rue Joseph Cugnot" />
      <View style={styles.row}>
        <View style={styles.small}>
          <Input label="Code postal" value={form.postal_code} onChangeText={set('postal_code')} keyboardType="number-pad" maxLength={5} />
        </View>
        <View style={styles.flex}>
          <Input label="Ville" value={form.city} onChangeText={set('city')} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Input label="Longueur (m)" value={form.length_m} onChangeText={set('length_m')} keyboardType="number-pad" maxLength={5} />
        </View>
        <View style={styles.flex}>
          <Input label="Karts" value={form.kart_power} onChangeText={set('kart_power')} placeholder="270cc, électrique…" />
        </View>
      </View>
      <Input
        label={`Présentation (${form.description.length}/600)`}
        value={form.description}
        onChangeText={set('description')}
        placeholder="Le circuit, les sessions, l’âge minimum, les conseils…"
        multiline
        maxLength={600}
        style={styles.multiline}
      />

      <SectionTitle title="Réservation et liens" />
      <Input label="Téléphone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={30} placeholder="02 41 00 00 00" />
      {LINKS.map((l) => (
        <Input
          key={l.key}
          label={l.label}
          value={form[l.key]}
          onChangeText={set(l.key)}
          placeholder={l.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      ))}
      <Text variant="caption">Sans lien de réservation, la fiche propose « Réserver par téléphone ».</Text>

      <SectionTitle title="Position sur la carte" />
      <Text variant="caption">
        Sur place, touche « Ma position actuelle ». Sinon, fais un appui long sur la piste dans Google Maps et recopie
        les deux nombres affichés.
      </Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Input label="Latitude" value={form.lat} onChangeText={set('lat')} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={styles.flex}>
          <Input label="Longitude" value={form.lng} onChangeText={set('lng')} keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      <Button
        title="Ma position actuelle"
        variant="secondary"
        icon={<Icon name={icons.locate} size={18} color={colors.text} />}
        loading={locating}
        onPress={locate}
      />

      {update.error ? <Text style={styles.error}>{update.error.message}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Button title="Enregistrer la fiche" size="lg" loading={update.isPending} onPress={save} />
      <Button title="Voir la fiche" variant="ghost" onPress={() => router.push({ pathname: '/track/[id]', params: { id: track.id } })} />
    </>
  );
}

/** Photo principale en haut de la fiche (format paysage conseillé). */
function CoverEditor({ track }: { track: TrackDetails }) {
  const update = useUpdateTrackPage(track.id);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [16, 9] });
      if (result.canceled) return;
      setUploading(true);
      const { uri, width } = result.assets[0];
      const url = await uploadTrackCover(track.id, uri, width);
      await update.mutateAsync({ cover_url: url });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d’envoyer la photo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <SectionTitle title="Photo principale" />
      {track.cover_url ? <Image source={{ uri: track.cover_url }} style={styles.cover} contentFit="cover" /> : null}
      <Text variant="caption">
        Affichée en grand en haut de la fiche. Sans photo, la plus récente des photos des pilotes est utilisée.
      </Text>
      <Button
        title={track.cover_url ? 'Changer la photo' : 'Choisir une photo'}
        variant="secondary"
        icon={<Icon name={icons.gallery} size={18} color={colors.text} />}
        loading={uploading}
        onPress={pick}
      />
      {track.cover_url ? (
        <Button title="Retirer la photo" variant="quiet" disabled={update.isPending} onPress={() => update.mutate({ cover_url: '' })} />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  );
}

/** Tracé : image envoyée depuis la galerie (PNG transparent conseillé). */
function LayoutEditor({ track }: { track: TrackDetails }) {
  const update = useUpdateTrackPage(track.id);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (result.canceled) return;
      setUploading(true);
      const { uri, width } = result.assets[0];
      const url = await uploadTrackLayout(track.id, uri, width);
      await update.mutateAsync({ layout_url: url });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d’envoyer le tracé.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <SectionTitle title="Tracé" />
      <TrackLayoutCard track={track} />
      <Button
        title={track.layout_url ? 'Remplacer le tracé' : 'Envoyer un tracé'}
        variant="secondary"
        icon={<Icon name={icons.route} size={18} color={colors.text} />}
        loading={uploading}
        onPress={pick}
      />
      {track.layout_url ? (
        <Button title="Retirer le tracé envoyé" variant="quiet" disabled={update.isPending} onPress={() => update.mutate({ layout_url: '' })} />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  );
}

/** Admins de ce karting (géré par les admins appli). */
function TrackAdmins({ trackId }: { trackId: string }) {
  const { userId } = useAuth();
  const admins = useTrackAdmins(trackId, true);
  const setAdmin = useSetTrackAdmin(trackId);
  const [query, setQuery] = useState('');
  const q = query.replace(/^@/, '').trim();
  const search = useSearchPilots(q);
  const ids = new Set((admins.data ?? []).map((a) => a.id));

  return (
    <>
      <SectionTitle title="Admins de ce karting" detail={`${admins.data?.length ?? ''}`} />
      <Text variant="caption">Ils modifient cette fiche (infos, liens, position, tracé) et modèrent ses photos.</Text>
      {admins.data?.length === 0 ? <Text variant="caption">Aucun admin karting pour l’instant.</Text> : null}
      {admins.data?.map((a) => (
        <PilotRow
          key={a.id}
          pilotId={a.id}
          username={a.username}
          avatarUrl={a.avatar_url}
          rank={a.rank}
          elo={a.elo}
          subtitle={a.id === userId ? 'Toi' : 'Admin karting'}
          trailing={
            <Button
              title="Retirer"
              variant="quiet"
              onPress={() =>
                confirmAction(`Retirer ${a.username} ?`, 'Il ne pourra plus modifier cette fiche.', 'Retirer', () =>
                  setAdmin.mutate({ pilotId: a.id, admin: false }),
                )
              }
            />
          }
        />
      ))}
      <Input label="Ajouter un admin karting" value={query} onChangeText={setQuery} placeholder="@pseudo" autoCapitalize="none" autoCorrect={false} />
      {q.length >= 2
        ? search.data
            ?.filter((p) => !ids.has(p.id))
            .map((p) => (
              <PilotRow
                key={p.id}
                pilotId={p.id}
                username={p.username}
                avatarUrl={p.avatar_url}
                rank={p.rank}
                elo={p.elo}
                subtitle={`@${p.username}`}
                trailing={
                  <Button
                    title="Ajouter"
                    variant="ghost"
                    onPress={() => {
                      setAdmin.mutate({ pilotId: p.id, admin: true });
                      setQuery('');
                    }}
                  />
                }
              />
            ))
        : null}
      {setAdmin.error ? <Text style={styles.error}>{setAdmin.error.message}</Text> : null}
      <Card style={styles.tip}>
        <Text variant="caption">
          Un exploitant peut aussi demander l’accès depuis la fiche du circuit : la demande arrive dans Administration.
        </Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  small: { width: 120 },
  multiline: { minHeight: 120, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
  notice: { color: colors.neon, fontWeight: '700' },
  tip: { borderLeftWidth: 3, borderLeftColor: colors.neon },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: colors.surfaceAlt },
});
