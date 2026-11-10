import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { conditionsLabel, rankRange, type EloRange } from '@/features/tournaments/bracket';
import { colors, rankMeta, rankThresholds, spacing } from '@/theme';
import type { RankTier } from '@/types/models';

type Mode = 'all' | 'rank' | 'elo';

const TIERS = rankThresholds.map((t) => ({ value: t.tier, label: rankMeta[t.tier].label }));
const toElo = (text: string) => (text.trim() === '' ? null : Number.parseInt(text, 10));

type Props = {
  /** ELO du pilote connecté, pour le prévenir s'il s'exclut lui-même. */
  myElo: number | undefined;
  /** Fourchette choisie ; `valid` est faux tant que la saisie est incohérente. */
  onChange: (range: EloRange, valid: boolean) => void;
};

/** Conditions d'entrée : ouvert à tous, réservé à des rangs, ou à une fourchette d'ELO. */
export function ConditionsField({ myElo, onChange }: Props) {
  const [mode, setMode] = useState<Mode>('all');
  const [from, setFrom] = useState<RankTier>('bronze');
  const [to, setTo] = useState<RankTier>('or');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  function compute(next: { mode?: Mode; from?: RankTier; to?: RankTier; min?: string; max?: string }) {
    const m = next.mode ?? mode;
    if (m === 'all') return { range: { minElo: null, maxElo: null }, valid: true };
    if (m === 'rank') return { range: rankRange(next.from ?? from, next.to ?? to), valid: true };
    const range = { minElo: toElo(next.min ?? min), maxElo: toElo(next.max ?? max) };
    const numbers = [range.minElo, range.maxElo].every((n) => n === null || (Number.isFinite(n) && n >= 0));
    const ordered = range.minElo === null || range.maxElo === null || range.minElo <= range.maxElo;
    return { range, valid: numbers && ordered && (range.minElo !== null || range.maxElo !== null) };
  }
  const current = compute({});
  const update = (next: Parameters<typeof compute>[0]) => {
    const result = compute(next);
    onChange(result.range, result.valid);
  };

  const label = current.valid ? conditionsLabel({ min_elo: current.range.minElo, max_elo: current.range.maxElo }) : null;
  const excluded =
    current.valid &&
    myElo !== undefined &&
    ((current.range.minElo !== null && myElo < current.range.minElo) || (current.range.maxElo !== null && myElo > current.range.maxElo));

  return (
    <View style={styles.field}>
      <Segmented
        options={[
          { value: 'all', label: 'Tous' },
          { value: 'rank', label: 'Par rang' },
          { value: 'elo', label: 'Par ELO' },
        ]}
        value={mode}
        onChange={(v) => {
          setMode(v);
          update({ mode: v });
        }}
      />

      {mode === 'rank' ? (
        <>
          <Text variant="caption">Du rang</Text>
          <Chips
            options={TIERS}
            value={from}
            onChange={(v) => {
              setFrom(v);
              update({ from: v });
            }}
          />
          <Text variant="caption">au rang</Text>
          <Chips
            options={TIERS}
            value={to}
            onChange={(v) => {
              setTo(v);
              update({ to: v });
            }}
          />
        </>
      ) : null}

      {mode === 'elo' ? (
        <View style={styles.row}>
          <View style={styles.cell}>
            <Input
              label="ELO minimum"
              value={min}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, '').slice(0, 4);
                setMin(digits);
                update({ min: digits });
              }}
              keyboardType="number-pad"
              placeholder="Aucun"
            />
          </View>
          <View style={styles.cell}>
            <Input
              label="ELO maximum"
              value={max}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, '').slice(0, 4);
                setMax(digits);
                update({ max: digits });
              }}
              keyboardType="number-pad"
              placeholder="Aucun"
            />
          </View>
        </View>
      ) : null}

      <Text variant="caption">
        {mode === 'all'
          ? 'Ouvert à tous les pilotes, quel que soit leur niveau.'
          : label
            ? `Réservé aux pilotes : ${label}. Vérifié à l’inscription ; un inscrit qui progresse ensuite garde sa place.`
            : mode === 'rank'
              ? 'De Novice à Légende : ouvert à tous les pilotes.'
              : 'Indique un minimum, un maximum, ou les deux (le minimum ne peut pas dépasser le maximum).'}
      </Text>
      {excluded ? (
        <Text style={styles.warning}>
          Avec {myElo} ELO, tu ne remplis pas ces conditions : tu organiseras et arbitreras le tournoi sans y rouler.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  cell: { flex: 1 },
  warning: { color: colors.orange },
});
