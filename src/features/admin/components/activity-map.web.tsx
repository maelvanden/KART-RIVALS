import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { bubbleSize, type ActivityMapProps } from '@/features/admin/components/activity-map.types';
import { isShortage } from '@/features/admin/panel';
import { colors, radius } from '@/theme';

// Cadre de la France métropolitaine.
const BOX = { north: 51.2, south: 42.2, west: -5.2, east: 8.4 };

/** Version web (aperçu) : bulles placées à l'échelle sur un fond neutre. */
export function ActivityMap({ depts, height, selected, onSelect }: ActivityMapProps) {
  const located = depts.filter((d) => d.dept && d.lat != null && d.lng != null && d.pilots > 0);
  const max = Math.max(1, ...located.map((d) => d.pilots));
  return (
    <View style={[styles.frame, { height }]}>
      {located.map((d) => {
        const size = bubbleSize(d.pilots, max);
        const color = isShortage(d) ? colors.orange : colors.neon;
        const x = (d.lng! - BOX.west) / (BOX.east - BOX.west);
        const y = (BOX.north - d.lat!) / (BOX.north - BOX.south);
        return (
          <Pressable
            key={d.dept}
            accessibilityRole="button"
            accessibilityLabel={`${d.dept} : ${d.pilots} pilotes`}
            onPress={() => onSelect(d.dept!)}
            style={[
              styles.bubble,
              {
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: size,
                height: size,
                borderRadius: size / 2,
                marginLeft: -size / 2,
                marginTop: -size / 2,
                borderColor: color,
                backgroundColor: `${color}33`,
              },
              selected === d.dept && styles.selected,
            ]}>
            <Text style={[styles.count, { color }]}>{d.pilots}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  bubble: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  selected: { borderWidth: 4 },
  count: { fontWeight: '900', fontSize: 12 },
});
