import { useQuery } from '@tanstack/react-query';

import { demoLeaderboard, demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { LeaderboardEntry } from '@/types/models';

export type LeaderboardScope = { kind: 'global' } | { kind: 'local'; lat: number; lng: number };

export function useLeaderboard(scope: LeaderboardScope | null) {
  return useQuery({
    queryKey: ['leaderboard', scope],
    enabled: !!scope,
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      if (isDemoMode) {
        const rows = demoLeaderboard.map((e) => (e.id === demoProfile.id ? { ...e, avatar_url: demoProfile.avatar_url } : e));
        return scope?.kind === 'local' ? rows.slice(3) : rows;
      }
      if (scope!.kind === 'local') {
        const { data, error } = await supabase.rpc('leaderboard_near', { lat: scope!.lat, lng: scope!.lng, radius_km: 50 });
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('leaderboard_global')
        .select('id, username, avatar_url, elo, rank, wins, losses, position')
        .order('position')
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
}
