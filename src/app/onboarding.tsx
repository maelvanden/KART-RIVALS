import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useCreateProfile } from '@/features/profile/api';
import { useTracksMap } from '@/features/tracks/api';
import { TrackPicker } from '@/features/tracks/components/track-picker';
import { colors, spacing } from '@/theme';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export default function OnboardingScreen() {
  const [username, setUsername] = useState('');
  const [kartNumber, setKartNumber] = useState('');
  const [homeTrackId, setHomeTrackId] = useState<string | null>(null);
  const createProfile = useCreateProfile();
  const tracks = useTracksMap();

  const usernameValid = USERNAME_PATTERN.test(username);
  const parsedNumber = kartNumber ? Number(kartNumber) : null;
  const numberValid = parsedNumber === null || (Number.isInteger(parsedNumber) && parsedNumber >= 1 && parsedNumber <= 999);

  const error = createProfile.error as { code?: string; message?: string } | null;
  const errorText = error?.code === '23505' ? 'Ce pseudo est déjà pris.' : error?.message;

  return (
    <Screen subtitle="Étape 1 / 1" title="Ta licence de pilote">
      <Text variant="caption" style={styles.intro}>
        Choisis ton pseudo, ton numéro de kart et ton circuit. Tu démarres à 1000 ELO, rang Novice.
      </Text>
      <View style={styles.form}>
        <Input
          label="Pseudo"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Senna_Jr"
          maxLength={20}
        />
        <Text variant="caption">3 à 20 caractères : lettres, chiffres ou _</Text>
        <Input
          label="Numéro de kart (optionnel)"
          value={kartNumber}
          onChangeText={(t) => setKartNumber(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="44"
          maxLength={3}
        />
      </View>

      <View style={styles.form}>
        <Text variant="label">Ton circuit favori</Text>
        <Text variant="caption">
          Celui où tu roules le plus : il s’affiche sur ta licence et tu apparais dans son classement.
        </Text>
        {tracks.data ? (
          <TrackPicker
            tracks={tracks.data}
            value={homeTrackId}
            onChange={setHomeTrackId}
            noneLabel="Je choisirai plus tard"
          />
        ) : null}
      </View>

      {errorText ? <Text style={{ color: colors.danger }}>{errorText}</Text> : null}
      <Button
        title="Valider ma licence"
        disabled={!usernameValid || !numberValid}
        loading={createProfile.isPending}
        onPress={() => createProfile.mutate({ username, kart_number: parsedNumber, home_track_id: homeTrackId })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 15, lineHeight: 21 },
  form: { gap: spacing.md },
});
