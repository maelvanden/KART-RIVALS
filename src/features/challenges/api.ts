import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { demoChallenges, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { Challenge } from '@/types/models';

const CHALLENGE_SELECT = `
  id, challenger_id, opponent_id, status, format, scheduled_at, message, created_at,
  challenger:profiles!challenges_challenger_id_fkey (id, username, elo, rank),
  opponent:profiles!challenges_opponent_id_fkey (id, username, elo, rank),
  track:tracks (id, name, city)
`;

export function useMyChallenges() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['challenges', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Challenge[]> => {
      if (isDemoMode) return demoChallenges;
      const { data, error } = await supabase
        .from('challenges')
        .select(CHALLENGE_SELECT)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as Challenge[];
    },
  });
}

export function useRespondChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      if (isDemoMode) return;
      const { error } = await supabase.rpc('respond_challenge', { p_challenge_id: id, p_accept: accept });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['challenges'] }),
  });
}
