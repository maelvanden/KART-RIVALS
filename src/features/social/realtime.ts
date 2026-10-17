import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

/**
 * Écoute globale (montée dans le layout racine) : demandes de coéquipiers, invitations et effectif
 * d'écurie, et tout nouveau message (liste des conversations et pastilles de non-lus).
 * La RLS limite les événements reçus à ce que le pilote a le droit de lire.
 */
export function useSocialRealtime(userId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || isDemoMode) return;
    const refresh = (...keys: string[]) => () => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    const channel = supabase
      .channel(`social:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, refresh('friendships'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_invites' }, refresh('team-invites'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, refresh('team', 'team-tags', 'conversations'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refresh('conversations'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams' }, refresh('team', 'team-tags', 'teams-directory'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_applications' }, refresh('team-applications'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks' }, refresh('blocks', 'friendships'))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
