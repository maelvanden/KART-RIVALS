import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { socialError } from '@/features/social/errors';
import { demoWallet, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

export type Mission = {
  key: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  points: number;
  claimed: boolean;
  bonus: boolean;
  week_start: string;
  week_end: string;
};

// ---------- Mode démo ----------
const monday = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
})();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const sunday = new Date(monday.getTime() + 6 * 86_400_000);
const demoMissions: Mission[] = [
  { key: 'two_tracks', title: 'Roule sur 2 circuits', description: 'Défi, course ou Time Attack validé sur 2 circuits différents.', target: 2, progress: 1, points: 60, claimed: false, bonus: false, week_start: iso(monday), week_end: iso(sunday) },
  { key: 'personal_best', title: 'Bats ton record perso', description: 'Un Time Attack validé plus rapide que ton meilleur temps sur ce circuit.', target: 1, progress: 1, points: 80, claimed: false, bonus: false, week_start: iso(monday), week_end: iso(sunday) },
  { key: 'join_session', title: 'Rejoins une session', description: 'Inscris-toi à une session ouverte organisée par un autre pilote.', target: 1, progress: 0, points: 40, claimed: false, bonus: false, week_start: iso(monday), week_end: iso(sunday) },
  { key: 'post_chrono', title: 'Partage un chrono', description: 'Publie un chrono dans l’actu.', target: 1, progress: 1, points: 25, claimed: true, bonus: true, week_start: iso(monday), week_end: iso(sunday) },
];

function demoClaim(key: string): number {
  const m = demoMissions.find((x) => x.key === key);
  if (!m || m.claimed || m.progress < m.target) throw new Error('Mission pas encore accomplie.');
  m.claimed = true;
  demoWallet.points = demoWallet.points + m.points;
  return m.points;
}

/** Missions de la semaine (3 fixes + 1 bonus), avec progression calculée à partir de l'activité. */
export function useMissions() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['missions', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Mission[]> => {
      if (isDemoMode) return demoMissions.map((m) => ({ ...m }));
      const { data, error } = await supabase.rpc('my_missions');
      if (error) throw error;
      return data as Mission[];
    },
  });
}

/** Récupère les points d'une mission accomplie. */
export function useClaimMission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (key: string): Promise<number> => {
      if (isDemoMode) return demoClaim(key);
      const { data, error } = await supabase.rpc('claim_mission', { p_key: key });
      if (error) throw socialError(error);
      return data as number;
    },
    onSuccess: () => ['missions', 'points', 'profile'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })),
  });
}
