import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { markerColor, type TrackMapProps } from '@/features/tracks/components/track-map.types';
import { colors, radius, spacing } from '@/theme';

const PAD = 0.14;

/**
 * Version web (aperçu) : les fonds de carte ne sont pas disponibles, on place donc les circuits
 * par leurs coordonnées GPS sur un plan simplifié, à l'échelle (projection équirectangulaire).
 */
export function TrackMap({ tracks, height, selectedId, onSelect }: TrackMapProps) {
  if (tracks.length === 0) return <View style={[styles.frame, { height }]} />;

  const midLat = tracks.reduce((s, t) => s + t.lat, 0) / tracks.length;
  const kx = Math.cos((midLat * Math.PI) / 180); // 1° de longitude est plus court qu'1° de latitude
  const xs = tracks.map((t) => t.lng * kx);
  const ys = tracks.map((t) => t.lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY, 0.05);

  // Position normalisée 0..1 de chaque circuit.
  const points = tracks.map((t) => ({
    x: PAD + ((t.lng * kx - (minX + maxX) / 2) / span + 0.5) * (1 - 2 * PAD),
    y: PAD + (0.5 - (t.lat - (minY + maxY) / 2) / span) * (1 - 2 * PAD),
  }));

  // Voisin le plus proche de chaque point (pour éviter que les libellés se chevauchent).
  const nearest = points.map((p, i) =>
    points
      .map((q, j) => ({ ...q, j, d: Math.hypot(q.x - p.x, q.y - p.y) }))
      .filter((q) => q.j !== i)
      .sort((a, b) => a.d - b.d)[0],
  );
  const CLOSE = 0.25;

  // Libellé à droite du point, sauf au bord droit ou si un voisin proche est à droite (et qu'il y a la place à gauche).
  const labelOnLeft = points.map((p, i) => {
    const n = nearest[i];
    return p.x > 0.7 || (!!n && n.d < CLOSE && n.x > p.x && p.x > 0.3);
  });
  // Deux voisins proches dont les libellés partent du même côté : on les écarte verticalement.
  const labelShift = points.map((p, i) => {
    const n = nearest[i];
    if (!n || n.d >= CLOSE || labelOnLeft[n.j] !== labelOnLeft[i]) return 0;
    return p.y < n.y ? -9 : 9;
  });

  return (
    <View style={[styles.frame, { height }]}>
      {[1, 2, 3].map((i) => (
        <View key={`h${i}`} style={[styles.gridH, { top: `${i * 25}%` }]} />
      ))}
      {[1, 2, 3].map((i) => (
        <View key={`v${i}`} style={[styles.gridV, { left: `${i * 25}%` }]} />
      ))}
      <Text variant="label" style={styles.watermark}>
        Maine-et-Loire
      </Text>

      {tracks.map((t, i) => {
        const selected = t.id === selectedId;
        const color = markerColor(t, colors.neon, colors.orange);
        const left = labelOnLeft[i];
        return (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityLabel={`${t.name}, ${t.city}`}
            onPress={() => onSelect?.(t)}
            style={[
              styles.marker,
              left ? styles.markerLeft : styles.markerRight,
              { left: `${points[i].x * 100}%`, top: `${points[i].y * 100}%` },
            ]}>
            <View
              style={[styles.dot, selected && styles.selected, { backgroundColor: color, shadowColor: color }]}
            />
            <Text
              style={[
                styles.label,
                left && styles.labelLeft,
                { transform: [{ translateY: labelShift[i] }] },
                selected && { color: colors.text },
              ]}
              numberOfLines={1}>
              {t.name}
            </Text>
          </Pressable>
        );
      })}

      <View style={styles.legend}>
        <Legend color={colors.neon} label="Indoor" />
        <Legend color={colors.orange} label="Outdoor" />
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#0F1216',
  },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border, opacity: 0.5 },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.border, opacity: 0.5 },
  watermark: { position: 'absolute', top: spacing.md, left: spacing.md, opacity: 0.6 },
  // Le point est ancré sur la coordonnée ; le libellé se place à côté (largeur fixe pour l'alignement).
  marker: { position: 'absolute', width: 150, height: 24, alignItems: 'center', gap: 6 },
  markerRight: { flexDirection: 'row', transform: [{ translateX: -12 }, { translateY: -12 }] },
  markerLeft: { flexDirection: 'row-reverse', transform: [{ translateX: -138 }, { translateY: -12 }] },
  dot: {
    marginHorizontal: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: colors.background,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  selected: { width: 24, height: 24, borderRadius: 12, marginHorizontal: 0 },
  label: { flex: 1, fontSize: 11, fontWeight: '700', color: colors.textMuted },
  labelLeft: { textAlign: 'right' },
  legend: { position: 'absolute', right: spacing.md, bottom: spacing.sm, flexDirection: 'row', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.textMuted, fontWeight: '700' },
});
