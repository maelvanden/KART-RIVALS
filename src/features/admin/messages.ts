import { useQuery } from '@tanstack/react-query';

import { socialError } from '@/features/social/errors';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { ReportReason } from '@/types/models';

/** Message Radio signalé contre un pilote (RPC admin_reported_messages), sans le reste de la conversation. */
export type ReportedMessage = {
  report_id: string;
  reason: ReportReason;
  details: string | null;
  status: 'open' | 'reviewed' | 'dismissed';
  created_at: string;
  reporter: string | null;
  message_id: string;
  text: string | null;
  kind: string;
  hidden: boolean;
  sent_at: string;
  conversation_kind: 'direct' | 'team' | 'tournament' | 'support';
};

export type ContextRole = 'reported' | 'target' | 'reporter' | 'other';

export type ContextMessage = {
  id: string;
  sender_id: string | null;
  sender: string | null;
  /** reported : le message signalé ; target : autre message du pilote visé ; reporter : de la personne qui signale. */
  role: ContextRole;
  text: string | null;
  kind: string;
  hidden: boolean;
  created_at: string;
};

/** Les 5 messages avant et après le message signalé, dans la même conversation. */
export type ReportContext = {
  conversation: string;
  kind: string;
  messages: ContextMessage[];
};

// ---------- Mode démo ----------

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const demoReported: Record<string, ReportedMessage[]> = {
  p2: [
    {
      report_id: 'rep-1',
      reason: 'harassment',
      details: 'Insultes après la course de samedi.',
      status: 'open',
      created_at: ago(45),
      reporter: 'TurboLéa',
      message_id: 'm-x',
      text: 'T’as gagné en trichant, reviens plus jamais sur la piste.',
      kind: 'text',
      hidden: false,
      sent_at: ago(52),
      conversation_kind: 'direct',
    },
  ],
};

const demoContext: Record<string, ReportContext> = {
  'rep-1': {
    conversation: 'Radio 1 contre 1 · Drift_Max et TurboLéa',
    kind: 'direct',
    messages: [
      { id: 'c1', sender_id: 'p1', sender: 'TurboLéa', role: 'reporter', text: 'Belle course tout à l’heure !', kind: 'text', hidden: false, created_at: ago(70) },
      { id: 'c2', sender_id: 'p2', sender: 'Drift_Max', role: 'target', text: 'Merci, mais j’étais devant avant ton dépassement dans l’épingle.', kind: 'text', hidden: false, created_at: ago(66) },
      { id: 'c3', sender_id: 'p1', sender: 'TurboLéa', role: 'reporter', text: 'Non, c’était propre, tu as freiné trop tard.', kind: 'text', hidden: false, created_at: ago(62) },
      { id: 'c4', sender_id: 'p2', sender: 'Drift_Max', role: 'target', text: 'Tu m’as poussé, c’est clair sur la vidéo.', kind: 'text', hidden: false, created_at: ago(58) },
      { id: 'c5', sender_id: 'p1', sender: 'TurboLéa', role: 'reporter', text: 'On en reparle au prochain défi si tu veux.', kind: 'text', hidden: false, created_at: ago(55) },
      { id: 'm-x', sender_id: 'p2', sender: 'Drift_Max', role: 'reported', text: 'T’as gagné en trichant, reviens plus jamais sur la piste.', kind: 'text', hidden: false, created_at: ago(52) },
      { id: 'c6', sender_id: 'p1', sender: 'TurboLéa', role: 'reporter', text: 'Ok, je te signale, ça suffit.', kind: 'text', hidden: false, created_at: ago(50) },
      { id: 'c7', sender_id: 'p2', sender: 'Drift_Max', role: 'target', text: 'Signale ce que tu veux.', kind: 'text', hidden: false, created_at: ago(49) },
    ],
  },
};

// ---------- Hooks ----------

/** Messages signalés contre un pilote, du plus récent au plus ancien. Ouvert à toute l'équipe. */
export function useReportedMessages(pilotId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-reported-messages', pilotId],
    enabled: !!pilotId && enabled,
    queryFn: async (): Promise<ReportedMessage[]> => {
      if (isDemoMode) return demoReported[pilotId!] ?? [];
      const { data, error } = await supabase.rpc('admin_reported_messages', { p_profile: pilotId });
      if (error) throw socialError(error);
      return data as ReportedMessage[];
    },
  });
}

/**
 * Contexte d'un message signalé. Ne se charge qu'à la demande (`enabled`) : la conversation est privée et chaque
 * consultation est tracée au journal côté serveur.
 */
export function useReportContext(reportId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-report-context', reportId],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ReportContext> => {
      if (isDemoMode) {
        const demo = demoContext[reportId];
        if (!demo) throw new Error('Contexte indisponible.');
        return demo;
      }
      const { data, error } = await supabase.rpc('admin_report_context', { p_report_id: reportId });
      if (error) throw socialError(error);
      return data as ReportContext;
    },
  });
}
