import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { demoPilots } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { demoProfile, demoTrackDetails, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { RankTier, ReportReason } from '@/types/models';

// ---------- Types ----------

export type AdminStats = {
  pilots_total: number;
  pilots_new_7d: number;
  pilots_new_30d: number;
  active_7d: number;
  matches_7d: number;
  races_7d: number;
  time_attacks_7d: number;
  posts_7d: number;
  sessions_7d: number;
  reviews_7d: number;
  reports_open: number;
  requests_pending: number;
  restricted: number;
  tracks_total: number;
  tracks_official: number;
  tracks_hidden: number;
  tracks_approx: number;
  signups: { week: string; count: number }[];
  top_tracks: { id: string; name: string; city: string; count: number }[];
};

export type PilotFilter = 'all' | 'reported' | 'restricted' | 'recent';
export type AdminPilotRow = {
  id: string;
  username: string;
  avatar_url: string | null;
  elo: number;
  rank: RankTier;
  created_at: string;
  suspended_until: string | null;
  banned_at: string | null;
  open_reports: number;
  total_reports: number;
  is_admin: boolean;
};

export type AdminPilotDetail = {
  id: string;
  username: string;
  avatar_url: string | null;
  elo: number;
  rank: RankTier;
  created_at: string;
  kart_number: number | null;
  home_track: string | null;
  suspended_until: string | null;
  banned_at: string | null;
  moderation_reason: string | null;
  is_admin: boolean;
  verified_revoked: boolean;
  validated_sessions: number;
  matches: number;
  wins: number;
  races: number;
  posts: number;
  messages: number;
  last_activity: string | null;
  reports: { id: string; reason: ReportReason; details: string | null; status: string; created_at: string; reporter: string | null }[];
  actions: { action: string; details: Record<string, unknown> | null; created_at: string; admin: string | null }[];
};

export type ModerationAction = 'suspend' | 'unsuspend' | 'ban' | 'unban' | 'revoke_verified' | 'restore_verified';

export type AdminTrackRow = {
  id: string;
  name: string;
  city: string;
  postal_code: string | null;
  region: string | null;
  is_indoor: boolean;
  is_official: boolean;
  hidden: boolean;
  location_approx: boolean;
  has_contact: boolean;
  has_length: boolean;
  has_description: boolean;
  has_cover: boolean;
  created_at: string;
};

export type NewTrackInput = {
  name: string;
  city: string;
  postal_code?: string;
  address?: string;
  region?: string;
  is_indoor: boolean;
  length_m?: string;
  kart_power?: string;
  website?: string;
  phone?: string;
  description?: string;
  lat: number;
  lng: number;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  created_at: string;
  ends_at: string;
  archived_at: string | null;
};

export type AdminAction = {
  id: number;
  action: string;
  created_at: string;
  admin: string | null;
  pilot: string | null;
  track: string | null;
  details: Record<string, unknown> | null;
};

export type AccountStatus = { suspended_until: string | null; banned_at: string | null; reason: string | null };

// ---------- Mode démo ----------

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const later = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const demo = {
  pilots: [
    { ...demoPilots.p1, created_at: ago(60 * 24 * 40), suspended_until: null, banned_at: null, open_reports: 0, total_reports: 0, is_admin: false },
    { ...demoPilots.p2, created_at: ago(60 * 24 * 12), suspended_until: null, banned_at: null, open_reports: 1, total_reports: 2, is_admin: false },
    { ...demoPilots.p3, created_at: ago(60 * 24 * 3), suspended_until: null, banned_at: null, open_reports: 0, total_reports: 0, is_admin: false },
    { ...demoPilots.p4, created_at: ago(60 * 20), suspended_until: null, banned_at: null, open_reports: 1, total_reports: 1, is_admin: false },
    {
      id: demoProfile.id,
      username: demoProfile.username,
      avatar_url: demoProfile.avatar_url,
      elo: demoProfile.elo,
      rank: demoProfile.rank,
      created_at: ago(60 * 24 * 90),
      suspended_until: null,
      banned_at: null,
      open_reports: 0,
      total_reports: 0,
      is_admin: true,
    },
  ] as AdminPilotRow[],
  reasons: {} as Record<string, string | null>,
  revoked: {} as Record<string, boolean>,
  hidden: {} as Record<string, boolean>,
  created: [] as AdminTrackRow[],
  announcements: [
    {
      id: 'ann-1',
      title: 'Nouveau : la carte regroupe les circuits',
      body: 'Plus de 350 circuits en France ! Zoome sur la carte pour voir les bulles se séparer, ou cherche ton département.',
      link_url: null,
      created_at: ago(60 * 5),
      ends_at: later(6),
      archived_at: null,
    },
  ] as Announcement[],
  actions: [
    { id: 2, action: 'announcement', created_at: ago(60 * 5), admin: demoProfile.username, pilot: null, track: null, details: { title: 'Nouveau : la carte regroupe les circuits' } },
    { id: 1, action: 'create_track', created_at: ago(60 * 26), admin: demoProfile.username, pilot: null, track: 'Kart Origins', details: null },
  ] as AdminAction[],
};
const logDemo = (action: string, pilot: string | null, track: string | null, details: Record<string, unknown> | null = null) =>
  demo.actions.unshift({ id: Date.now(), action, created_at: new Date().toISOString(), admin: demoProfile.username, pilot, track, details });

const demoTrackRows = (): AdminTrackRow[] => [
  ...demoTrackDetails.map((t) => ({
    id: t.id,
    name: t.name,
    city: t.city,
    postal_code: t.postal_code,
    region: t.region,
    is_indoor: t.is_indoor,
    is_official: !!t.is_official,
    hidden: !!demo.hidden[t.id],
    location_approx: ['Kids Racing Land', 'SpeedPark Rennes', 'Défis Parc', 'Weekart', 'Karrousel'].includes(t.name),
    has_contact: !!(t.website || t.phone),
    has_length: t.length_m != null,
    has_description: !!t.description,
    has_cover: !!t.cover_url,
    created_at: ago(60 * 24 * 30),
  })),
  ...demo.created,
];

// ---------- Hooks ----------

function useInvalidate(...keys: string[]) {
  const queryClient = useQueryClient();
  return () => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw socialError(error);
  return data as T;
}

export function useAdminStats(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-stats'],
    enabled,
    queryFn: async (): Promise<AdminStats> => {
      if (isDemoMode) {
        const week = (n: number) => new Date(Date.now() - n * 7 * 86_400_000).toISOString();
        return {
          pilots_total: 1284,
          pilots_new_7d: 96,
          pilots_new_30d: 341,
          active_7d: 512,
          matches_7d: 143,
          races_7d: 37,
          time_attacks_7d: 58,
          posts_7d: 221,
          sessions_7d: 44,
          reviews_7d: 31,
          reports_open: demo.pilots.reduce((a, p) => a + p.open_reports, 0),
          requests_pending: 1,
          restricted: demo.pilots.filter((p) => p.banned_at || p.suspended_until).length,
          tracks_total: demoTrackRows().filter((t) => !t.hidden).length,
          tracks_official: demoTrackDetails.filter((t) => t.is_official).length,
          tracks_hidden: demoTrackRows().filter((t) => t.hidden).length,
          tracks_approx: demoTrackRows().filter((t) => t.location_approx).length,
          signups: [41, 58, 63, 52, 77, 89, 104, 96].map((count, i) => ({ week: week(7 - i), count })),
          top_tracks: [
            { id: 't2', name: 'SpeedPark Angers', city: 'Beaucouzé', count: 87 },
            { id: 't3', name: 'Inwall Kart', city: 'Les Ponts-de-Cé', count: 64 },
            { id: 't1', name: 'MK Racing', city: 'Angers', count: 41 },
          ],
        };
      }
      return rpc<AdminStats>('admin_stats');
    },
  });
}

