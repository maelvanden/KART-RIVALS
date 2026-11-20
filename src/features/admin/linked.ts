import { useQuery } from '@tanstack/react-query';

import { socialError } from '@/features/social/errors';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { RankTier } from '@/types/models';

/** Autre compte ayant servi sur un appareil du pilote (RPC admin_linked_accounts, réservée aux admins appli). */
export type LinkedAccount = {
  id: string;
  username: string;
  avatar_url: string | null;
  rank: RankTier;
  created_at: string;
  banned_at: string | null;
  suspended_until: string | null;
  is_admin: boolean;
  /** Nombre d'appareils en commun. */
  shared_devices: number;
  first_seen: string;
  last_seen: string;
};

export type LinkedAccounts = {
  /** Appareils enregistrés pour ce pilote. */
  devices: number;
  accounts: LinkedAccount[];
};

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const demoLinked: Record<string, LinkedAccounts> = {
  p4: {
    devices: 1,
    accounts: [
      { id: 'p2', username: 'Drift_Max', avatar_url: null, rank: 'bronze', created_at: ago(90), banned_at: ago(6), suspended_until: null, is_admin: false, shared_devices: 1, first_seen: ago(40), last_seen: ago(7) },
      { id: 'p3', username: 'ApexHunter', avatar_url: null, rank: 'or', created_at: ago(120), banned_at: null, suspended_until: null, is_admin: false, shared_devices: 1, first_seen: ago(30), last_seen: ago(1) },
    ],
  },
};

/** Comptes probablement liés à un pilote : un indice pour une décision, jamais une preuve. Réservé aux admins appli. */
export function useLinkedAccounts(pilotId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-linked-accounts', pilotId],
    enabled: !!pilotId && enabled,
    queryFn: async (): Promise<LinkedAccounts> => {
      if (isDemoMode) return demoLinked[pilotId!] ?? { devices: 1, accounts: [] };
      const { data, error } = await supabase.rpc('admin_linked_accounts', { p_profile: pilotId });
      if (error) throw socialError(error);
      return data as LinkedAccounts;
    },
  });
}
