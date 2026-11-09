import { useQuery } from '@tanstack/react-query';

import { demoTimeAttackLeaderboard, demoTimeAttackTracks, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { TimeAttackLeaderboardEntry, TimeAttackTrack } from '@/types/models';

// Clés sous « time-attack » : rafraîchies à chaque session Time Attack validée, comme la liste des sessions.

/** Circuits qui ont au moins un chrono Time Attack, les plus disputés d'abord. */
export function useTimeAttackTracks(enabled: boolean) {
  return useQuery({
    queryKey: ['time-attack', 'tracks'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TimeAttackTrack[]> => {
      if (isDemoMode) return demoTimeAttackTracks();
      const { data, error } = await supabase.rpc('time_attack_tracks');
      if (error) throw error;
      return data;
    },
  });
}

/** Classement Time Attack d'un circuit : le meilleur tour certifié de chaque pilote. */
export function useTimeAttackLeaderboard(trackId: string | null) {
  return useQuery({
    queryKey: ['time-attack', 'leaderboard', trackId],
    enabled: !!trackId,
    queryFn: async (): Promise<TimeAttackLeaderboardEntry[]> => {
      if (isDemoMode) return demoTimeAttackLeaderboard(trackId!);
      const { data, error } = await supabase.rpc('time_attack_leaderboard', { p_track_id: trackId, p_limit: 100 });
      if (error) throw error;
      return data;
    },
  });
}
