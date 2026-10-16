import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import type { Garage, GearItem, GearSlot } from '@/features/garage/catalog';
import { demoBuyGearItem, demoEquipGearItem, demoGarageFor, demoGearCatalog, demoWallet, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

/** Catalogue de la boutique (la base fait foi pour les prix et les conditions). */
export function useGearCatalog() {
  return useQuery({
    queryKey: ['gear-catalog'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<GearItem[]> => {
      if (isDemoMode) return demoGearCatalog;
      const { data, error } = await supabase
        .from('gear_items')
        .select('id, slot, name, rarity, price, unlock_rank, sort')
        .order('sort');
      if (error) throw error;
      return data as GearItem[];
    },
  });
}

/** Collection et équipement porté d'un pilote. */
export function useGarage(profileId: string | undefined) {
  return useQuery({
    queryKey: ['garage', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<Garage> => {
      if (isDemoMode) {
        const g = demoGarageFor(profileId!);
        return { owned: [...g.owned], equipped: { ...g.equipped } };
      }
      const [items, gear] = await Promise.all([
        supabase.from('user_items').select('item_id').eq('profile_id', profileId!),
        supabase.from('user_gear').select('slot, item_id').eq('profile_id', profileId!),
      ]);
      if (items.error) throw items.error;
      if (gear.error) throw gear.error;
      return {
        owned: items.data.map((r) => r.item_id as string),
        equipped: Object.fromEntries(gear.data.map((r) => [r.slot as GearSlot, r.item_id as string])),
      };
    },
  });
}

/** Solde de points du pilote connecté. */
export function useMyPoints() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['points', userId],
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      if (isDemoMode) return demoWallet.points;
      const { data, error } = await supabase.from('profiles').select('points').eq('id', userId!).single();
      if (error) throw error;
      return data.points as number;
    },
  });
}

function useInvalidateGarage() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['garage', userId] }),
      queryClient.invalidateQueries({ queryKey: ['points', userId] }),
    ]);
}

/** Achète un objet (ou récupère une récompense de rang) ; il est équipé aussitôt. */
export function useBuyGearItem() {
  const { userId } = useAuth();
  const onSuccess = useInvalidateGarage();
  return useMutation({
    mutationFn: async (item: GearItem) => {
      if (isDemoMode) return demoBuyGearItem(userId!, item);
      const { error } = await supabase.rpc('buy_gear_item', { p_item_id: item.id });
      if (error) throw error;
    },
    onSuccess,
  });
}

/** Porte un objet de sa collection (l'objet de location remet le slot à zéro). */
export function useEquipGearItem() {
  const { userId } = useAuth();
  const onSuccess = useInvalidateGarage();
  return useMutation({
    mutationFn: async (item: GearItem) => {
      if (isDemoMode) return demoEquipGearItem(userId!, item);
      const { error } = await supabase.rpc('equip_gear_item', { p_item_id: item.id });
      if (error) throw error;
    },
    onSuccess,
  });
}