export function useAdminRecentActions(enabled: boolean, limit = 30) {
  return useQuery({
    queryKey: ['admin-actions', limit],
    enabled,
    queryFn: async (): Promise<AdminAction[]> => {
      if (isDemoMode) return demo.actions.slice(0, limit);
      return rpc<AdminAction[]>('admin_recent_actions', { p_limit: limit });
    },
  });
}

// Pilotes

export function useAdminPilots(query: string, filter: PilotFilter) {
  return useQuery({
    queryKey: ['admin-pilots', query.trim(), filter],
    queryFn: async (): Promise<AdminPilotRow[]> => {
      if (isDemoMode) {
        const q = query.trim().toLowerCase();
        return demo.pilots
          .filter((p) => !q || p.username.toLowerCase().includes(q))
          .filter((p) =>
            filter === 'reported'
              ? p.open_reports > 0
              : filter === 'restricted'
                ? !!(p.banned_at || p.suspended_until)
                : filter === 'recent'
                  ? Date.now() - Date.parse(p.created_at) < 7 * 86_400_000
                  : true,
          )
          .map((p) => ({ ...p }));
      }
      return rpc<AdminPilotRow[]>('admin_search_pilots', { p_query: query.trim() || null, p_filter: filter });
    },
  });
}

export function useAdminPilot(id: string | undefined) {
  return useQuery({
    queryKey: ['admin-pilot', id],
    enabled: !!id,
    queryFn: async (): Promise<AdminPilotDetail> => {
      if (isDemoMode) {
        const p = demo.pilots.find((x) => x.id === id);
        if (!p) throw new Error('Pilote introuvable.');
        return {
          ...p,
          kart_number: 27,
          home_track: 'SpeedPark Angers',
          moderation_reason: demo.reasons[p.id] ?? null,
          verified_revoked: !!demo.revoked[p.id],
          validated_sessions: p.id === 'p3' ? 4 : 1,
          matches: 23,
          wins: 12,
          races: 6,
          posts: 18,
          messages: 140,
          last_activity: ago(90),
          reports:
            p.total_reports > 0
              ? [{ id: 'r1', reason: 'harassment', details: 'Insultes après la course de samedi.', status: 'open', created_at: ago(45), reporter: 'TurboLéa' }]
              : [],
          actions: demo.actions
            .filter((a) => a.pilot === p.username)
            .map((a) => ({ action: a.action, details: a.details, created_at: a.created_at, admin: a.admin })),
        };
      }
      return rpc<AdminPilotDetail>('admin_pilot_detail', { p_profile: id });
    },
  });
}

