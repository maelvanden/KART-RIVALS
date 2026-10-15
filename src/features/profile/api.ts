import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import {
  demoEloHistoryFor,
  demoMatchesFor,
  demoPilotLapRecords,
  demoPilot,
  demoProfile,
  demoState,
  demoTracks,
  isDemoMode,
} from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import { rankForElo } from '@/theme';
import type { BadgeStats, EloPoint, HeadToHead, PilotLapRecord, PilotMatch, Profile } from '@/types/models';

const PROFILE_COLUMNS = `
  id, username, avatar_url, kart_number, home_track_id, elo, rank, wins, losses, draws, matches_played,
  is_discoverable, home_track:tracks (id, name, city)
`;

async function fetchProfile(id: string): Promise<Profile | null> {
  if (isDemoMode) {
    const p = demoPilot(id);
    // Copie : en démo, le profil est modifié en place après un match validé ou une édition.
    return p ? { ...p, rank: rankForElo(p.elo) } : null;
  }
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as unknown as Profile | null;
}

export function useProfile(id: string | null | undefined) {
  return useQuery({
    queryKey: ['profile', id],
    enabled: !!id,
    queryFn: () => fetchProfile(id!),
  });
}

export function useMyProfile() {
  const { userId } = useAuth();
  return useProfile(userId);
}

export function useEloHistory(profileId: string | undefined) {
  return useQuery({
    queryKey: ['elo-history', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<EloPoint[]> => {
      if (isDemoMode) {
        const p = demoPilot(profileId!);
        return p ? demoEloHistoryFor(p) : [];
      }
      const { data, error } = await supabase
        .from('elo_history')
        .select('delta, elo_after, created_at')
        .eq('profile_id', profileId!)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      // Les 30 plus récents, remis dans l'ordre chronologique pour le graphique.
      return data.reverse();
    },
  });
}

export function usePilotMatches(profileId: string | undefined) {
  return useQuery({
    queryKey: ['elo-history', 'matches', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<PilotMatch[]> => {
      if (isDemoMode) {
        const p = demoPilot(profileId!);
        return p ? demoMatchesFor(p) : [];
      }
      const { data, error } = await supabase.rpc('pilot_recent_matches', { p_profile_id: profileId, p_limit: 10 });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProfile() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { username: string; kart_number: number | null; home_track_id: string | null }) => {
      if (isDemoMode) {
        Object.assign(demoProfile, input, {
          home_track: demoTracks.find((t) => t.id === input.home_track_id) ?? null,
          // Nouvelle licence : on repart de zéro.
          elo: 1000, rank: 'novice', wins: 0, losses: 0, draws: 0, matches_played: 0,
        });
        demoState.hasProfile = true;
        return;
      }
      const { error } = await supabase.from('profiles').insert({ id: userId!, ...input });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
  });
}

export type ProfileUpdate = {
  username: string;
  kart_number: number | null;
  home_track_id: string | null;
  is_discoverable: boolean;
};

export function useUpdateProfile() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ProfileUpdate>) => {
      if (isDemoMode) {
        Object.assign(demoProfile, input);
        if ('home_track_id' in input) {
          demoProfile.home_track = demoTracks.find((t) => t.id === input.home_track_id) ?? null;
        }
        return;
      }
      const { error } = await supabase.from('profiles').update(input).eq('id', userId!);
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
        queryClient.invalidateQueries({ queryKey: ['nearby'] }),
      ]),
  });
}

/** Bilan du pilote connecté face à un autre pilote (matchs validés). */
export function useHeadToHead(otherId: string | undefined) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['elo-history', 'h2h', userId, otherId],
    enabled: !!otherId && !!userId && otherId !== userId,
    queryFn: async (): Promise<HeadToHead> => {
      if (isDemoMode) {
        const games = demoMatchesFor(demoProfile).filter((m) => m.opponent_id === otherId);
        const last = games[0];
        return {
          my_wins: games.filter((m) => m.outcome === 'win').length,
          their_wins: games.filter((m) => m.outcome === 'loss').length,
          draws: games.filter((m) => m.outcome === 'draw').length,
          matches: games.length,
          elo_net: games.reduce((sum, m) => sum + (m.elo_delta ?? 0), 0),
          last_played_at: last?.confirmed_at ?? null,
          last_outcome: last?.outcome ?? null,
          last_track: last?.track_name ?? null,
        };
      }
      const { data, error } = await supabase.rpc('head_to_head', { p_other: otherId }).single();
      if (error) throw error;
      return data as HeadToHead;
    },
  });
}

/** Statistiques servant aux badges d'un pilote (calculées côté base à partir des matchs validés). */
export function useBadgeStats(profileId: string | undefined) {
  return useQuery({
    queryKey: ['elo-history', 'badges', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<BadgeStats> => {
      if (isDemoMode) {
        const p = demoPilot(profileId!);
        const games = p ? demoMatchesFor(p).reverse() : []; // ordre chronologique
        let best = 0;
        let run = 0;
        for (const g of games) {
          run = g.outcome === 'win' ? run + 1 : 0;
          best = Math.max(best, run);
        }
        const history = p ? demoEloHistoryFor(p) : [];
        const isMe = profileId === demoProfile.id;
        return {
          matches: p?.matches_played ?? 0,
          wins: p?.wins ?? 0,
          best_streak: isMe && (p?.matches_played ?? 0) > 0 ? Math.max(best, 4) : best,
          current_streak: run,
          tracks_raced: new Set(games.map((g) => g.track_name)).size,
          lap_time_matches: games.filter((g) => g.format === 'lap_time').length,
          peak_elo: Math.max(p?.elo ?? 1000, ...history.map((h) => h.elo_after)),
          giant_kills: isMe && (p?.wins ?? 0) > 0 ? 1 : 0,
          crowned_tracks: profileId === 'p3' ? ['SpeedPark Angers'] : [],
        };
      }
      const { data, error } = await supabase.rpc('pilot_badge_stats', { p_profile_id: profileId }).single();
      if (error) throw error;
      return data as BadgeStats;
    },
  });
}

/** Meilleur tour du pilote sur chaque circuit, avec sa place au classement des chronos. */
export function usePilotLapRecords(profileId: string | undefined) {
  return useQuery({
    queryKey: ['elo-history', 'laps', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<PilotLapRecord[]> => {
      if (isDemoMode) return demoPilotLapRecords(profileId!);
      const { data, error } = await supabase.rpc('pilot_lap_records', { p_profile_id: profileId });
      if (error) throw error;
      return data;
    },
  });
}
