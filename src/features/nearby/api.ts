import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';

import { useAuth } from '@/features/auth/auth-provider';
import { useBlockedIds } from '@/features/social/safety';
import { demoLeaderboard, demoNearby, demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { NearbyPilot, Profile } from '@/types/models';

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
  const blocked = useBlockedIds();
  return useQuery({
    queryKey: ['nearby', coords, radiusKm],
    enabled: !!coords,
    select: (pilots) => pilots.filter((p) => !blocked.has(p.id)),
    queryFn: async (): Promise<NearbyPilot[]> => {
      if (isDemoMode) return demoNearby.filter((p) => p.distance_km <= radiusKm);
      const { data, error } = await supabase.rpc('nearby_pilots', { lat: coords!.lat, lng: coords!.lng, radius_km: radiusKm });
      if (error) throw error;
      return data;
    },
  });
}

export type PilotSearchResult = Pick<Profile, 'id' | 'username' | 'avatar_url' | 'elo' | 'rank' | 'wins' | 'losses'>;

/** Échappe les jokers de ILIKE (% et _, fréquent dans les pseudos). */
const escapeLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Recherche par pseudo, partout (pas seulement à proximité). Dès 2 caractères. */
export function useSearchPilots(query: string) {
  const { userId } = useAuth();
  const q = query.trim();
  // Les pilotes bloqués n'apparaissent plus (ceux qui m'ont bloqué : leurs actions sont refusées côté serveur).
  const blocked = useBlockedIds();
  return useQuery({
    queryKey: ['search-pilots', q],
    enabled: q.length >= 2,
    select: (pilots) => pilots.filter((p) => !blocked.has(p.id)),
    staleTime: 60_000,
    queryFn: async (): Promise<PilotSearchResult[]> => {
      if (isDemoMode) {
        const all = new Map([...demoNearby, ...demoLeaderboard].map((p) => [p.id, p]));
        return [...all.values()].filter(
          (p) => p.id !== demoProfile.id && p.username.toLowerCase().includes(q.toLowerCase()),
        );
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, elo, rank, wins, losses')
        .ilike('username', `%${escapeLike(q)}%`)
        .neq('id', userId!)
        .is('banned_at', null)
        .order('elo', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
}
