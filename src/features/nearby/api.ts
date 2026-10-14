import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';

import { demoNearby, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { NearbyPilot } from '@/types/models';

export type Coords = { lat: number; lng: number };

/** Arrondi à 2 décimales (~1 km) : la position exacte du pilote ne quitte jamais le téléphone. */
const coarse = (n: number) => Math.round(n * 100) / 100;

export function useApproxLocation() {
  return useQuery({
    queryKey: ['approx-location'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Coords | null> => {
      if (isDemoMode) return { lat: 47.47, lng: -0.55 };
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return null;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { lat: coarse(pos.coords.latitude), lng: coarse(pos.coords.longitude) };
      // Met à jour la position approximative du profil pour être visible des autres pilotes.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await supabase
          .from('profiles')
          .update({ location: `SRID=4326;POINT(${coords.lng} ${coords.lat})`, location_updated_at: new Date().toISOString() })
          .eq('id', data.session.user.id);
      }
      return coords;
    },
  });
}

export function useNearbyPilots(coords: Coords | null | undefined, radiusKm: number) {
  return useQuery({
    queryKey: ['nearby', coords, radiusKm],
    enabled: !!coords,
    queryFn: async (): Promise<NearbyPilot[]> => {
      if (isDemoMode) return demoNearby.filter((p) => p.distance_km <= radiusKm);
      const { data, error } = await supabase.rpc('nearby_pilots', { lat: coords!.lat, lng: coords!.lng, radius_km: radiusKm });
      if (error) throw error;
      return data;
    },
  });
}
