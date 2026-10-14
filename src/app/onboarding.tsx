import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useCreateProfile } from '@/features/profile/api';
import { colors, spacing } from '@/theme';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export default function OnboardingScreen() {
  const [username, setUsername] = useState('');
  const [kartNumber, setKartNumber] = useState('');
  const createProfile = useCreateProfile();

  const usernameValid = USERNAME_PATTERN.test(username);
  const parsedNumber = kartNumber ? Number(kartNumber) : null;
  const numberValid = parsedNumber === null || (Number.isInteger(parsedNumber) && parsedNumber >= 1 && parsedNumber <= 999);

  const error = createProfile.error as { code?: string; message?: string } | null;
  const errorText = error?.code === '23505' ? 'Ce pseudo est déjà pris.' : error?.message;

  return (
    <Screen subtitle="Étape 1 / 1" title="Ta licence de pilote">
      <Text variant="caption" style={styles.intro}>
        Choisis ton pseudo de course et ton numéro de kart. Tu démarres à 1000 ELO, rang Novice.
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
        {errorText ? <Text style={{ color: colors.danger }}>{errorText}</Text> : null}
        <Button
          title="Valider ma licence"
          disabled={!usernameValid || !numberValid}
          loading={createProfile.isPending}
          onPress={() => createProfile.mutate({ username, kart_number: parsedNumber })}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 15, lineHeight: 21 },
  form: { gap: spacing.md },
});
