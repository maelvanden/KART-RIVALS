import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { markerColor, type TrackMapProps } from '@/features/tracks/components/track-map.types';
import { regionFor } from '@/lib/geo';
import { colors, radius } from '@/theme';

/** Carte native (Apple Plans sur iPhone, Google Maps sur Android). */
export function TrackMap({ tracks, height, selectedId, onSelect }: TrackMapProps) {
  if (tracks.length === 0) return <View style={[styles.frame, { height }]} />;
  return (
    <View style={[styles.frame, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(tracks)}
        userInterfaceStyle="dark"
        showsUserLocation
        showsPointsOfInterests={false}
        toolbarEnabled={false}>
        {tracks.map((t) => {
          const selected = t.id === selectedId;
          const color = markerColor(t, colors.neon, colors.orange);
          return (
            <Marker
              key={t.id}
              coordinate={{ latitude: t.lat, longitude: t.lng }}
              title={t.name}
              description={`${t.city} · ${t.is_indoor ? 'Indoor' : 'Outdoor'}`}
              onPress={() => onSelect?.(t)}>
              <View
                style={[
                  styles.dot,
                  selected && styles.selected,
                  { backgroundColor: color, shadowColor: color },
                ]}
              />
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: colors.background,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  selected: { width: 26, height: 26, borderRadius: 13 },
});
