import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { pickSquarePhoto } from '@/features/profile/avatar';
import { TeamCrest } from '@/features/social/components/team-crest';
import { useCreateTeam } from '@/features/social/teams';
import { colors, spacing } from '@/theme';

const TAG_PATTERN = /^[A-Z0-9]{2,4}$/;

/** Fonder une écurie : nom, tag (2 à 4 caractères) et blason. */
export default function NewTeamScreen() {
  const create = useCreateTeam();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const cleanTag = tag.trim().toUpperCase();
  const nameOk = name.trim().length >= 3 && name.trim().length <= 30;
  const tagOk = TAG_PATTERN.test(cleanTag);

  async function pickLogo() {
    setPickError(null);
    try {
      const uri = await pickSquarePhoto();
      if (uri) setLogoUri(uri);
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Impossible d’ouvrir les photos.');
    }
  }

  async function submit() {
    await create.mutateAsync({ name, tag: cleanTag, logoUri });
    router.replace('/team');
  }

  return (
    <Screen safeTop={false}>
      <View style={styles.preview}>
        <Pressable accessibilityRole="button" accessibilityLabel="Choisir le blason" onPress={pickLogo}>
          <TeamCrest tag={cleanTag || 'TAG'} logoUrl={logoUri} size={110} />
        </Pressable>
        <Text variant="title" style={styles.previewName} numberOfLines={2}>
          {name.trim() || 'Ton écurie'}
        </Text>
        <Button title={logoUri ? 'Changer le blason' : 'Ajouter un blason'} variant="ghost" onPress={pickLogo} />
        {pickError ? <Text style={styles.error}>{pickError}</Text> : null}
      </View>

      <Card style={styles.form}>
        <Input label="Nom de l’écurie" value={name} onChangeText={setName} placeholder="Volt Racing Angers" maxLength={30} />
        <Input
          label="Tag (2 à 4 lettres ou chiffres)"
          value={tag}
          onChangeText={(t) => setTag(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          placeholder="VRA"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={4}
        />
        <Text variant="caption">
          Le tag s’affiche à côté du pseudo de chaque pilote de l’écurie, comme RBR pour Red Bull Racing. Tu deviens Team Principal :
          toi seul recrutes et gères les pilotes.
        </Text>
      </Card>

      {create.error ? <Text style={styles.error}>{(create.error as Error).message}</Text> : null}
      <Button title="Fonder l’écurie" size="lg" disabled={!nameOk || !tagOk} loading={create.isPending} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  previewName: { textAlign: 'center' },
  form: { gap: spacing.lg },
  error: { color: colors.danger, textAlign: 'center' },
});
