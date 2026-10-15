import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

/**
 * Écoute les changements sur les défis et les matchs du pilote connecté (filtrés par RLS)
 * et rafraîchit les écrans concernés : défi reçu, accepté, résultat déclaré, validé…
 */
export function useChallengesRealtime(userId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || isDemoMode) return;
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
      queryClient.invalidateQueries({ queryKey: ['challenge'] });
      queryClient.invalidateQueries({ queryKey: ['races'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['elo-history'] });
    };
    const channel = supabase
      .channel(`challenges:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'races' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_entries' }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
