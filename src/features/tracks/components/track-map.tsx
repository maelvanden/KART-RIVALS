import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import Supercluster from 'supercluster';

import { markerColor, type TrackMapProps } from '@/features/tracks/components/track-map.types';
import { regionFor } from '@/lib/geo';
import { colors, radius } from '@/theme';
import type { TrackDetails } from '@/types/models';

/** Niveau de zoom (0 = monde entier) correspondant à la largeur affichée. */
const zoomOf = (r: Region) => Math.max(0, Math.min(20, Math.round(Math.log2(360 / r.longitudeDelta))));

/**
 * Carte native (Apple Plans sur iPhone, Google Maps sur Android). Les circuits proches sont regroupés en une bulle
 * qui affiche leur nombre ; en zoomant, les bulles se séparent jusqu'aux circuits. Toucher une bulle zoome dessus.
 */
export function TrackMap({ tracks: input, height, selectedId, onSelect }: TrackMapProps) {
  const map = useRef<MapView>(null);
  // Liste figée tant que les circuits affichés ne changent pas : l'index et le recadrage ne se refont pas à chaque rendu.
  const key = input.map((t) => `${t.id}:${t.lat},${t.lng}`).join('|');
  const [stable, setStable] = useState({ key, tracks: input });
  if (stable.key !== key) setStable({ key, tracks: input });
  const tracks = stable.tracks;
  const initial = useMemo(() => (tracks.length ? regionFor(tracks) : null), [tracks]);
  const [region, setRegion] = useState<Region | null>(initial);

  // Nouveau filtre (département, indoor…) : on recadre sur les circuits affichés.
  useEffect(() => {
    if (initial) map.current?.animateToRegion(initial, 350);
  }, [initial]);

  const index = useMemo(() => {
    const sc = new Supercluster<{ track: TrackDetails }>({ radius: 60, maxZoom: 13 });
    sc.load(
      tracks.map((t) => ({
        type: 'Feature' as const,
        properties: { track: t },
        geometry: { type: 'Point' as const, coordinates: [t.lng, t.lat] },
      })),
    );
    return sc;
  }, [tracks]);

  const view = region ?? initial;
  const clusters = useMemo(() => {
    if (!view) return [];
    // Marge d'une demi-largeur autour de l'écran pour que les bulles n'apparaissent pas au dernier moment.
    const { latitude: lat, longitude: lng, latitudeDelta: dLat, longitudeDelta: dLng } = view;
    return index.getClusters([lng - dLng, lat - dLat, lng + dLng, lat + dLat], zoomOf(view));
  }, [index, view]);

  if (!initial) return <View style={[styles.frame, { height }]} />;

  const zoomInto = (clusterId: number, latitude: number, longitude: number) => {
    const zoom = Math.min(index.getClusterExpansionZoom(clusterId), 16);
    const delta = 360 / 2 ** zoom;
    map.current?.animateToRegion({ latitude, longitude, latitudeDelta: delta, longitudeDelta: delta }, 350);
  };

  return (
    <View style={[styles.frame, { height }]}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={initial}
        onRegionChangeComplete={setRegion}
        userInterfaceStyle="dark"
        showsUserLocation
        showsPointsOfInterests={false}
        toolbarEnabled={false}>
        {clusters.map((c) => {
          const [longitude, latitude] = c.geometry.coordinates;
          if ('cluster' in c.properties && c.properties.cluster) {
            const { cluster_id: id, point_count: count } = c.properties;
            const size = count < 10 ? 34 : count < 50 ? 40 : 48;
            return (
              <Marker
                key={`c${id}-${count}`}
                coordinate={{ latitude, longitude }}
                tracksViewChanges={false}
                onPress={() => zoomInto(id, latitude, longitude)}>
                <View style={[styles.cluster, { width: size, height: size, borderRadius: size / 2 }]}>
                  <Text style={styles.clusterText}>{count}</Text>
                </View>
              </Marker>
            );
          }
          const t = (c.properties as { track: TrackDetails }).track;
          const selected = t.id === selectedId;
          const color = markerColor(t, colors.neon, colors.orange);
          return (
            <Marker
              key={`${t.id}-${selected ? 1 : 0}`}
              coordinate={{ latitude: t.lat, longitude: t.lng }}
              title={t.name}
              description={`${t.city} · ${t.is_indoor ? 'Indoor' : 'Outdoor'}`}
              tracksViewChanges={false}
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
  cluster: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 3,
    borderColor: colors.neon,
    shadowColor: colors.neon,
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  clusterText: { color: colors.neon, fontWeight: '900', fontSize: 14 },
});
