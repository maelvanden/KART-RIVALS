import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { actionLabel, demoActionLog, type AdminAction } from '@/features/admin/panel';
import { socialError } from '@/features/social/errors';
import { toCsv } from '@/lib/csv';
import { demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

export type StaffRole = 'admin' | 'moderator';

export type JournalEntry = AdminAction & {
  admin_id: string | null;
  /** Rôle actuel de l'auteur (il a pu changer depuis l'action). */
  admin_role: StaffRole | null;
  pilot_id: string | null;
  track_id: string | null;
};

export type JournalActor = { id: string; username: string; role: StaffRole | null; actions: number; last_action: string };

export type JournalPeriod = 'all' | '24h' | '7d' | '30d';

export type JournalFilters = {
  category: string | null;
  adminId: string | null;
  pilot: string;
  track: string;
  period: JournalPeriod;
};

export const EMPTY_FILTERS: JournalFilters = { category: null, adminId: null, pilot: '', track: '', period: 'all' };

export const PERIODS: { value: JournalPeriod; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: '24h', label: '24 h' },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
];

/** Types d'actions regroupés par thème, pour le filtre du journal. */
export const JOURNAL_CATEGORIES: { value: string; label: string; actions: string[] }[] = [
  { value: 'sanctions', label: 'Sanctions', actions: ['warn', 'suspend', 'unsuspend', 'ban', 'unban', 'appeal_accepted', 'appeal_rejected'] },
  { value: 'content', label: 'Contenu', actions: ['hide_content', 'show_content', 'resolve_report', 'view_message_context'] },
  {
    value: 'results',
    label: 'Résultats',
    actions: [
      'resolve_match',
      'resolve_race',
      'cancel_match',
      'cancel_race',
      'approve_time_attack',
      'reject_time_attack',
      'review_validate_time_attack',
      'review_dnf_time_attack',
      'review_cancel_time_attack',
    ],
  },
  { value: 'pilots', label: 'Pilotes', actions: ['revoke_verified', 'restore_verified', 'set_elo', 'adjust_points', 'grant_item', 'revoke_item', 'reset_username', 'reset_avatar'],
  },
  { value: 'tracks', label: 'Circuits', actions: ['create_track', 'hide_track', 'show_track', 'merge_track', 'track_correction'] },
  {
    value: 'tournaments',
    label: 'Tournois',
    actions: ['cancel_tournament', 'remove_tournament_pilot', 'tournament_walkover', 'tournament_official', 'tournament_unofficial'],
  },
  { value: 'teams', label: 'Écuries', actions: ['rename_team', 'team_remove_logo', 'team_clear_message', 'transfer_team', 'dissolve_team'] },
  { value: 'settings', label: 'Réglages', actions: ['app_settings', 'set_gear_price', 'announcement', 'add_moderator', 'remove_moderator'] },
];

const SINCE_MS: Record<Exclude<JournalPeriod, 'all'>, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 };

export const hasFilters = (f: JournalFilters) =>
  f.category !== null || f.adminId !== null || f.pilot.trim() !== '' || f.track.trim() !== '' || f.period !== 'all';

const PAGE = 50;
type Cursor = { created_at: string; id: number };

// ---------- Mode démo : l'auteur « Modo_Lea » est modératrice, les autres sont admins ----------

const demoRole = (name: string | null): StaffRole | null => (!name ? null : name === 'Modo_Lea' ? 'moderator' : 'admin');
const toEntry = (a: AdminAction): JournalEntry => ({ ...a, admin_id: a.admin, admin_role: demoRole(a.admin), pilot_id: a.pilot, track_id: a.track });

