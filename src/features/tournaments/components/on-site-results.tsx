import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useRecordTournamentResult } from '@/features/tournaments/api';
import { matchLabel, roundCount } from '@/features/tournaments/bracket';
import { confirmAction } from '@/lib/confirm';
import { parseLapTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { Tournament, TournamentMatch } from '@/types/models';

/**
 * Tournoi sur place : l'organisateur saisit le résultat de chaque duel en cours. À la position, il désigne le
 * vainqueur ; au meilleur tour, il entre les deux chronos.
 */
export function OnSiteResults({ tournament: t, myId }: { tournament: Tournament; myId: string }) {
  const record = useRecordTournamentResult();
  const rounds = roundCount(t.size);
  const live = t.matches
    .filter((m) => !m.decided_at && m.challenge_id)
    .sort((a, b) => a.round - b.round || a.slot - b.slot);
  const name = (pilotId: string | null) => t.entries.find((e) => e.pilot_id === pilotId)?.pilot.username ?? 'Pilote';

  if (live.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text variant="label">Saisir les résultats · {live.length}</Text>
      <Text variant="caption">
        {t.is_official
          ? 'Tournoi officiel : chaque résultat saisi est validé tout de suite et compte pour l’ELO des deux pilotes.'
          : 'Le tableau avance dès que tu saisis un résultat. Ces duels ne comptent pas pour l’ELO (seuls ceux d’un tournoi officiel comptent).'}
      </Text>
      {live.map((m) => (
        <Entry
          key={m.id}
          match={m}
          label={matchLabel(m.round, rounds, m.slot)}
          nameA={name(m.pilot_a)}
          nameB={name(m.pilot_b)}
          lapTime={t.format === 'lap_time'}
          // Le karting ne juge pas son propre duel dans un tournoi officiel.
          locked={t.is_official && (m.pilot_a === myId || m.pilot_b === myId)}
          pending={record.isPending}
          onRecord={(result, winner) =>
            confirmAction(`${winner} gagne ?`, 'Le résultat est définitif : le tableau avance aussitôt.', 'Valider', () =>
              record.mutate({ matchId: m.id, result }),
            )
          }
        />
      ))}
      {record.error ? <Text style={{ color: colors.danger }}>{(record.error as Error).message}</Text> : null}
    </View>
  );
}

function Entry({
  match,
  label,
  nameA,
  nameB,
  lapTime,
  locked,
  pending,
  onRecord,
}: {
  match: TournamentMatch;
  label: string;
  nameA: string;
  nameB: string;
  lapTime: boolean;
  locked: boolean;
  pending: boolean;
  onRecord: (result: Parameters<ReturnType<typeof useRecordTournamentResult>['mutate']>[0]['result'], winner: string) => void;
}) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const aMs = parseLapTime(a);
  const bMs = parseLapTime(b);
  const tie = aMs !== null && bMs !== null && aMs === bMs;

  return (
    <Card style={styles.entry} accessibilityLabel={`${label} : ${nameA} contre ${nameB}`}>
      <Text variant="caption">{label}</Text>
      {locked ? (
        <Text variant="caption">
          {nameA} contre {nameB} : c’est ton propre duel, saisis le résultat depuis le défi comme les autres pilotes.
        </Text>
      ) : lapTime ? (
        <>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Input label={nameA} value={a} onChangeText={setA} placeholder="42.318" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={styles.cell}>
              <Input label={nameB} value={b} onChangeText={setB} placeholder="42.905" keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          {tie ? <Text style={{ color: colors.orange }}>Pas d’égalité en tournoi : il faut départager les deux chronos.</Text> : null}
          <Button
            title="Valider les chronos"
            variant="secondary"
            disabled={aMs === null || bMs === null || tie || pending}
            onPress={() => onRecord({ format: 'lap_time', aLapMs: aMs!, bLapMs: bMs! }, aMs! < bMs! ? nameA : nameB)}
          />
        </>
      ) : (
        <>
          <Text style={styles.question}>Qui a fini devant ?</Text>
          <View style={styles.row}>
            <Button
              title={nameA}
              variant="secondary"
              style={styles.cell}
              disabled={pending}
              onPress={() => onRecord({ format: 'position', winner: 'a' }, nameA)}
            />
            <Button
              title={nameB}
              variant="secondary"
              style={styles.cell}
              disabled={pending}
              onPress={() => onRecord({ format: 'position', winner: 'b' }, nameB)}
            />
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  entry: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  cell: { flex: 1 },
  question: { fontWeight: '700' },
});
