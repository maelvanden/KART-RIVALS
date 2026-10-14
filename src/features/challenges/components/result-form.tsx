import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import type { ResultInput } from '@/features/challenges/api';
import { parseLapTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { Challenge } from '@/types/models';

type Props = {
  challenge: Challenge;
  myId: string;
  onSubmit: (result: ResultInput) => void;
  submitting: boolean;
};

/** Feuille de temps : chaque pilote saisit sa valeur et celle de l'adversaire. */
export function ResultForm({ challenge, myId, onSubmit, submitting }: Props) {
  const [mine, setMine] = useState('');
  const [theirs, setTheirs] = useState('');
  const iAmChallenger = challenge.challenger_id === myId;
  const rival = iAmChallenger ? challenge.opponent : challenge.challenger;
  const isLap = challenge.format === 'lap_time';

  const parse = (v: string) => {
    if (isLap) return parseLapTime(v);
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
  };
  const myValue = parse(mine);
  const theirValue = parse(theirs);
  const sameValue = myValue !== null && myValue === theirValue && !isLap;

  function submit() {
    if (myValue === null || theirValue === null) return;
    const [challengerValue, opponentValue] = iAmChallenger ? [myValue, theirValue] : [theirValue, myValue];
    onSubmit(
      isLap
        ? { format: 'lap_time', challengerLapMs: challengerValue, opponentLapMs: opponentValue }
        : { format: 'position', challengerPosition: challengerValue, opponentPosition: opponentValue },
    );
  }

  const placeholder = isLap ? '1:02.345' : '1';
  const keyboard = isLap ? 'numbers-and-punctuation' : 'number-pad';

  return (
    <Card style={styles.card}>
      <Text variant="heading">Feuille de temps</Text>
      <Text variant="caption">
        {isLap
          ? 'Meilleur tour de chacun (min:sec.millièmes). Le plus rapide gagne.'
          : 'Position à l’arrivée de chacun. Le mieux classé gagne.'}
      </Text>
      <View style={styles.row}>
        <View style={styles.field}>
          <Input label="Toi" value={mine} onChangeText={setMine} placeholder={placeholder} keyboardType={keyboard} />
        </View>
        <View style={styles.field}>
          <Input label={rival.username} value={theirs} onChangeText={setTheirs} placeholder={placeholder} keyboardType={keyboard} />
        </View>
      </View>
      {(mine && myValue === null) || (theirs && theirValue === null) ? (
        <Text style={styles.error}>{isLap ? 'Format attendu : 1:02.345 ou 62.3' : 'Position entre 1 et 99.'}</Text>
      ) : null}
      {sameValue ? <Text style={styles.error}>Deux pilotes ne peuvent pas avoir la même position.</Text> : null}
      <Text variant="caption">{rival.username} devra confirmer ce résultat avant le calcul de l’ELO.</Text>
      <Button
        title="Envoyer le résultat"
        onPress={submit}
        loading={submitting}
        disabled={myValue === null || theirValue === null || sameValue}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  field: { flex: 1 },
  error: { color: colors.danger },
});