function demoPage(f: JournalFilters, cursor: Cursor | null, limit: number): JournalEntry[] {
  const actions = f.category ? (JOURNAL_CATEGORIES.find((c) => c.value === f.category)?.actions ?? []) : null;
  const since = f.period === 'all' ? null : Date.now() - SINCE_MS[f.period];
  const pilot = f.pilot.trim().toLowerCase();
  const track = f.track.trim().toLowerCase();
  return demoActionLog()
    .map(toEntry)
    .filter(
      (a) =>
        (!f.adminId || a.admin_id === f.adminId) &&
        (!actions || actions.includes(a.action)) &&
        (!pilot || (a.pilot ?? '').toLowerCase().includes(pilot)) &&
        (!track || (a.track ?? '').toLowerCase().includes(track)) &&
        (!since || Date.parse(a.created_at) >= since),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
    .filter((a) => !cursor || a.created_at < cursor.created_at || (a.created_at === cursor.created_at && a.id < cursor.id))
    .slice(0, limit);
}

async function fetchPage(f: JournalFilters, cursor: Cursor | null, limit: number): Promise<JournalEntry[]> {
  if (isDemoMode) return demoPage(f, cursor, limit);
  const actions = f.category ? (JOURNAL_CATEGORIES.find((c) => c.value === f.category)?.actions ?? null) : null;
  const { data, error } = await supabase.rpc('admin_journal', {
    p_admin: f.adminId,
    p_actions: actions,
    p_pilot: f.pilot.trim() || null,
    p_track: f.track.trim() || null,
    p_since: f.period === 'all' ? null : new Date(Date.now() - SINCE_MS[f.period]).toISOString(),
    p_before: cursor?.created_at ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: limit,
  });
  if (error) throw socialError(error);
  return data as JournalEntry[];
}

/** Journal page par page (50 lignes), le plus récent d'abord, selon les filtres. */
export function useAdminJournal(filters: JournalFilters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['admin-journal', filters],
    enabled,
    initialPageParam: null as Cursor | null,
    getNextPageParam: (last: JournalEntry[]) =>
      last.length === PAGE ? { created_at: last[last.length - 1].created_at, id: last[last.length - 1].id } : undefined,
    queryFn: ({ pageParam }) => fetchPage(filters, pageParam, PAGE),
  });
}

/** Membres de l'équipe qui ont agi, pour le filtre par auteur. */
export function useJournalActors(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-journal-actors'],
    enabled,
    queryFn: async (): Promise<JournalActor[]> => {
      if (isDemoMode) {
        const byName = new Map<string, JournalActor>();
        for (const a of demoActionLog()) {
          if (!a.admin) continue;
          const cur = byName.get(a.admin);
          byName.set(a.admin, {
            id: a.admin,
            username: a.admin,
            role: demoRole(a.admin),
            actions: (cur?.actions ?? 0) + 1,
            last_action: !cur || a.created_at > cur.last_action ? a.created_at : cur.last_action,
          });
        }
        return [...byName.values()].sort((a, b) => b.last_action.localeCompare(a.last_action));
      }
      const { data, error } = await supabase.rpc('admin_journal_actors');
      if (error) throw socialError(error);
      return data as JournalActor[];
    },
  });
}

const ROLE_LABEL: Record<StaffRole, string> = { admin: 'Admin appli', moderator: 'Modérateur' };
export const roleLabel = (role: StaffRole | null | undefined) => (role ? ROLE_LABEL[role] : 'Ancien membre');

/** Plafond d'un export : au-delà, affiner les filtres. */
export const EXPORT_LIMIT = 1000;

/**
 * Exporte les lignes qui correspondent aux filtres (jusqu'à EXPORT_LIMIT) en CSV : date, auteur, rôle, action, pilote,
 * circuit, motif et détails. Renvoie aussi le nombre de lignes pour prévenir quand l'export est tronqué.
 */
export async function buildJournalCsv(filters: JournalFilters): Promise<{ csv: string; rows: number }> {
  const entries: JournalEntry[] = [];
  let cursor: Cursor | null = null;
  while (entries.length < EXPORT_LIMIT) {
    const page = await fetchPage(filters, cursor, 200);
    entries.push(...page);
    if (page.length < 200) break;
    cursor = { created_at: page[page.length - 1].created_at, id: page[page.length - 1].id };
  }
  const rows = entries.slice(0, EXPORT_LIMIT);
  const csv = toCsv([
    ['Date', 'Auteur', 'Rôle', 'Action', 'Pilote', 'Circuit', 'Motif', 'Détails'],
    ...rows.map((a) => [
      new Date(a.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
      a.admin ?? (isDemoMode ? demoProfile.username : 'compte supprimé'),
      roleLabel(a.admin_role),
      actionLabel(a),
      a.pilot ?? '',
      a.track ?? '',
      typeof a.details?.reason === 'string' ? a.details.reason : '',
      a.details ? JSON.stringify(a.details) : '',
    ]),
  ]);
  return { csv, rows: rows.length };
}
