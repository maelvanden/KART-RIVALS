import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { formatLapTime } from '@/lib/format';
import { colors } from '@/theme';
import type { LapProgressPoint } from '@/types/models';

const HEIGHT = 120;
const DOT = 8;
const LINE = 2;
/** Marge intérieure : les points des bords et leur étiquette restent visibles. */
const PAD_X = DOT;
const PAD_Y = 18;

const monthFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

type Props = { laps: LapProgressPoint[]; bestIndex: number; accessibilityLabel: string };

/**
 * Courbe des chronos sur un circuit, axe vertical inversé : plus c'est rapide, plus c'est haut (une courbe qui monte
 * = une progression). Axe horizontal proportionnel au temps. Tracée avec des vues (pas de dépendance SVG).
 */
export function LapChart({ laps, bestIndex, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(0);
  const times = laps.map((l) => Date.parse(l.driven_at));
  const fastest = Math.min(...laps.map((l) => l.lap_ms));
  const slowest = Math.max(...laps.map((l) => l.lap_ms));
  const t0 = times[0];
  const span = times[times.length - 1] - t0;

  const points = laps.map((l, i) => {
    const xRatio = span > 0 ? (times[i] - t0) / span : laps.length > 1 ? i / (laps.length - 1) : 0.5;
    const yRatio = slowest > fastest ? (slowest - l.lap_ms) / (slowest - fastest) : 0.5;
    return {
      x: PAD_X + xRatio * Math.max(0, width - 2 * PAD_X),
      y: PAD_Y + (1 - yRatio) * (HEIGHT - 2 * PAD_Y),
    };
  });

  return (
    <View>
      <View
        style={styles.chart}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}>
        {width > 0 ? (
          <>
            {/* Ligne du record. */}
            <View style={[styles.recordLine, { top: points[bestIndex].y }]} />
            {points.slice(1).map((p, i) => {
              const a = points[i];
              const dx = p.x - a.x;
              const dy = p.y - a.y;
              const length = Math.hypot(dx, dy);
              return (
                <View
                  key={`seg-${i}`}
                  style={[
                    styles.segment,
                    {
                      width: length,
                      left: (a.x + p.x) / 2 - length / 2,
                      top: (a.y + p.y) / 2 - LINE / 2,
                      transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                    },
                  ]}
                />
              );
            })}
            {points.map((p, i) => {
              const best = i === bestIndex;
              const size = best ? DOT + 4 : DOT;
              return (
                <View
                  key={`dot-${i}`}
                  style={[styles.dot, best && styles.bestDot, { width: size, height: size, left: p.x - size / 2, top: p.y - size / 2 }]}
                />
              );
            })}
            <Text
              style={[
                styles.bestLabel,
                { top: Math.max(0, points[bestIndex].y - PAD_Y), [points[bestIndex].x > width / 2 ? 'right' : 'left']: 0 },
              ]}>
              {formatLapTime(laps[bestIndex].lap_ms)}
            </Text>
          </>
        ) : null}
      </View>
      <View style={styles.axis}>
        <Text variant="caption">{monthFormat.format(new Date(laps[0].driven_at))}</Text>
        {laps.length > 1 ? <Text variant="caption">{monthFormat.format(new Date(laps[laps.length - 1].driven_at))}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { height: HEIGHT },
  recordLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.neonDim },
  segment: { position: 'absolute', height: LINE, borderRadius: LINE / 2, backgroundColor: colors.neon, opacity: 0.55 },
  dot: { position: 'absolute', borderRadius: DOT, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.neon },
  bestDot: { backgroundColor: colors.neon, borderColor: colors.neon },
  bestLabel: { position: 'absolute', fontSize: 12, fontWeight: '800', color: colors.neon, fontVariant: ['tabular-nums'] },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
});
