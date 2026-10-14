import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { demoEloHistory, demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import { rankForElo } from '@/theme';
import type { EloPoint, Profile } from '@/types/models';

const PROFILE_COLUMNS =
  'id, username, avatar_url, kart_number, home_track_id, elo, rank, wins, losses, draws, matches_played';

export function useMyProfile() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      // Copie : en démo, l'objet est modifié en place après un match validé.
      if (isDemoMode) return { ...demoProfile, rank: rankForElo(demoProfile.elo) };
      const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useEloHistory(profileId: string | undefined) {
  return useQuery({
    queryKey: ['elo-history', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<EloPoint[]> => {
      if (isDemoMode) return [...demoEloHistory];
      const { data, error } = await supabase
        .from('elo_history')
        .select('delta, elo_after, created_at')
        .eq('profile_id', profileId!)
        .order('created_at', { ascending: true })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProfile() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { username: string; kart_number: number | null }) => {
      const { error } = await supabase.from('profiles').insert({ id: userId!, ...input });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
  });
}