export function useModeratePilot() {
  const invalidate = useInvalidate('admin-pilots', 'admin-pilot', 'admin-stats', 'admin-actions', 'verified-pilots');
  return useMutation({
    mutationFn: async ({ pilotId, action, days, reason }: { pilotId: string; action: ModerationAction; days?: number; reason?: string }) => {
      if (isDemoMode) {
        const p = demo.pilots.find((x) => x.id === pilotId);
        if (!p) return;
        if ((action === 'suspend' || action === 'ban') && p.is_admin) throw new Error('Retire d’abord son rôle d’admin appli.');
        if (action === 'suspend') p.suspended_until = later(days ?? 1);
        if (action === 'unsuspend') p.suspended_until = null;
        if (action === 'ban') p.banned_at = new Date().toISOString();
        if (action === 'unban') {
          p.banned_at = null;
          p.suspended_until = null;
        }
        if (action === 'revoke_verified') demo.revoked[p.id] = true;
        if (action === 'restore_verified') demo.revoked[p.id] = false;
        if (action === 'suspend' || action === 'ban') demo.reasons[p.id] = reason?.trim() || null;
        logDemo(action, p.username, null, { days, reason });
        return;
      }
      await rpc('admin_moderate_pilot', { p_profile: pilotId, p_action: action, p_days: days ?? null, p_reason: reason?.trim() || null });
    },
    onSuccess: invalidate,
  });
}

export function useSetElo() {
  const invalidate = useInvalidate('admin-pilots', 'admin-pilot', 'admin-actions', 'profile', 'leaderboard');
  return useMutation({
    mutationFn: async ({ pilotId, elo, reason }: { pilotId: string; elo: number; reason?: string }) => {
      if (!Number.isInteger(elo) || elo < 0 || elo > 4000) throw new Error('ELO invalide (entre 0 et 4000).');
      if (isDemoMode) {
        const p = demo.pilots.find((x) => x.id === pilotId);
        if (p) {
          logDemo('set_elo', p.username, null, { before: p.elo, after: elo, reason });
          p.elo = elo;
        }
        return;
      }
      await rpc('admin_set_elo', { p_profile: pilotId, p_elo: elo, p_reason: reason?.trim() || null });
    },
    onSuccess: invalidate,
  });
}

// Circuits

export function useAdminTracks(enabled = true) {
  return useQuery({
    queryKey: ['admin-tracks'],
    enabled,
    queryFn: async (): Promise<AdminTrackRow[]> => {
      if (isDemoMode) return demoTrackRows();
      return rpc<AdminTrackRow[]>('admin_tracks');
    },
  });
}

export function useCreateTrack() {
  const invalidate = useInvalidate('admin-tracks', 'tracks-map', 'admin-stats', 'admin-actions');
  return useMutation({
    mutationFn: async (input: NewTrackInput): Promise<string> => {
      if (!input.name.trim() || !input.city.trim()) throw new Error('Le nom et la ville sont obligatoires.');
      if (isDemoMode) {
        const id = `new-${Date.now()}`;
        demo.created.push({
          id,
          name: input.name.trim(),
          city: input.city.trim(),
          postal_code: input.postal_code ?? null,
          region: input.region ?? null,
          is_indoor: input.is_indoor,
          is_official: false,
          hidden: false,
          location_approx: false,
          has_contact: !!(input.website || input.phone),
          has_length: !!input.length_m,
          has_description: !!input.description,
          has_cover: false,
          created_at: new Date().toISOString(),
        });
        logDemo('create_track', null, input.name.trim());
        return id;
      }
      return rpc<string>('admin_create_track', { p_data: input });
    },
    onSuccess: invalidate,
  });
}

