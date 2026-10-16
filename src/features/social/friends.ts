import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { demoPilots, demoSocial } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { demoPilot, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { Friendship, PilotSummary } from '@/types/models';

const PILOT = 'id, username, avatar_url, elo, rank';

type Row = {
  id: string;
  status: Friendship['status'];
  created_at: string;
  requester_id: string;
  requester: PilotSummary;
  addressee: PilotSummary;
};

/**
 * Mes relations : coéquipiers, demandes reçues et envoyées.
 * Une demande que l'autre a refusée reste affichée « en attente » côté demandeur.
 */
export function useFriendships() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['friendships', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Friendship[]> => {
      if (isDemoMode) return demoSocial.friendships.map((f) => ({ ...f }));
      const { data, error } = await supabase
        .from('friendships')
        .select(
          `id, status, created_at, requester_id,
           requester:profiles!friendships_requester_id_fkey (${PILOT}),
           addressee:profiles!friendships_addressee_id_fkey (${PILOT})`,
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Row[])
        .map((r): Friendship => {
          const outgoing = r.requester_id === userId;
          return {
            id: r.id,
            status: outgoing && r.status === 'declined' ? 'pending' : r.status,
            outgoing,
            created_at: r.created_at,
            pilot: outgoing ? r.addressee : r.requester,
          };
        })
        .filter((f) => f.status !== 'declined');
    },
  });
}

/** Coéquipiers confirmés, du meilleur ELO au moins bon. */
export function useTeammates() {
  const friendships = useFriendships();
  const teammates = (friendships.data ?? [])
    .filter((f) => f.status === 'accepted')
    .sort((a, b) => b.pilot.elo - a.pilot.elo);
  return { ...friendships, teammates };
}

/** Relation avec un pilote donné (fiche pilote). */
export function useFriendshipWith(pilotId: string | undefined) {
  const friendships = useFriendships();
  return friendships.data?.find((f) => f.pilot.id === pilotId) ?? null;
}

function useInvalidateFriendships() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['friendships'] });
}

export function useSendFriendRequest() {
  const invalidate = useInvalidateFriendships();
  return useMutation({
    mutationFn: async (pilotId: string) => {
      if (isDemoMode) return demoSend(pilotId);
      const { error } = await supabase.rpc('send_friend_request', { p_pilot_id: pilotId });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useRespondFriendRequest() {
  const invalidate = useInvalidateFriendships();
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      if (isDemoMode) {
        const f = demoSocial.friendships.find((x) => x.id === id);
        if (f) f.status = accept ? 'accepted' : 'declined';
        demoSocial.friendships = demoSocial.friendships.filter((x) => x.status !== 'declined');
        return;
      }
      const { error } = await supabase.rpc('respond_friend_request', { p_friendship_id: id, p_accept: accept });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

/** Retire un coéquipier ou annule une demande envoyée. */
export function useRemoveFriend() {
  const invalidate = useInvalidateFriendships();
  return useMutation({
    mutationFn: async (pilotId: string) => {
      if (isDemoMode) {
        demoSocial.friendships = demoSocial.friendships.filter((f) => f.pilot.id !== pilotId);
        return;
      }
      const { error } = await supabase.rpc('remove_friend', { p_pilot_id: pilotId });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

function demoSend(pilotId: string) {
  const existing = demoSocial.friendships.find((f) => f.pilot.id === pilotId);
  if (existing?.status === 'accepted') throw new Error('Vous êtes déjà coéquipiers.');
  if (existing?.outgoing) throw new Error('Demande déjà envoyée.');
  if (existing) {
    existing.status = 'accepted';
    return;
  }
  const p = demoPilots[pilotId] ?? demoPilot(pilotId);
  if (!p) throw new Error('Pilote introuvable.');
  demoSocial.friendships.unshift({
    id: `f-${Date.now()}`,
    status: 'pending',
    outgoing: true,
    created_at: new Date().toISOString(),
    pilot: { id: p.id, username: p.username, avatar_url: p.avatar_url, elo: p.elo, rank: p.rank },
  });
}
