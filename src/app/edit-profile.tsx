import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useMyProfile, useUpdateProfile } from '@/features/profile/api';
import { useTracks } from '@/features/tracks/api';
import { colors, spacing } from '@/theme';
import type { Profile } from '@/types/models';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export default function EditProfileScreen() {
  const profile = useMyProfile();
  if (!profile.data) return <Screen safeTop={false}><Loading /></Screen>;
  return <EditProfileForm profile={profile.data} />;
}

function EditProfileForm({ profile }: { profile: Profile }) {
  const tracks = useTracks();
  const update = useUpdateProfile();
  const [username, setUsername] = useState(profile.username);
  const [kartNumber, setKartNumber] = useState(profile.kart_number ? String(profile.kart_number) : '');
  const [homeTrackId, setHomeTrackId] = useState<string | null>(profile.home_track_id);
  const [discoverable, setDiscoverable] = useState(profile.is_discoverable);

  const usernameValid = USERNAME_PATTERN.test(username);
  const parsedNumber = kartNumber ? Number(kartNumber) : null;
  const numberValid = parsedNumber === null || (parsedNumber >= 1 && parsedNumber <= 999);
  const error = update.error as { code?: string; message?: string } | null;
  const errorText = error?.code === '23505' ? 'Ce pseudo est déjà pris.' : error?.message;

  function save() {
    update.mutate(
      { username, kart_number: parsedNumber, home_track_id: homeTrackId, is_discoverable: discoverable },
      { onSuccess: () => router.back() },
    );
  }

  return (
    <Screen safeTop={false}>
      <View style={styles.form}>
        <Input
          label="Pseudo"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
        {!usernameValid ? <Text style={styles.error}>3 à 20 caractères : lettres, chiffres ou _</Text> : null}
        <Input
          label="Numéro de kart"
          value={kartNumber}
          onChangeText={(t) => setKartNumber(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="Aucun"
          maxLength={3}
        />
      </View>

      <View style={styles.form}>
        <Text variant="label">Circuit favori</Text>
        <Chips
          options={[
            { value: null as string | null, label: 'Aucun' },
            ...(tracks.data ?? []).map((t) => ({ value: t.id as string | null, label: `${t.name} · ${t.city}` })),
          ]}
          value={homeTrackId}
          onChange={setHomeTrackId}
        />
      </View>

      <Card style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text variant="heading">Visible dans « Pilotes »</Text>
          <Text variant="caption">
            Les pilotes proches peuvent te trouver et te défier. Seule une position approximative (~1 km) est
            utilisée.
          </Text>
        </View>
        <Switch
          value={discoverable}
          onValueChange={setDiscoverable}
          trackColor={{ true: colors.neon, false: colors.surfaceAlt }}
          thumbColor={colors.text}
          accessibilityLabel="Visible dans Pilotes"
        />
      </Card>

      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
      <Button title="Enregistrer" onPress={save} loading={update.isPending} disabled={!usernameValid || !numberValid} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  error: { color: colors.danger },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  switchText: { flex: 1, gap: spacing.xs },
});
