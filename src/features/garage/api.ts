import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { EMPTY_GEAR, type GearBrand, type GearCategory, type UserGear } from '@/features/garage/catalog';
import { demoGear, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

const GEAR_COLUMNS = 'helmet, suit, gloves, shoes, rib_protector';

/** Garage virtuel d'un pilote (tout en location tant qu'il n'a rien renseigné). */
export function useUserGear(profileId: string | undefined) {
  return useQuery({
    queryKey: ['gear', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<UserGear> => {
      if (isDemoMode) return { ...EMPTY_GEAR, ...demoGear[profileId!] };
      const { data, error } = await supabase
        .from('user_gear')
        .select(GEAR_COLUMNS)
        .eq('profile_id', profileId!)
        .maybeSingle();
      if (error) throw error;
      return (data as UserGear | null) ?? EMPTY_GEAR;
    },
  });
}

/** Change (ou vide, avec null) un slot du garage du pilote connecté. */
export function useSetGear() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ category, brand }: { category: GearCategory; brand: GearBrand | null }) => {
      if (isDemoMode) {
        demoGear[userId!] = { ...EMPTY_GEAR, ...demoGear[userId!], [category]: brand };
        return;
      }
      const { error } = await supabase
        .from('user_gear')
        .upsert({ profile_id: userId!, [category]: brand }, { onConflict: 'profile_id' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gear', userId] }),
  });
}
