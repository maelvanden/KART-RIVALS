import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { normalizeUrl, useAdminRoles } from '@/features/admin/api';
import { useCreateTrack } from '@/features/admin/panel';
import { SectionTitle } from '@/features/social/components/section-title';
import { DEPARTMENT_NAMES, parseCoordinates } from '@/lib/regions';
import { colors, spacing } from '@/theme';

/** Création d'un circuit par un admin appli ; la fiche se complète ensuite (photo, tracé, liens). */
export default function NewTrackScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const create = useCreateTrack();
  const [indoor, setIndoor] = useState(false);
  const [form, setForm] = useState({
    name: '',
    address: '',
    postal_code: '',
    city: '',
    length_m: '',
    kart_power: '',
    website: '',
    phone: '',
    description: '',
    coords: '',
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => {
    setNotice(null);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const department = DEPARTMENT_NAMES[form.postal_code.slice(0, 2)];
  const coords = parseCoordinates(form.coords);

  async function locate() {
    setLocating(true);
    setNotice(null);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) throw new Error('Autorise la localisation dans les réglages.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setForm((f) => ({ ...f, coords: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}` }));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Position introuvable.');
    } finally {
      setLocating(false);
    }
  }

  function save() {
    if (!coords) {
      setNotice('Ajoute la position GPS du circuit (ex. 47.4284, -0.5434).');
      return;
    }
    create.mutate(
      {
        name: form.name,
        city: form.city,
        postal_code: form.postal_code,
        address: form.address,
        // Apostrophe droite, comme les départements déjà en base (Côtes-d'Armor…).
        region: department?.replace(/’/g, "'"),
        is_indoor: indoor,
        length_m: form.length_m.replace(/\D/g, ''),
        kart_power: form.kart_power,
        website: normalizeUrl(form.website),
        phone: form.phone,
        description: form.description,
        lat: coords.lat,
        lng: coords.lng,
      },
      { onSuccess: (id) => router.replace({ pathname: '/admin/track/[id]', params: { id } }) },
    );
  }

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  return (
    <Screen safeTop={false}>
      <SectionTitle title="Le circuit" />
      <Input label="Nom" value={form.name} onChangeText={set('name')} maxLength={80} placeholder="Karting de…" />
      <Segmented
        options={[
          { value: 'outdoor', label: 'Outdoor' },
          { value: 'indoor', label: 'Indoor' },
        ]}
        value={indoor ? 'indoor' : 'outdoor'}
        onChange={(v) => setIndoor(v === 'indoor')}
      />
      <Input label="Adresse" value={form.address} onChangeText={set('address')} placeholder="Route de…" />
      <View style={styles.row}>
        <View style={styles.small}>
          <Input label="Code postal" value={form.postal_code} onChangeText={set('postal_code')} keyboardType="number-pad" maxLength={5} />
        </View>
        <View style={styles.flex}>
          <Input label="Ville" value={form.city} onChangeText={set('city')} />
        </View>
      </View>
      {department ? <Text variant="caption">Département : {department}</Text> : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Input label="Longueur (m)" value={form.length_m} onChangeText={set('length_m')} keyboardType="number-pad" maxLength={5} />
        </View>
        <View style={styles.flex}>
          <Input label="Karts" value={form.kart_power} onChangeText={set('kart_power')} placeholder="270cc, électrique…" />
        </View>
      </View>
      <Input label="Téléphone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={30} />
      <Input label="Site officiel" value={form.website} onChangeText={set('website')} autoCapitalize="none" keyboardType="url" placeholder="https://…" />
      <Input
        label={`Présentation (${form.description.length}/600)`}
        value={form.description}
        onChangeText={set('description')}
        multiline
        maxLength={600}
        style={styles.multiline}
        placeholder="Piste, karts, horaires, saison…"
      />

      <SectionTitle title="Position sur la carte" />
      <Text variant="caption">
        Dans Google Maps, fais un appui long sur la piste puis copie les coordonnées affichées (ex. 47.4284, -0.5434) et
        colle-les ici. Sur place, utilise « Ma position actuelle ».
      </Text>
      <Input
        label="Coordonnées GPS"
        value={form.coords}
        onChangeText={set('coords')}
        keyboardType="numbers-and-punctuation"
        placeholder="47.4284, -0.5434"
        autoCorrect={false}
      />
      {form.coords && !coords ? <Text style={styles.error}>Format attendu : latitude, longitude.</Text> : null}
      <Button
        title="Ma position actuelle"
        variant="secondary"
        icon={<Icon name={icons.locate} size={18} color={colors.text} />}
        loading={locating}
        onPress={locate}
      />

      {create.error ? <Text style={styles.error}>{create.error.message}</Text> : null}
      {notice ? <Text style={styles.error}>{notice}</Text> : null}
      <Button title="Créer le circuit" size="lg" loading={create.isPending} onPress={save} />
      <Text variant="caption">Ensuite, tu pourras ajouter la photo principale, le tracé et les réseaux sociaux.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  small: { width: 120 },
  multiline: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
});
