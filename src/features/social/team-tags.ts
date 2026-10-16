import { useQuery } from '@tanstack/react-query';

import { demoPilots, demoSocial } from '@/features/social/demo';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

/**
 * Tag d'écurie de chaque pilote (id du pilote → « VRA »). Les écuries sont publiques : une seule requête
 * pour toute l'app, mise en cache et rafraîchie quand un effectif change (temps réel).
 */
export function useTeamTags() {
  return useQuery({
    queryKey: ['team-tags'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      if (isDemoMode) {
        const tags: Record<string, string> = { [demoPilots.p2.id]: 'APX', [demoPilots.p4.id]: 'KRT' };
        for (const m of demoSocial.team?.members ?? []) tags[m.pilot.id] = demoSocial.team!.tag;
        return tags;
      }
      const { data, error } = await supabase.from('team_members').select('profile_id, team:teams (tag)');
      if (error) throw error;
      const rows = data as unknown as { profile_id: string; team: { tag: string } | null }[];
      return Object.fromEntries(rows.filter((r) => r.team).map((r) => [r.profile_id, r.team!.tag]));
    },
  });
}

/** Tag d'écurie d'un pilote, ou null s'il n'en a pas. */
export function useTeamTag(pilotId: string | null | undefined): string | null {
  const tags = useTeamTags();
  return pilotId ? (tags.data?.[pilotId] ?? null) : null;
}
