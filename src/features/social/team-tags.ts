import { useQuery } from '@tanstack/react-query';

import { demoPilots, demoSocial } from '@/features/social/demo';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

export type PilotTeamTag = { tag: string; color: string };

/**
 * Tag et couleur d'écurie de chaque pilote (id du pilote → { tag, color }). Les écuries sont publiques :
 * une seule requête pour toute l'app, mise en cache et rafraîchie quand un effectif ou une écurie change.
 */
export function useTeamTags() {
  return useQuery({
    queryKey: ['team-tags'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, PilotTeamTag>> => {
      if (isDemoMode) {
        const tags: Record<string, PilotTeamTag> = {
          [demoPilots.p2.id]: { tag: 'APX', color: '#FF3B5C' },
          [demoPilots.p4.id]: { tag: 'KRT', color: '#22D3EE' },
        };
        const t = demoSocial.team;
        for (const m of t?.members ?? []) tags[m.pilot.id] = { tag: t!.tag, color: t!.color };
        return tags;
      }
      const { data, error } = await supabase.from('team_members').select('profile_id, team:teams (tag, color)');
      if (error) throw error;
      const rows = data as unknown as { profile_id: string; team: PilotTeamTag | null }[];
      return Object.fromEntries(rows.filter((r) => r.team).map((r) => [r.profile_id, r.team!]));
    },
  });
}

/** Tag et couleur d'écurie d'un pilote, ou null s'il n'en a pas. */
export function useTeamTag(pilotId: string | null | undefined): PilotTeamTag | null {
  const tags = useTeamTags();
  return pilotId ? (tags.data?.[pilotId] ?? null) : null;
}
