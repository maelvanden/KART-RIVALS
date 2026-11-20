import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { socialError } from '@/features/social/errors';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

/** Alertes de l'équipe (signalement grave, éléments en retard) : un réglage par membre, activé par défaut. */
let demoEnabled = true;

export function useTeamAlerts(enabled: boolean) {
  return useQuery({
    queryKey: ['team-alerts'],
    enabled,
    queryFn: async (): Promise<boolean> => {
      if (isDemoMode) return demoEnabled;
      const { data, error } = await supabase.rpc('my_team_alerts');
      if (error) throw socialError(error);
      return data as boolean;
    },
  });
}

export function useSetTeamAlerts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (isDemoMode) {
        demoEnabled = enabled;
        return;
      }
      const { error } = await supabase.rpc('set_my_team_alerts', { p_enabled: enabled });
      if (error) throw socialError(error);
    },
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: ['team-alerts'] });
      queryClient.setQueryData(['team-alerts'], enabled);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['team-alerts'] }),
  });
}
