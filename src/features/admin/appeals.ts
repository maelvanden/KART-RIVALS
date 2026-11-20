import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { demoPilots } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { RankTier } from '@/types/models';

export type AppealStatus = 'open' | 'accepted' | 'rejected';
export type AppealFilter = 'open' | 'done';

/** Recours d'un pilote contre sa sanction, vu par un admin appli (RPC admin_appeals). */
export type AdminAppeal = {
  id: string;
  profile_id: string;
  username: string;
  avatar_url: string | null;
  rank: RankTier;
  elo: number;
  kind: 'suspension' | 'ban';
  /** Motif de la sanction, tel qu'affiché au pilote. */
  sanction_reason: string | null;
  suspended_until: string | null;
  banned_at: string | null;
  /** Faux quand la sanction a été levée ou remplacée depuis l'envoi du recours. */
  still_active: boolean;
  message: string;
  status: AppealStatus;
  response: string | null;
  created_at: string;
  handled_at: string | null;
  handled_by: string | null;
  warnings: number;
  reports: number;
};

/** Recours du pilote connecté contre sa sanction en cours (RPC my_appeal). */
export type MyAppeal = {
  id: string;
  status: AppealStatus;
  kind: 'suspension' | 'ban';
  message: string;
  response: string | null;
  created_at: string;
  handled_at: string | null;
};

export const MIN_APPEAL = 10;
export const MAX_APPEAL = 1000;

// ---------- Mode démo ----------

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const later = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

let demoAppeals: AdminAppeal[] = [
  {
    id: 'ap-1',
    profile_id: 'p4',
    username: demoPilots.p4.username,
    avatar_url: null,
    rank: demoPilots.p4.rank,
    elo: demoPilots.p4.elo,
    kind: 'suspension',
    sanction_reason: '3 avertissements sans changement de comportement.',
    suspended_until: later(2),
    banned_at: null,
    still_active: true,
    message: 'Je me suis emporté après la course de samedi et je m’en excuse auprès de Drift_Max. Cela ne se reproduira pas.',
    status: 'open',
    response: null,
    created_at: ago(53),
    handled_at: null,
    handled_by: null,
    warnings: 3,
    reports: 2,
  },
  {
    id: 'ap-2',
    profile_id: 'p2',
    username: demoPilots.p2.username,
    avatar_url: null,
    rank: demoPilots.p2.rank,
    elo: demoPilots.p2.elo,
    kind: 'ban',
    sanction_reason: 'Chrono falsifié sur SpeedPark Angers.',
    suspended_until: null,
    banned_at: ago(24 * 6),
    still_active: true,
    message: 'Mon chrono était réel : j’ai la photo du ticket et la vidéo de la session, je peux les envoyer.',
    status: 'open',
    response: null,
    created_at: ago(5),
    handled_at: null,
    handled_by: null,
    warnings: 1,
    reports: 4,
  },
];

let demoMine: MyAppeal | null = null;

// ---------- Côté admin ----------

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw socialError(error);
  return data as T;
}

export function useAdminAppeals(filter: AppealFilter, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-appeals', filter],
    enabled,
    queryFn: async (): Promise<AdminAppeal[]> => {
      if (isDemoMode) {
        return demoAppeals
          .filter((a) => (filter === 'open') === (a.status === 'open'))
          .sort((a, b) => (filter === 'open' ? a.created_at.localeCompare(b.created_at) : (b.handled_at ?? '').localeCompare(a.handled_at ?? '')))
          .map((a) => ({ ...a }));
      }
      return rpc<AdminAppeal[]>('admin_appeals', { p_status: filter });
    },
  });
}

/** Lève la sanction (« lift ») ou refuse le recours (« reject », réponse obligatoire). */
export function useResolveAppeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision, response }: { id: string; decision: 'lift' | 'reject'; response?: string }) => {
      const text = response?.trim() ?? '';
      if (decision === 'reject' && text.length < 3) throw new Error('Écris la réponse envoyée au pilote (3 caractères minimum).');
      if (isDemoMode) {
        const a = demoAppeals.find((x) => x.id === id);
        if (!a || a.status !== 'open') throw new Error('Ce recours a déjà été traité.');
        a.status = decision === 'lift' ? 'accepted' : 'rejected';
        a.response = text || null;
        a.handled_at = new Date().toISOString();
        a.handled_by = demoProfile.username;
        return;
      }
      await rpc('admin_resolve_appeal', { p_id: id, p_decision: decision, p_response: text || null });
    },
    onSuccess: () =>
      ['admin-appeals', 'admin-actions', 'admin-journal', 'admin-pilots', 'admin-pilot', 'admin-stats'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      ),
  });
}

// ---------- Côté pilote sanctionné ----------

/** Recours contre la sanction en cours. Relu chaque minute tant qu'il est ouvert, pour afficher la réponse. */
export function useMyAppeal(enabled: boolean) {
  return useQuery({
    queryKey: ['my-appeal'],
    enabled,
    refetchInterval: (query) => (query.state.data?.status === 'open' ? 60_000 : false),
    queryFn: async (): Promise<MyAppeal | null> => {
      if (isDemoMode) return demoMine;
      return rpc<MyAppeal | null>('my_appeal');
    },
  });
}

export function useSubmitAppeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (message: string) => {
      const text = message.trim();
      if (text.length < MIN_APPEAL) throw new Error(`Explique-toi en quelques mots (${MIN_APPEAL} caractères minimum).`);
      if (isDemoMode) {
        demoMine = { id: 'mine', status: 'open', kind: 'suspension', message: text, response: null, created_at: new Date().toISOString(), handled_at: null };
        return;
      }
      await rpc('submit_sanction_appeal', { p_message: text });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-appeal'] }),
  });
}
