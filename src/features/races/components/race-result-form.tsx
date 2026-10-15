import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import type { RaceResultInput } from '@/features/races/api';
import { acceptedEntries } from '@/features/races/state';
import { parseLapTime } from '@/lib/format';
import { colors, radius, rankMeta, spacing } from '@/theme';
import type { Race } from '@/types/models';

/** Saisie du résultat par l'organisateur : la position (ou le meilleur tour) de chaque participant. */
export function RaceResultForm({ race, onSubmit, submitting }: { race: Race; onSubmit: (r: RaceResultInput) => void; submitting: boolean }) {
  const entries = acceptedEntries(race);
  const isLap = race.format === 'lap_time';
  const [values, setValues] = useState<Record<string, string>>({});
  const n = entries.length;

  const parsed = entries.map((e) => {
    const raw = values[e.pilot_id] ?? '';
    if (!raw) return null;
    if (isLap) return parseLapTime(raw);
    const v = Number(raw);
    return Number.isInteger(v) && v >= 1 && v <= n ? v : null;
  });
  const complete = parsed.every((v) => v !== null);
  const duplicates = !isLap && new Set(parsed.filter((v) => v !== null)).size !== parsed.filter((v) => v !== null).length;
  const invalid = entries.some((e, i) => (values[e.pilot_id] ?? '') !== '' && parsed[i] === null);

  function submit() {
    onSubmit(
      entries.map((e, i) =>
        isLap ? { pilot_id: e.pilot_id, best_lap_ms: parsed[i]! } : { pilot_id: e.pilot_id, position: parsed[i]! },
      ),
    );
  }

  return (
    <Card style={styles.card}>
      <Text variant="heading">Résultat de la course</Text>
      <Text variant="caption">
        {isLap
          ? 'Meilleur tour de chaque pilote (min:sec.millièmes). Le classement est calculé à partir des chronos.'
          : `Position à l’arrivée de chaque pilote, de 1 à ${n}.`}
      </Text>
      {entries.map((e) => (
        <View key={e.pilot_id} style={styles.row}>
          <Avatar username={e.pilot.username} url={e.pilot.avatar_url} size={34} borderColor={rankMeta[e.pilot.rank].color} />
          <Text style={styles.name} numberOfLines={1}>
            {e.pilot.username}
          </Text>
          <TextInput
            value={values[e.pilot_id] ?? ''}
            onChangeText={(t) => setValues((v) => ({ ...v, [e.pilot_id]: t }))}
            placeholder={isLap ? '1:02.345' : 'P'}
            placeholderTextColor={colors.textMuted}
            keyboardType={isLap ? 'numbers-and-punctuation' : 'number-pad'}
            maxLength={isLap ? 9 : 1}
            accessibilityLabel={`${isLap ? 'Meilleur tour' : 'Position'} de ${e.pilot.username}`}
            style={[styles.input, isLap && styles.inputWide]}
          />
        </View>
      ))}
      {invalid ? <Text style={styles.error}>{isLap ? 'Format attendu : 1:02.345 ou 62.3' : `Position entre 1 et ${n}.`}</Text> : null}
      {duplicates ? <Text style={styles.error}>Deux pilotes ne peuvent pas avoir la même position.</Text> : null}
      <Text variant="caption">Le résultat compte quand plus de la moitié des participants l’ont validé.</Text>
      <Button title="Envoyer le résultat" onPress={submit} loading={submitting} disabled={!complete || duplicates} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { flex: 1, fontWeight: '800', fontSize: 15 },
  input: {
    width: 56,
    minHeight: 44,
    textAlign: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : {}),
  },
  inputWide: { width: 110 },
  error: { color: colors.danger },
});
