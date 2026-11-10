import { useMemo } from 'react';
import { View } from 'react-native';

import { Chips } from '@/components/ui/chips';
import { nextDays } from '@/lib/schedule';
import { spacing } from '@/theme';

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

type Props = {
  /** Jour choisi (minuit, en ms) ; null = `noneLabel`. */
  day: number | null;
  hour: number;
  onChange: (day: number | null, hour: number) => void;
  noneLabel: string;
  days?: number;
};

/** Choix d'un jour puis d'une heure ronde, ou « aucun ». */
export function WhenField({ day, hour, onChange, noneLabel, days = 21 }: Props) {
  const options = useMemo(() => nextDays(days), [days]);
  return (
    <View style={{ gap: spacing.md }}>
      <Chips options={[{ value: null, label: noneLabel }, ...options]} value={day} onChange={(d) => onChange(d, hour)} />
      {day !== null ? (
        <Chips options={HOURS.map((h) => ({ value: h, label: `${h}h00` }))} value={hour} onChange={(h) => onChange(day, h)} />
      ) : null}
    </View>
  );
}