export function useSetTrackHidden() {
  const invalidate = useInvalidate('admin-tracks', 'tracks-map', 'tracks', 'admin-stats', 'admin-actions');
  return useMutation({
    mutationFn: async ({ trackId, hidden }: { trackId: string; hidden: boolean }) => {
      if (isDemoMode) {
        demo.hidden[trackId] = hidden;
        logDemo(hidden ? 'hide_track' : 'show_track', null, demoTrackRows().find((t) => t.id === trackId)?.name ?? null);
        return;
      }
      await rpc('admin_set_track_hidden', { p_track_id: trackId, p_hidden: hidden });
    },
    onSuccess: invalidate,
  });
}

export function useMergeTracks() {
  const invalidate = useInvalidate('admin-tracks', 'tracks-map', 'tracks', 'admin-stats', 'admin-actions');
  return useMutation({
    mutationFn: async ({ fromId, intoId }: { fromId: string; intoId: string }) => {
      if (fromId === intoId) throw new Error('Choisis deux circuits différents.');
      if (isDemoMode) {
        demo.hidden[fromId] = true;
        logDemo('merge_track', null, demoTrackRows().find((t) => t.id === intoId)?.name ?? null);
        return;
      }
      await rpc('admin_merge_tracks', { p_from: fromId, p_into: intoId });
    },
    onSuccess: invalidate,
  });
}

// Annonces

export function useAdminAnnouncements(enabled: boolean) {
  return useQuery({
    queryKey: ['announcements', 'admin'],
    enabled,
    queryFn: async (): Promise<Announcement[]> => {
      if (isDemoMode) return demo.announcements.map((a) => ({ ...a }));
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, body, link_url, created_at, ends_at, archived_at')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw socialError(error);
      return data as Announcement[];
    },
  });
}

/** Annonce en cours la plus récente, affichée à tous les pilotes. */
export function useLiveAnnouncement() {
  return useQuery({
    queryKey: ['announcements', 'live'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Announcement | null> => {
      if (isDemoMode) {
        return demo.announcements.find((a) => !a.archived_at && Date.parse(a.ends_at) > Date.now()) ?? null;
      }
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, body, link_url, created_at, ends_at, archived_at')
        .is('archived_at', null)
        .gt('ends_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Announcement | null;
    },
  });
}

export function usePublishAnnouncement() {
  const invalidate = useInvalidate('announcements', 'admin-actions');
  return useMutation({
    mutationFn: async ({ title, body, link, days }: { title: string; body: string; link?: string; days: number }) => {
      if (title.trim().length < 3) throw new Error('Le titre doit faire entre 3 et 80 caractères.');
      if (!body.trim()) throw new Error('Écris le message de l’annonce.');
      if (link?.trim() && !/^https:\/\//.test(link.trim())) throw new Error('Le lien doit commencer par https://');
      if (isDemoMode) {
        demo.announcements.unshift({
          id: `ann-${Date.now()}`,
          title: title.trim(),
          body: body.trim(),
          link_url: link?.trim() || null,
          created_at: new Date().toISOString(),
          ends_at: later(days),
          archived_at: null,
        });
        logDemo('announcement', null, null, { title: title.trim() });
        return;
      }
      await rpc('admin_publish_announcement', { p_title: title, p_body: body, p_link: link?.trim() || null, p_days: days });
    },
    onSuccess: invalidate,
  });
}

export function useArchiveAnnouncement() {
  const invalidate = useInvalidate('announcements');
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) {
        const a = demo.announcements.find((x) => x.id === id);
        if (a) a.archived_at = new Date().toISOString();
        return;
      }
      await rpc('admin_archive_announcement', { p_id: id });
    },
    onSuccess: invalidate,
  });
}

// Compte du pilote connecté

export function useAccountStatus(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['account-status', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AccountStatus | null> => {
      if (isDemoMode) return null;
      const { data, error } = await supabase.rpc('my_account_status');
      if (error) throw error;
      return data as AccountStatus | null;
    },
  });
}

/** Libellé lisible d'une action du journal. */
export function actionLabel(a: Pick<AdminAction, 'action' | 'details'>): string {
  const d = a.details ?? {};
  switch (a.action) {
    case 'suspend':
      return `Suspension ${d.days ? `de ${d.days} j` : ''}`.trim();
    case 'unsuspend':
      return 'Suspension levée';
    case 'ban':
      return 'Bannissement';
    case 'unban':
      return 'Bannissement levé';
    case 'revoke_verified':
      return 'Badge vérifié retiré';
    case 'restore_verified':
      return 'Badge vérifié rétabli';
    case 'set_elo':
      return `ELO corrigé ${d.before ?? '?'} → ${d.after ?? '?'}`;
    case 'create_track':
      return 'Circuit créé';
    case 'hide_track':
      return 'Circuit masqué';
    case 'show_track':
      return 'Circuit réaffiché';
    case 'merge_track':
      return `Doublon fusionné${d.merged ? ` (${d.merged})` : ''}`;
    case 'announcement':
      return `Annonce publiée${d.title ? ` : « ${d.title} »` : ''}`;
    default:
      return a.action;
  }
}
