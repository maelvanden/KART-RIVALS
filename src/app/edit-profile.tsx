import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { Avatar } from '@/components/ui/avatar';
import { useMyProfile, useUpdateProfile } from '@/features/profile/api';
import { pickSquarePhoto, useSetAvatar } from '@/features/profile/avatar';
import { DeleteAccountCard } from '@/features/profile/components/delete-account-card';
import { useTracksMap } from '@/features/tracks/api';
import { openPrivacyPolicy, openTerms } from '@/lib/legal';
import { TrackPicker } from '@/features/tracks/components/track-picker';
import { colors, rankMeta, spacing } from '@/theme';
import type { Profile } from '@/types/models';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export default function EditProfileScreen() {
  const profile = useMyProfile();
  if (!profile.data) return <Screen safeTop={false}><Loading /></Screen>;
  return <EditProfileForm profile={profile.data} />;
}

function EditProfileForm({ profile }: { profile: Profile }) {
  const tracks = useTracksMap();
  const update = useUpdateProfile();
  const setAvatar = useSetAvatar();
  const [pickError, setPickError] = useState<string | null>(null);
  const [username, setUsername] = useState(profile.username);
  const [kartNumber, setKartNumber] = useState(profile.kart_number ? String(profile.kart_number) : '');
  const [homeTrackId, setHomeTrackId] = useState<string | null>(profile.home_track_id);
  const [discoverable, setDiscoverable] = useState(profile.is_discoverable);

  const usernameValid = USERNAME_PATTERN.test(username);
  const parsedNumber = kartNumber ? Number(kartNumber) : null;
  const numberValid = parsedNumber === null || (parsedNumber >= 1 && parsedNumber <= 999);
  const error = update.error as { code?: string; message?: string } | null;
  const errorText = error?.code === '23505' ? 'Ce pseudo est déjà pris.' : error?.message;

  async function choosePhoto() {
    setPickError(null);
    try {
      const uri = await pickSquarePhoto();
      if (uri) setAvatar.mutate(uri);
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Impossible d’ouvrir tes photos.');
    }
  }

  const avatarError = pickError ?? (setAvatar.error as Error | null)?.message;

  function save() {
    update.mutate(
      { username, kart_number: parsedNumber, home_track_id: homeTrackId, is_discoverable: discoverable },
      { onSuccess: () => router.back() },
    );
  }

  return (
    <Screen safeTop={false}>
      <View style={styles.photoRow}>
        <Avatar
          username={profile.username}
          url={profile.avatar_url}
          size={84}
          borderColor={rankMeta[profile.rank].color}
        />
        <View style={styles.photoActions}>
          <Button
            title={profile.avatar_url ? 'Changer la photo' : 'Ajouter une photo'}
            variant="secondary"
            onPress={choosePhoto}
            loading={setAvatar.isPending}
          />
          {profile.avatar_url ? (
            <Button
              title="Retirer la photo"
              variant="quiet"
              onPress={() => setAvatar.mutate(null)}
              disabled={setAvatar.isPending}
            />
          ) : null}
        </View>
      </View>
      {avatarError ? <Text style={styles.error}>{avatarError}</Text> : null}

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
        {tracks.data ? (
          <TrackPicker tracks={tracks.data} value={homeTrackId} onChange={setHomeTrackId} />
        ) : null}
      </View>

      <Card style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text variant="heading">Visible dans « Pilotes »</Text>
          <Text variant="caption">
            Les pilotes proches te voient dans la liste « autour de toi » (position approximative, ~1 km). Même
            invisible, on peut toujours te trouver par ton pseudo.
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

      <Button title="Conditions d’utilisation" variant="ghost" onPress={openTerms} />
      <Button title="Politique de confidentialité" variant="ghost" onPress={openPrivacyPolicy} />
      <DeleteAccountCard />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  photoActions: { flex: 1, gap: spacing.xs },
  error: { color: colors.danger },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  switchText: { flex: 1, gap: spacing.xs },
});
