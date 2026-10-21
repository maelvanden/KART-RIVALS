import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { CORRECTION_KINDS, useSubmitTrackCorrection, type CorrectionKind } from '@/features/tracks/corrections';
import { useTrack } from '@/features/tracks/api';
import { parseCoordinates } from '@/lib/regions';
import { colors, radius, spacing } from '@/theme';

/** « Signaler une erreur sur cette fiche » : la remontée arrive dans le panel admin. */
export default function TrackCorrectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const track = useTrack(id);
  const submit = useSubmitTrackCorrection(id);
  const [kind, setKind] = useState<CorrectionKind | null>(null);
  const [message, setMessage] = useState('');
  const [coords, setCoords] = useState('');
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const position = parseCoordinates(coords);
  const meta = CORRECTION_KINDS.find((k) => k.value === kind);

  async function locate() {
    setLocating(true);
    setLocError(null);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) throw new Error('Autorise la localisation dans les réglages.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setCoords(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
    } catch (e) {
      setLocError(e instanceof Error ? e.message : 'Position introuvable.');
    } finally {
      setLocating(false);
    }
  }

  if (submit.isSuccess) {
    return (
      <Screen safeTop={false}>
        <Card style={styles.done}>
          <Icon name={icons.checkCircle} size={36} color={colors.neon} />
          <Text variant="heading">Merci pour ton aide !</Text>
          <Text variant="caption" style={styles.center}>
            L’équipe vérifie ta remontée. Si la fiche est corrigée grâce à toi, tu gagnes 20 points pour la boutique.
          </Text>
          <Button title="Retour à la fiche" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen safeTop={false}>
      <Text variant="heading">{track.data?.name ?? 'Circuit'}</Text>
      <Text variant="caption">Qu’est-ce qui est faux sur cette fiche ?</Text>
      <View style={styles.kinds}>
        {CORRECTION_KINDS.map((k) => {
          const active = k.value === kind;
          return (
            <Pressable
              key={k.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setKind(k.value)}
              style={[styles.kind, active && styles.kindActive]}>
              <Text style={[styles.kindText, active && styles.kindTextActive]}>{k.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {meta ? (
        <>
          <Input
            label={`Détails (${message.length}/500)`}
            value={message}
            onChangeText={setMessage}
            placeholder={meta.hint}
            multiline
            maxLength={500}
            style={styles.multiline}
          />
          {kind === 'position' ? (
            <>
              <Input
                label="Position de la piste (facultatif, sur place ou depuis Google Maps)"
                value={coords}
                onChangeText={setCoords}
                placeholder="47.4284, -0.5434"
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
              />
              {coords && !position ? <Text style={styles.error}>Format attendu : latitude, longitude.</Text> : null}
              <Button
                title="Ma position actuelle"
                variant="secondary"
                icon={<Icon name={icons.locate} size={18} color={colors.text} />}
                loading={locating}
                onPress={locate}
              />
              {locError ? <Text style={styles.error}>{locError}</Text> : null}
            </>
          ) : null}
          {submit.error ? <Text style={styles.error}>{submit.error.message}</Text> : null}
          <Button
            title="Envoyer"
            size="lg"
            loading={submit.isPending}
            onPress={() => submit.mutate({ kind: kind!, message, lat: position?.lat, lng: position?.lng })}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kind: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  kindActive: { backgroundColor: colors.neon, borderColor: colors.neon },
  kindText: { fontWeight: '800', fontSize: 13, color: colors.text },
  kindTextActive: { color: colors.onNeon },
  multiline: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
  done: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  center: { textAlign: 'center' },
});
