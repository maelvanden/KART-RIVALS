import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { demoSender, demoSocial } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { PilotSummary, ReportReason } from '@/types/models';

export const REPORT_REASONS: { value: ReportReason; label: string; detail: string }[] = [
  { value: 'harassment', label: 'Harcèlement ou insultes', detail: 'Menaces, propos haineux, acharnement' },
  { value: 'spam', label: 'Spam', detail: 'Publicité, messages répétés, arnaque' },
  { value: 'cheating', label: 'Triche', detail: 'Faux résultats, faux tickets, multi-comptes' },
  { value: 'inappropriate', label: 'Contenu inapproprié', detail: 'Photo, pseudo ou message choquant' },
  { value: 'other', label: 'Autre', detail: 'Précise ce qui se passe' },
];

/** Pilotes que j'ai bloqués (je ne vois que mes propres blocages). */
export function useBlocks() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['blocks', userId],
    enabled: !!userId,
    queryFn: async (): Promise<PilotSummary[]> => {
      if (isDemoMode) return [...demoSocial.blocks];
      const { data, error } = await supabase
        .from('blocks')
        .select('pilot:profiles!blocks_blocked_id_fkey (id, username, avatar_url, elo, rank)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as { pilot: PilotSummary | null }[]).flatMap((r) => (r.pilot ? [r.pilot] : []));
    },
  });
}

/** Ids des pilotes bloqués, pour filtrer recherches et messages. */
export function useBlockedIds(): Set<string> {
  const blocks = useBlocks();
  return new Set((blocks.data ?? []).map((p) => p.id));
}

export function useIsBlocked(pilotId: string | null | undefined) {
  return useBlockedIds().has(pilotId ?? '');
}

function useInvalidateSafety() {
  const queryClient = useQueryClient();
  return () =>
    ['blocks', 'friendships', 'conversations', 'team-invites', 'search-pilots', 'nearby'].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    );
}

/** Bloque un pilote : la relation de coéquipier tombe et plus aucun contact direct n'est possible. */
export function useBlockPilot() {
  const invalidate = useInvalidateSafety();
  return useMutation({
    mutationFn: async (pilot: Pick<PilotSummary, 'id'> & Partial<PilotSummary>) => {
      if (isDemoMode) {
        const full = demoSender(pilot.id) ?? { avatar_url: null, elo: 1000, rank: 'novice', username: 'Pilote', ...pilot };
        if (!demoSocial.blocks.some((p) => p.id === pilot.id)) demoSocial.blocks.unshift(full as PilotSummary);
        demoSocial.friendships = demoSocial.friendships.filter((f) => f.pilot.id !== pilot.id);
        return;
      }
      const { error } = await supabase.rpc('block_pilot', { p_pilot_id: pilot.id });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useUnblockPilot() {
  const invalidate = useInvalidateSafety();
  return useMutation({
    mutationFn: async (pilotId: string) => {
      if (isDemoMode) {
        demoSocial.blocks = demoSocial.blocks.filter((p) => p.id !== pilotId);
        return;
      }
      const { error } = await supabase.rpc('unblock_pilot', { p_pilot_id: pilotId });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export type ReportInput = { pilotId: string; reason: ReportReason; details?: string; messageId?: string };

/** Signale un pilote ou l'un de ses messages ; l'équipe le traite depuis le tableau de bord. */
export function useReport() {
  return useMutation({
    mutationFn: async ({ pilotId, reason, details, messageId }: ReportInput) => {
      if (isDemoMode) return;
      const { error } = await supabase.rpc('report', {
        p_pilot_id: pilotId,
        p_reason: reason,
        p_details: details?.trim() || null,
        p_message_id: messageId ?? null,
      });
      if (error) throw socialError(error);
    },
  });
}
