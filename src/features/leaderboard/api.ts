import { useQuery } from '@tanstack/react-query';

import { demoLeaderboard, demoProfile, isDemoMode } from '@/lib/demo';
import { regionOfDepartment } from '@/lib/regions';
import { supabase } from '@/lib/supabase';
import type { LeaderboardEntry } from '@/types/models';

/**
 * Région et département : ceux du pilote connecté si `code` est absent
 * (circuit favori, sinon circuit le plus proche de sa position).
 */
export type LeaderboardScope =
  | { kind: 'global' }
  | { kind: 'local'; lat: number; lng: number }
  | { kind: 'region'; code?: string }
  | { kind: 'department'; code?: string };

/** Positions d'un pilote ; null tant qu'il n'a pas de match validé (ou sans région connue). */
export type PilotStandings = {
  department: string | null;
  region: string | null;
  national: number | null;
  national_total: number | null;
  region_position: number | null;
  region_total: number | null;
  department_position: number | null;
  department_total: number | null;
};

// Démo : département de chaque pilote du classement.
const DEMO_DEPARTMENTS: Record<string, string> = { 'demo-me': '49', p1: '49', p2: '44', p3: '49', p5: '35', p6: '75', p7: '44' };

function demoRows() {
  return demoLeaderboard.map((e) => (e.id === demoProfile.id ? { ...e, avatar_url: demoProfile.avatar_url } : e));
}

function demoArea(rows: LeaderboardEntry[], kind: 'region' | 'department', code: string) {
  return rows
    .filter((e) => {
      const d = DEMO_DEPARTMENTS[e.id];
      return kind === 'department' ? d === code : regionOfDepartment(d ?? null) === code;
    })
    .map((e, i) => ({ ...e, position: i + 1 }));
}

export function useLeaderboard(scope: LeaderboardScope | null) {
  return useQuery({
    queryKey: ['leaderboard', scope],
    enabled: !!scope,
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      if (isDemoMode) {
        const rows = demoRows();
        if (scope?.kind === 'local') return rows.slice(3);
        if (scope?.kind === 'region') return demoArea(rows, 'region', scope.code ?? 'Pays de la Loire');
        if (scope?.kind === 'department') return demoArea(rows, 'department', scope.code ?? '49');
        return rows;
      }
      if (scope!.kind === 'local') {
        const { data, error } = await supabase.rpc('leaderboard_near', { lat: scope!.lat, lng: scope!.lng, radius_km: 50 });
        if (error) throw error;
        return data;
      }
      if (scope!.kind === 'region' || scope!.kind === 'department') {
        const { data, error } = await supabase.rpc('leaderboard_area', { p_scope: scope!.kind, p_code: scope!.code ?? null });
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

/** « 3e des Hauts-de-France, 1er du Nord, 412e en France ». */
export function usePilotStandings(pilotId: string | null | undefined) {
  return useQuery({
    queryKey: ['leaderboard', 'standings', pilotId],
    enabled: !!pilotId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PilotStandings | null> => {
      if (isDemoMode) {
        const rows = demoRows();
        const department = DEMO_DEPARTMENTS[pilotId!] ?? null;
        const region = regionOfDepartment(department);
        const me = rows.find((e) => e.id === pilotId);
        const inRegion = region ? demoArea(rows, 'region', region) : [];
        const inDepartment = department ? demoArea(rows, 'department', department) : [];
        return {
          department,
          region,
          national: me?.position ?? null,
          national_total: me ? 1284 : null,
          region_position: inRegion.find((e) => e.id === pilotId)?.position ?? null,
          region_total: me && region ? 512 : null,
          department_position: inDepartment.find((e) => e.id === pilotId)?.position ?? null,
          department_total: me && department ? 143 : null,
        };
      }
      const { data, error } = await supabase.rpc('pilot_standings', { p_profile: pilotId });
      if (error) throw error;
      return data as PilotStandings | null;
    },
  });
}
