import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { demoProfile, demoTrackDetails, demoTracks, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { Coords } from '@/features/nearby/api';
import type { Track, TrackDetails, TrackLeaderboardEntry } from '@/types/models';

export function useTracks() {
  return useQuery({
    queryKey: ['tracks'],
    queryFn: async (): Promise<Track[]> => {
      if (isDemoMode) return [...demoTracks];
      const { data, error } = await supabase.from('tracks').select('id, name, city').order('name');
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Ajoute un circuit. Sans géocodage pour l'instant : il est placé à la position approximative
 * du pilote, qui l'ajoute en général depuis sa région.
 */
export function useCreateTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, city, coords }: { name: string; city: string; coords: Coords }): Promise<Track> => {
      if (isDemoMode) {
        const track = { id: `t-${Date.now()}`, name, city };
        demoTracks.push(track);
        demoTrackDetails.push({
          ...track, address: null, postal_code: null, region: null, is_indoor: false, length_m: null,
          kart_power: null, is_verified: false, lat: coords.lat, lng: coords.lng,
        });
        return track;
      }
      const { data, error } = await supabase
        .from('tracks')
        .insert({ name, city, location: `SRID=4326;POINT(${coords.lng} ${coords.lat})` })
        .select('id, name, city')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tracks'] }),
        queryClient.invalidateQueries({ queryKey: ['tracks-map'] }),
      ]),
  });
}

const TRACK_MAP_COLUMNS =
  'id, name, address, postal_code, city, region, is_indoor, length_m, kart_power, is_verified, lat, lng';

/** Tous les circuits avec leurs coordonnées, pour la carte. */
export function useTracksMap() {
  return useQuery({
    queryKey: ['tracks-map'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TrackDetails[]> => {
      if (isDemoMode) return [...demoTrackDetails];
      const { data, error } = await supabase.from('tracks_map').select(TRACK_MAP_COLUMNS).order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useTrack(id: string | undefined) {
  return useQuery({
    queryKey: ['tracks-map', id],
    enabled: !!id,
    queryFn: async (): Promise<TrackDetails | null> => {
      if (isDemoMode) return demoTrackDetails.find((t) => t.id === id) ?? null;
      const { data, error } = await supabase.from('tracks_map').select(TRACK_MAP_COLUMNS).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Pilotes ayant couru des matchs validés sur ce circuit, par nombre de victoires. */
export function useTrackLeaderboard(id: string | undefined) {
  return useQuery({
    queryKey: ['leaderboard', 'track', id],
    enabled: !!id,
    queryFn: async (): Promise<TrackLeaderboardEntry[]> => {
      if (isDemoMode) {
        // Exemple : sur le circuit favori du pilote de démo, quelques habitués.
        if (id !== demoProfile.home_track_id) return [];
        return [
          { id: 'p3', username: 'ApexHunter', elo: 1467, rank: 'or', wins: 9, matches: 12 },
          { id: demoProfile.id, username: demoProfile.username, elo: demoProfile.elo, rank: demoProfile.rank, wins: 6, matches: 10 },
          { id: 'p1', username: 'TurboLéa', elo: 1342, rank: 'argent', wins: 5, matches: 9 },
          { id: 'p2', username: 'Drift_Max', elo: 1198, rank: 'bronze', wins: 2, matches: 7 },
        ];
      }
      const { data, error } = await supabase.rpc('track_leaderboard', { p_track_id: id, p_limit: 20 });
      if (error) throw error;
      return data;
    },
  });
}
