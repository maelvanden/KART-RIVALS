import { useQuery } from '@tanstack/react-query';

import { demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

export type Verification = { sessions: number; since: string };

/**
 * Pilotes vérifiés : au moins une session Time Attack validée par un ticket de chronométrage.
 * Une seule requête pour toute l'app (comme les tags d'écurie), mise en cache.
 */
export function useVerifiedPilots() {
  return useQuery({
    queryKey: ['verified-pilots'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, Verification>> => {
      if (isDemoMode) {
        const since = new Date(Date.now() - 20 * 86_400_000).toISOString();
        return { [demoProfile.id]: { sessions: 4, since }, p3: { sessions: 7, since }, p1: { sessions: 1, since } };
      }
      const { data, error } = await supabase.rpc('verified_pilots');
      if (error) throw error;
      const rows = data as { profile_id: string; validated_sessions: number; verified_since: string }[];
      return Object.fromEntries(rows.map((r) => [r.profile_id, { sessions: r.validated_sessions, since: r.verified_since }]));
    },
  });
}

export function useVerification(pilotId: string | null | undefined): Verification | null {
  const verified = useVerifiedPilots();
  return pilotId ? (verified.data?.[pilotId] ?? null) : null;
}
