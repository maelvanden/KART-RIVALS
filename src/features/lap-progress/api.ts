import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { demoLapProgress, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { LapProgressPoint } from '@/types/models';

/**
 * Tous les chronos validés du pilote connecté, du plus ancien au plus récent (défis, courses, Time Attack).
 * Clé sous « elo-history » : rafraîchie à chaque résultat validé, comme l'ELO et les records.
 */
export function useMyLapProgress() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['elo-history', 'lap-progress', userId],
    enabled: !!userId,
    queryFn: async (): Promise<LapProgressPoint[]> => {
      if (isDemoMode) return demoLapProgress();
      const { data, error } = await supabase.rpc('my_lap_progress');
      if (error) throw error;
      return data;
    },
  });
}
