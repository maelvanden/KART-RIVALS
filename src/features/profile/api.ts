import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import {
  demoEloHistoryFor,
  demoMatchesFor,
  demoPilot,
  demoProfile,
  demoState,
  demoTracks,
  isDemoMode,
} from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import { rankForElo } from '@/theme';
import type { EloPoint, HeadToHead, PilotMatch, Profile } from '@/types/models';

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
