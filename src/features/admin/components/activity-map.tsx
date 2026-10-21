import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { bubbleSize, type ActivityMapProps } from '@/features/admin/components/activity-map.types';
import { isShortage } from '@/features/admin/panel';
import { colors, radius } from '@/theme';

const FRANCE = { latitude: 46.6, longitude: 2.4, latitudeDelta: 11, longitudeDelta: 11 };

/** Carte d'activité : une bulle par département (taille = pilotes ; orange = il manque des kartings). */
export function ActivityMap({ depts, height, selected, onSelect }: ActivityMapProps) {
  const located = depts.filter((d) => d.dept && d.lat != null && d.lng != null && d.pilots > 0);
  const max = Math.max(1, ...located.map((d) => d.pilots));
  return (
    <View style={[styles.frame, { height }]}>
      <MapView style={StyleSheet.absoluteFill} initialRegion={FRANCE} userInterfaceStyle="dark" showsPointsOfInterests={false} toolbarEnabled={false}>
        {located.map((d) => {
          const size = bubbleSize(d.pilots, max);
          const color = isShortage(d) ? colors.orange : colors.neon;
          return (
            <Marker
              key={`${d.dept}-${d.pilots}-${selected === d.dept ? 1 : 0}`}
              coordinate={{ latitude: d.lat!, longitude: d.lng! }}
              tracksViewChanges={false}
              onPress={() => onSelect(d.dept!)}>
              <View
                style={[
                  styles.bubble,
                  { width: size, height: size, borderRadius: size / 2, borderColor: color, backgroundColor: `${color}33` },
                  selected === d.dept && styles.selected,
                ]}>
                <Text style={[styles.count, { color }]}>{d.pilots}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  bubble: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  selected: { borderWidth: 4 },
  count: { fontWeight: '900', fontSize: 12 },
});
