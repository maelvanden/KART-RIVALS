import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  warnings?: { id: string; message: string; created_at: string; acknowledged_at: string | null; admin: string | null }[];
  /** Dates de toutes ses suspensions, la plus récente d'abord. */
  suspensions?: string[];
};

export type PendingWarning = { id: string; message: string; created_at: string; number: number };

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
  /** Région ciblée ; null = toute la France. */
  region: string | null;
  /** Début d'affichage (dans le futur : annonce programmée). */
  starts_at: string;
  /** Circuit ciblé : pilotes dont c'est le favori ou qui y ont roulé ces 90 jours. */
  track_id: string | null;
  track_name: string | null;
};

/** Pilotes touchés par région (région null = pilotes sans circuit favori ni position). */
export type AnnouncementAudience = { region: string | null; pilots: number }[];

export type AdminAction = {
  id: number;
  action: string;
  created_at: string;
  admin: string | null;
  pilot: string | null;
  track: string | null;
  details: Record<string, unknown> | null;
};

export type ContentKind = 'post' | 'comment' | 'photo' | 'review';
export type ContentFilter = 'all' | 'posts' | 'comments' | 'photos' | 'reviews' | 'reported' | 'hidden';
export type AdminContent = {
  kind: ContentKind;
  id: string;
  created_at: string;
  author_id: string;
  author_username: string | null;
  author_avatar: string | null;
  track_id: string | null;
  track_name: string | null;
  post_id: string | null;
  body: string | null;
  media_path: string | null;
  media_type: 'image' | 'video' | null;
  lap_ms: number | null;
  rating: number | null;
  hidden: boolean;
  report_count: number;
};

export type DisputePilot = { id: string; username: string; elo: number };
export type MatchDispute = {
  kind: 'match';
  id: string;
  created_at: string;
  status: 'disputed' | 'awaiting_confirmation';
  format: 'position' | 'lap_time';
  track: string;
  track_id: string;
  challenger: DisputePilot;
  opponent: DisputePilot;
  submitted_by: string | null;
  winner: string | null;
  challenger_position: number | null;
  opponent_position: number | null;
  challenger_best_lap_ms: number | null;
  opponent_best_lap_ms: number | null;
  dispute_reason: string | null;
};
export type RaceDispute = {
  kind: 'race';
  id: string;
  created_at: string;
  status: 'disputed' | 'awaiting_confirmation';
  format: 'position' | 'lap_time';
  track: string;
  track_id: string;
  organizer: string;
  dispute_reason: string | null;
  entries: (DisputePilot & { pilot_id: string; position: number | null; best_lap_ms: number | null; confirmed: boolean })[];
};
export type Dispute = MatchDispute | RaceDispute;

export type TimeAttackReview = {
  id: string;
  pilot_id: string;
  username: string;
  track_id: string;
  track_name: string;
  /** Temps déclaré par le pilote ; null si la vérification a été ouverte d'office sans temps connu. */
  best_lap_ms: number | null;
  previous_best_ms: number | null;
  gap_pct: number | null;
  check_in_at: string;
  ticket_at: string | null;
  validated_at: string | null;
  ticket_path: string | null;
  ticket_name: string | null;
  ocr_text: string | null;
  reviewed: boolean;
  status: 'pending_review' | 'validated';
  deadline_at: string;
  last_rejection_code: string | null;
  rejection_count: number;
  review_requested_at: string | null;
  review_note: string | null;
  /** Vérification ouverte par le planificateur à l'échéance (ticket envoyé mais jamais validé). */
  review_auto: boolean;
  ticket_uploaded_at: string | null;
};
export type TimeAttackFilter = 'pending' | 'suspect' | 'recent';
export type ReviewDecision = 'validate' | 'dnf' | 'cancel';

export type PilotResult = {
  kind: 'match' | 'race' | 'time_attack';
  id: string;
  date: string;
  track: string;
  label: string;
  delta?: number;
  lap_ms?: number;
  outcome: 'win' | 'loss' | 'draw' | 'validated';
};

export type TrackCorrection = {
  id: string;
  track_id: string;
  track_name: string;
  track_city: string;
  kind: 'hours' | 'closed' | 'position' | 'contact' | 'info' | 'other';
  message: string | null;
  suggested_lat: number | null;
  suggested_lng: number | null;
  current_lat: number | null;
  current_lng: number | null;
  status: 'open' | 'applied' | 'dismissed';
  created_at: string;
  author_id: string | null;
  author: string | null;
  handled_by: string | null;
  handled_at: string | null;
};

export type OfficialTrack = {
  id: string;
  name: string;
  city: string;
  postal_code: string | null;
  admins: string[] | null;
  admins_since: string | null;
  page_updated_at: string | null;
  page_updated_by: string | null;
  last_event_at: string | null;
  events_total: number;
  events_upcoming: number;
  promos_active: number;
  promo_reveals: number;
  interests: number;
  photos: number;
  corrections_open: number;
  last_activity: string | null;
};

export type ActivityDept = {
  dept: string | null;
  pilots: number;
  active_30d: number;
  new_30d: number;
  far_pilots: number;
  tracks: number;
  lat: number | null;
  lng: number | null;
};

export type RetentionCohort = {
  month: string;
  signups: number;
  eligible_7d: number;
  returned_7d: number;
  eligible_30d: number;
  returned_30d: number;
  with_challenge: number;
  median_hours_to_challenge: number | null;
};
export type Retention = {
  pilots: number;
  eligible_7d: number;
  returned_7d: number;
  eligible_30d: number;
  returned_30d: number;
  with_challenge: number;
  avg_hours_to_challenge: number | null;
  median_hours_to_challenge: number | null;
  cohorts: RetentionCohort[];
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
  // KartiNono a déjà 2 avertissements : le 3e fait apparaître la suspension suggérée.
  warnings: {
    p4: [
      { id: 'w-2', message: 'Nouveaux propos insultants dans les commentaires de l’Actu.', created_at: ago(60 * 24 * 3), acknowledged_at: ago(60 * 24 * 2), admin: 'Admin' },
      { id: 'w-1', message: 'Merci de rester respectueux sur la Radio Paddock.', created_at: ago(60 * 24 * 12), acknowledged_at: ago(60 * 24 * 11), admin: 'Admin' },
    ],
  } as Record<string, NonNullable<AdminPilotDetail['warnings']>>,
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
      region: null,
      starts_at: ago(60 * 5),
      track_id: null,
      track_name: null,
    },
  ] as Announcement[],
  actions: [
    { id: 2, action: 'announcement', created_at: ago(60 * 5), admin: demoProfile.username, pilot: null, track: null, details: { title: 'Nouveau : la carte regroupe les circuits' } },
    { id: 1, action: 'create_track', created_at: ago(60 * 26), admin: demoProfile.username, pilot: null, track: 'Kart Origins', details: null },
  ] as AdminAction[],
};
const demoContent: AdminContent[] = [
  { kind: 'post', id: 'c1', created_at: ago(12), author_id: 'p2', author_username: 'Drift_Max', author_avatar: null, track_id: 't2', track_name: 'SpeedPark Angers', post_id: 'c1', body: 'Nouveau record perso ce soir 🔥 qui vient me le reprendre ?', media_path: null, media_type: null, lap_ms: 24612, rating: null, hidden: false, report_count: 0 },
  { kind: 'comment', id: 'c2', created_at: ago(35), author_id: 'p4', author_username: 'KartiNono', author_avatar: null, track_id: 't2', track_name: 'SpeedPark Angers', post_id: 'c1', body: 'T’as triché c’est sûr, t’es nul en vrai', media_path: null, media_type: null, lap_ms: null, rating: null, hidden: false, report_count: 1 },
  { kind: 'review', id: 'c3', created_at: ago(80), author_id: 'p1', author_username: 'TurboLéa', author_avatar: null, track_id: 't3', track_name: 'Inwall Kart', post_id: null, body: 'Super accueil, karts bien réglés, un peu cher le week-end.', media_path: null, media_type: null, lap_ms: null, rating: 4.3, hidden: false, report_count: 0 },
  { kind: 'photo', id: 'c4', created_at: ago(140), author_id: 'p3', author_username: 'ApexHunter', author_avatar: null, track_id: 't1', track_name: 'MK Racing', post_id: null, body: 'Le virage en épingle avant la ligne droite', media_path: null, media_type: 'image', lap_ms: null, rating: null, hidden: false, report_count: 0 },
  { kind: 'post', id: 'c5', created_at: ago(300), author_id: 'p4', author_username: 'KartiNono', author_avatar: null, track_id: null, track_name: null, post_id: 'c5', body: 'Vends karts d’occasion, contactez-moi en privé 💸💸', media_path: null, media_type: null, lap_ms: null, rating: null, hidden: true, report_count: 2 },
];

const demoResults = {
  disputes: [
    {
      kind: 'match', id: 'd1', created_at: ago(60 * 20), status: 'disputed', format: 'position', track: 'SpeedPark Angers', track_id: 't2',
      challenger: { id: 'p2', username: 'Drift_Max', elo: 1198 }, opponent: { id: 'p1', username: 'TurboLéa', elo: 1342 },
      submitted_by: 'Drift_Max', winner: 'Drift_Max', challenger_position: 1, opponent_position: 2,
      challenger_best_lap_ms: null, opponent_best_lap_ms: null,
      dispute_reason: 'Il m’a poussée dans l’épingle au dernier tour, j’étais devant avant.',
    },
    {
      kind: 'race', id: 'd2', created_at: ago(60 * 80), status: 'disputed', format: 'position', track: 'Inwall Kart', track_id: 't3',
      organizer: 'ApexHunter', dispute_reason: 'Je suis arrivé 2e, pas 3e : la feuille de temps le montre.',
      entries: [
        { id: 'p3', pilot_id: 'p3', username: 'ApexHunter', elo: 1467, position: 1, best_lap_ms: null, confirmed: true },
        { id: 'p4', pilot_id: 'p4', username: 'KartiNono', elo: 1040, position: 2, best_lap_ms: null, confirmed: true },
        { id: 'p2', pilot_id: 'p2', username: 'Drift_Max', elo: 1198, position: 3, best_lap_ms: null, confirmed: false },
      ],
    },
  ] as Dispute[],
  timeAttacks: [
    {
      id: 'ta1', pilot_id: 'p4', username: 'KartiNono', track_id: 't2', track_name: 'SpeedPark Angers', best_lap_ms: 22106,
      previous_best_ms: 24612, gap_pct: 10.2, check_in_at: ago(60 * 6), ticket_at: ago(60 * 5.5), validated_at: ago(60 * 5),
      ticket_path: null, ticket_name: 'SPEEDPARK ANGERS', ocr_text: 'SPEEDPARK ANGERS\nSESSION 14:30\nKARTINONO\nMEILLEUR TOUR 22.106', reviewed: false,
      status: 'validated', deadline_at: ago(60 * 4.5), last_rejection_code: null, rejection_count: 0, review_requested_at: null,
      review_note: null, review_auto: false, ticket_uploaded_at: ago(60 * 5),
    },
    {
      id: 'ta2', pilot_id: 'p1', username: 'TurboLéa', track_id: 't3', track_name: 'Inwall Kart', best_lap_ms: 31204,
      previous_best_ms: 30877, gap_pct: -1.1, check_in_at: ago(110), ticket_at: null, validated_at: null,
      ticket_path: null, ticket_name: 'Léa Martin', ocr_text: null, reviewed: false,
      status: 'pending_review', deadline_at: ago(20), last_rejection_code: 'TICKET_TIME_UNREADABLE', rejection_count: 2,
      review_requested_at: ago(35), review_note: 'Le ticket a pris l’eau, l’heure est en haut à droite : 15:42.', review_auto: false,
      ticket_uploaded_at: ago(38),
    },
    {
      id: 'ta3', pilot_id: 'p3', username: 'ApexHunter', track_id: 't1', track_name: 'MK Racing', best_lap_ms: null,
      previous_best_ms: 31840, gap_pct: null, check_in_at: ago(200), ticket_at: null, validated_at: null,
      ticket_path: null, ticket_name: null, ocr_text: null, reviewed: false,
      status: 'pending_review', deadline_at: ago(110), last_rejection_code: null, rejection_count: 0,
      review_requested_at: ago(100), review_note: null, review_auto: true, ticket_uploaded_at: ago(150),
    },
  ] as TimeAttackReview[],
};

const demoCorrections: TrackCorrection[] = [
  { id: 'tc1', track_id: 't3', track_name: 'Inwall Kart', track_city: 'Les Ponts-de-Cé', kind: 'hours', message: 'Maintenant fermé le lundi, ouvert jusqu’à 23 h le samedi.', suggested_lat: null, suggested_lng: null, current_lat: 47.4284, current_lng: -0.5434, status: 'open', created_at: ago(90), author_id: 'p1', author: 'TurboLéa', handled_by: null, handled_at: null },
  { id: 'tc2', track_id: 't2', track_name: 'SpeedPark Angers', track_city: 'Beaucouzé', kind: 'position', message: 'L’entrée est de l’autre côté du centre commercial.', suggested_lat: 47.4752, suggested_lng: -0.6265, current_lat: 47.4742, current_lng: -0.6301, status: 'open', created_at: ago(300), author_id: 'p3', author: 'ApexHunter', handled_by: null, handled_at: null },
];

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
          warnings: [...(demo.warnings[p.id] ?? [])],
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
        .select(ANNOUNCEMENT_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw socialError(error);
      return (data as unknown as AnnouncementRow[]).map(toAnnouncement);
    },
  });
}

const ANNOUNCEMENT_COLUMNS = 'id, title, body, link_url, created_at, starts_at, ends_at, archived_at, region, track_id, track:tracks (name)';
type AnnouncementRow = Omit<Announcement, 'track_name'> & { track: { name: string } | null };
const toAnnouncement = ({ track, ...a }: AnnouncementRow): Announcement => ({ ...a, track_name: track?.name ?? null });

/** Annonce en cours la plus récente qui concerne le pilote (nationale, de sa région ou de ses circuits). */
export function useLiveAnnouncement() {
  return useQuery({
    queryKey: ['announcements', 'live'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Announcement | null> => {
      if (isDemoMode) {
        // Le pilote de démo court en Pays de la Loire.
        return (
          demo.announcements.find(
            (a) =>
              !a.archived_at &&
              Date.parse(a.starts_at) <= Date.now() &&
              Date.parse(a.ends_at) > Date.now() &&
              (!a.region || a.region === 'Pays de la Loire') &&
              (!a.track_id || a.track_id === demoProfile.home_track_id),
          ) ?? null
        );
      }
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('announcements')
        .select(ANNOUNCEMENT_COLUMNS)
        .is('archived_at', null)
        .lte('starts_at', now)
        .gt('ends_at', now)
        .order('starts_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? toAnnouncement(data as unknown as AnnouncementRow) : null;
    },
  });
}

export function usePublishAnnouncement() {
  const invalidate = useInvalidate('announcements', 'admin-actions');
  return useMutation({
    mutationFn: async ({
      title,
      body,
      link,
      days,
      region,
      track,
      startsAt,
    }: {
      title: string;
      body: string;
      link?: string;
      days: number;
      region?: string | null;
      track?: { id: string; name: string } | null;
      /** Null : tout de suite. */
      startsAt?: Date | null;
    }) => {
      if (title.trim().length < 3) throw new Error('Le titre doit faire entre 3 et 80 caractères.');
      if (!body.trim()) throw new Error('Écris le message de l’annonce.');
      if (link?.trim() && !/^https:\/\//.test(link.trim())) throw new Error('Le lien doit commencer par https://');
      if (isDemoMode) {
        const start = startsAt && startsAt.getTime() > Date.now() ? startsAt : new Date();
        demo.announcements.unshift({
          id: `ann-${Date.now()}`,
          title: title.trim(),
          body: body.trim(),
          link_url: link?.trim() || null,
          created_at: new Date().toISOString(),
          starts_at: start.toISOString(),
          ends_at: new Date(start.getTime() + days * 86_400_000).toISOString(),
          archived_at: null,
          region: region ?? null,
          track_id: track?.id ?? null,
          track_name: track?.name ?? null,
        });
        logDemo('announcement', null, track?.name ?? null, { title: title.trim(), region: region ?? undefined });
        return;
      }
      await rpc('admin_publish_announcement', {
        p_title: title,
        p_body: body,
        p_link: link?.trim() || null,
        p_days: days,
        p_region: region ?? null,
        p_track_id: track?.id ?? null,
        p_starts_at: startsAt ? startsAt.toISOString() : null,
      });
    },
    onSuccess: invalidate,
  });
}

export function useAnnouncementAudience(enabled: boolean) {
  return useQuery({
    queryKey: ['announcement-audience'],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<AnnouncementAudience> => {
      if (isDemoMode) {
        return [
          { region: 'Pays de la Loire', pilots: 512 },
          { region: 'Bretagne', pilots: 236 },
          { region: null, pilots: 188 },
          { region: 'Île-de-France', pilots: 121 },
          { region: 'Hauts-de-France', pilots: 64 },
          { region: 'Normandie', pilots: 58 },
          { region: 'Nouvelle-Aquitaine', pilots: 41 },
        ];
      }
      return rpc<AnnouncementAudience>('admin_announcement_audience');
    },
  });
}

/** Pilotes touchés par une annonce sur ce circuit. */
export function useTrackAudience(trackId: string | null) {
  return useQuery({
    queryKey: ['announcement-audience', 'track', trackId],
    enabled: !!trackId,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<number> => {
      if (isDemoMode) return trackId === 't2' ? 87 : 34;
      return rpc<number>('admin_track_audience', { p_track: trackId });
    },
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

// Modération de l'Actu

export function useAdminContent(filter: ContentFilter, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['admin-content', filter],
    enabled,
    initialPageParam: null as string | null,
    getNextPageParam: (last: AdminContent[]) => (last.length === 30 ? last[last.length - 1].created_at : undefined),
    queryFn: async ({ pageParam }): Promise<AdminContent[]> => {
      if (isDemoMode) {
        if (pageParam) return [];
        const kind = { posts: 'post', comments: 'comment', photos: 'photo', reviews: 'review' }[filter as string];
        return demoContent
          .filter((c) => (kind ? c.kind === kind : filter === 'hidden' ? c.hidden : filter === 'reported' ? c.report_count > 0 : true))
          .map((c) => ({ ...c }));
      }
      return rpc<AdminContent[]>('admin_content', { p_filter: filter, p_before: pageParam, p_limit: 30 });
    },
  });
}

export function useSetContentHidden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, id, hidden }: { kind: ContentKind; id: string; hidden: boolean }) => {
      if (isDemoMode) {
        const c = demoContent.find((x) => x.id === id);
        if (c) {
          c.hidden = hidden;
          logDemo(hidden ? 'hide_content' : 'show_content', c.author_username, null, { kind, excerpt: c.body?.slice(0, 80) });
        }
        return;
      }
      await rpc('admin_set_content_hidden', { p_kind: kind, p_id: id, p_hidden: hidden });
    },
    // Mise à jour immédiate de la carte, puis rafraîchissement des fils concernés.
    onSuccess: (_, { id, hidden }) => {
      queryClient.setQueriesData<{ pages: AdminContent[][]; pageParams: unknown[] }>({ queryKey: ['admin-content'] }, (data) =>
        data ? { ...data, pages: data.pages.map((page) => page.map((c) => (c.id === id ? { ...c, hidden } : c))) } : data,
      );
      ['admin-actions', 'feed', 'post-comments', 'track-photos', 'track-reviews', 'track-ratings', 'admin-reports'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      );
    },
  });
}

// Avertissements

export function useWarnPilot() {
  const invalidate = useInvalidate('admin-pilot', 'admin-actions');
  return useMutation({
    mutationFn: async ({ pilotId, message }: { pilotId: string; message: string }): Promise<number> => {
      if (message.trim().length < 5) throw new Error('Écris le message de l’avertissement (5 caractères minimum).');
      if (isDemoMode) {
        const p = demo.pilots.find((x) => x.id === pilotId);
        const list = (demo.warnings[pilotId] ??= []);
        list.unshift({ id: `w-${Date.now()}`, message: message.trim(), created_at: new Date().toISOString(), acknowledged_at: null, admin: demoProfile.username });
        logDemo('warn', p?.username ?? null, null, { number: list.length, reason: message.trim() });
        return list.length;
      }
      return rpc<number>('admin_warn_pilot', { p_profile: pilotId, p_message: message.trim() });
    },
    onSuccess: invalidate,
  });
}

// Notes internes (jamais visibles du pilote)

export type PilotNote = { id: string; body: string; created_at: string; author: string | null; mine: boolean };

const demoNotes: Record<string, PilotNote[]> = {
  p4: [{ id: 'n1', body: 'Déjà prévenu oralement au circuit par le gérant de SpeedPark.', created_at: ago(60 * 24 * 5), author: 'Admin', mine: false }],
};

export function usePilotNotes(pilotId: string | undefined) {
  return useQuery({
    queryKey: ['admin-pilot-notes', pilotId],
    enabled: !!pilotId,
    queryFn: async (): Promise<PilotNote[]> => {
      if (isDemoMode) return [...(demoNotes[pilotId!] ?? [])];
      return rpc<PilotNote[]>('admin_pilot_notes', { p_profile: pilotId });
    },
  });
}

export function useAddPilotNote() {
  const invalidate = useInvalidate('admin-pilot-notes');
  return useMutation({
    mutationFn: async ({ pilotId, body }: { pilotId: string; body: string }) => {
      if (body.trim().length < 2) throw new Error('Écris la note (2 caractères minimum).');
      if (isDemoMode) {
        (demoNotes[pilotId] ??= []).unshift({
          id: `n-${Date.now()}`,
          body: body.trim(),
          created_at: new Date().toISOString(),
          author: demoProfile.username,
          mine: true,
        });
        return;
      }
      await rpc('admin_add_pilot_note', { p_profile: pilotId, p_body: body.trim() });
    },
    onSuccess: invalidate,
  });
}

export function useDeletePilotNote() {
  const invalidate = useInvalidate('admin-pilot-notes');
  return useMutation({
    mutationFn: async ({ pilotId, id }: { pilotId: string; id: string }) => {
      if (isDemoMode) {
        demoNotes[pilotId] = (demoNotes[pilotId] ?? []).filter((n) => n.id !== id);
        return;
      }
      await rpc('admin_delete_pilot_note', { p_id: id });
    },
    onSuccess: invalidate,
  });
}

/** Avertissement officiel pas encore lu par le pilote connecté (affiché à l'ouverture de l'appli). */
export function useMyPendingWarning(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['pending-warning', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PendingWarning | null> => {
      if (isDemoMode) return null;
      const { data, error } = await supabase.rpc('my_pending_warning');
      if (error) throw error;
      return (data as PendingWarning | null) ?? null;
    },
  });
}

export function useAcknowledgeWarning() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) return;
      const { error } = await supabase.rpc('acknowledge_warning', { p_id: id });
      if (error) throw socialError(error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-warning'] }),
  });
}

// Résultats : litiges, Time Attack suspects, annulations

export function useAdminDisputes(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-disputes'],
    enabled,
    queryFn: async (): Promise<Dispute[]> => {
      if (isDemoMode) return demoResults.disputes.map((d) => ({ ...d }));
      return rpc<Dispute[]>('admin_disputes');
    },
  });
}

const RESULT_KEYS = ['admin-disputes', 'admin-time-attacks', 'admin-pilot-results', 'admin-actions', 'admin-stats', 'profile', 'leaderboard', 'elo-history'];

export function useResolveMatch() {
  const invalidate = useInvalidate(...RESULT_KEYS);
  return useMutation({
    mutationFn: async (input: {
      matchId: string;
      decision: 'validate' | 'correct' | 'cancel';
      challengerPosition?: number;
      opponentPosition?: number;
      challengerLapMs?: number;
      opponentLapMs?: number;
      note?: string;
    }) => {
      if (isDemoMode) {
        const d = demoResults.disputes.find((x) => x.id === input.matchId) as MatchDispute | undefined;
        demoResults.disputes = demoResults.disputes.filter((x) => x.id !== input.matchId);
        if (d) for (const u of [d.challenger.username, d.opponent.username]) logDemo('resolve_match', u, d.track, { decision: input.decision, reason: input.note });
        return;
      }
      await rpc('admin_resolve_match', {
        p_match_id: input.matchId,
        p_decision: input.decision,
        p_challenger_position: input.challengerPosition ?? null,
        p_opponent_position: input.opponentPosition ?? null,
        p_challenger_lap_ms: input.challengerLapMs ?? null,
        p_opponent_lap_ms: input.opponentLapMs ?? null,
        p_note: input.note?.trim() || null,
      });
    },
    onSuccess: invalidate,
  });
}

export function useResolveRace() {
  const invalidate = useInvalidate(...RESULT_KEYS);
  return useMutation({
    mutationFn: async ({ raceId, decision, note }: { raceId: string; decision: 'validate' | 'cancel'; note?: string }) => {
      if (isDemoMode) {
        const d = demoResults.disputes.find((x) => x.id === raceId) as RaceDispute | undefined;
        demoResults.disputes = demoResults.disputes.filter((x) => x.id !== raceId);
        if (d) for (const e of d.entries) logDemo('resolve_race', e.username, d.track, { decision, reason: note });
        return;
      }
      await rpc('admin_resolve_race', { p_race_id: raceId, p_decision: decision, p_note: note?.trim() || null });
    },
    onSuccess: invalidate,
  });
}

export function useCancelResult() {
  const invalidate = useInvalidate(...RESULT_KEYS);
  return useMutation({
    mutationFn: async ({ kind, id, note }: { kind: 'match' | 'race'; id: string; note?: string }) => {
      if (isDemoMode) {
        logDemo(`cancel_${kind}`, null, null, { reason: note });
        return;
      }
      await rpc('admin_cancel_result', { p_kind: kind, p_id: id, p_note: note?.trim() || null });
    },
    onSuccess: invalidate,
  });
}

export function useAdminPilotResults(pilotId: string | undefined) {
  return useQuery({
    queryKey: ['admin-pilot-results', pilotId],
    enabled: !!pilotId,
    queryFn: async (): Promise<PilotResult[]> => {
      if (isDemoMode) {
        return [
          { kind: 'match', id: 'pr1', date: ago(60 * 30), track: 'SpeedPark Angers', label: 'Défi contre TurboLéa', delta: 18, outcome: 'win' },
          { kind: 'race', id: 'pr2', date: ago(60 * 26), track: 'Inwall Kart', label: 'Course · 2e sur 4', delta: 6, outcome: 'loss' },
          { kind: 'time_attack', id: 'pr3', date: ago(60 * 50), track: 'MK Racing', label: 'Time Attack', lap_ms: 31840, outcome: 'validated' },
        ];
      }
      return rpc<PilotResult[]>('admin_pilot_results', { p_profile: pilotId });
    },
  });
}

export function useAdminTimeAttacks(filter: TimeAttackFilter, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-time-attacks', filter],
    enabled,
    queryFn: async (): Promise<TimeAttackReview[]> => {
      if (isDemoMode) {
        return demoResults.timeAttacks
          .filter((t) =>
            filter === 'pending'
              ? t.status === 'pending_review'
              : t.status === 'validated' && (filter === 'recent' || (!t.reviewed && (t.gap_pct ?? 0) > 3)),
          )
          .map((t) => ({ ...t }));
      }
      return rpc<TimeAttackReview[]>('admin_time_attacks', { p_filter: filter });
    },
  });
}

export function useReviewTimeAttack() {
  const invalidate = useInvalidate(...RESULT_KEYS);
  return useMutation({
    mutationFn: async ({ id, valid, reason }: { id: string; valid: boolean; reason?: string }) => {
      if (isDemoMode) {
        const t = demoResults.timeAttacks.find((x) => x.id === id);
        if (t) {
          t.reviewed = true;
          if (!valid) demoResults.timeAttacks = demoResults.timeAttacks.filter((x) => x.id !== id);
          logDemo(valid ? 'approve_time_attack' : 'reject_time_attack', t.username, t.track_name, { lap_ms: t.best_lap_ms, reason });
        }
        return;
      }
      await rpc('admin_review_time_attack', { p_id: id, p_valid: valid, p_reason: reason?.trim() || null });
    },
    onSuccess: invalidate,
  });
}

/** Décision sur un ticket envoyé en vérification manuelle : validé (temps corrigé possible), DNF ou annulé sans pénalité. */
export function useDecideTimeAttackReview() {
  const invalidate = useInvalidate(...RESULT_KEYS);
  return useMutation({
    mutationFn: async ({ id, decision, bestLapMs, reason }: { id: string; decision: ReviewDecision; bestLapMs?: number | null; reason?: string }) => {
      if (isDemoMode) {
        const t = demoResults.timeAttacks.find((x) => x.id === id);
        if (!t || t.status !== 'pending_review') throw new Error('Cette session a déjà été tranchée.');
        demoResults.timeAttacks = demoResults.timeAttacks.filter((x) => x.id !== id);
        if (decision === 'validate') {
          demoResults.timeAttacks.unshift({ ...t, status: 'validated', best_lap_ms: bestLapMs ?? t.best_lap_ms, validated_at: new Date().toISOString(), ticket_at: t.ticket_uploaded_at, reviewed: true });
        }
        logDemo(`review_${decision}_time_attack`, t.username, t.track_name, { lap_ms: bestLapMs ?? t.best_lap_ms, reason: reason?.trim() || undefined });
        return;
      }
      await rpc('admin_decide_time_attack_review', {
        p_id: id,
        p_decision: decision,
        p_best_lap_ms: decision === 'validate' ? (bestLapMs ?? null) : null,
        p_reason: reason?.trim() || null,
      });
    },
    onSuccess: invalidate,
  });
}

/** Lien temporaire vers la photo d'un ticket (bucket privé, lisible par les admins appli). */
export function useTicketUrl(path: string | null) {
  return useQuery({
    queryKey: ['ticket-url', path],
    enabled: !!path && !isDemoMode,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('time-attack-tickets').createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

// Remontées des pilotes et kartings officiels

export function useTrackCorrections(status: 'open' | 'done', enabled: boolean) {
  return useQuery({
    queryKey: ['track-corrections', status],
    enabled,
    queryFn: async (): Promise<TrackCorrection[]> => {
      if (isDemoMode) return demoCorrections.filter((c) => (status === 'open') === (c.status === 'open')).map((c) => ({ ...c }));
      return rpc<TrackCorrection[]>('admin_track_corrections', { p_status: status });
    },
  });
}

export function useResolveTrackCorrection() {
  const invalidate = useInvalidate('track-corrections', 'admin-tracks', 'tracks-map', 'admin-actions', 'admin-officials');
  return useMutation({
    mutationFn: async ({ id, status, applyPosition }: { id: string; status: 'applied' | 'dismissed'; applyPosition?: boolean }) => {
      if (isDemoMode) {
        const c = demoCorrections.find((x) => x.id === id);
        if (c) {
          c.status = status;
          c.handled_by = demoProfile.username;
          c.handled_at = new Date().toISOString();
          logDemo('track_correction', c.author, c.track_name, { decision: status, kind: c.kind });
        }
        return;
      }
      await rpc('resolve_track_correction', { p_id: id, p_status: status, p_apply_position: !!applyPosition });
    },
    onSuccess: invalidate,
  });
}

export function useOfficialTracks(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-officials'],
    enabled,
    queryFn: async (): Promise<OfficialTrack[]> => {
      if (isDemoMode) {
        return demoTrackDetails
          .filter((t) => t.is_official)
          .map((t, i) => ({
            id: t.id,
            name: t.name,
            city: t.city,
            postal_code: t.postal_code,
            admins: i === 0 ? [demoProfile.username] : ['KartiNono', 'Gérant_SP'],
            admins_since: ago(60 * 24 * (40 + i * 20)),
            page_updated_at: i === 0 ? ago(60 * 24 * 2) : ago(60 * 24 * 75),
            page_updated_by: i === 0 ? demoProfile.username : 'KartiNono',
            last_event_at: i === 0 ? ago(60 * 24 * 5) : null,
            events_total: i === 0 ? 6 : 0,
            events_upcoming: i === 0 ? 2 : 0,
            promos_active: i === 0 ? 1 : 0,
            promo_reveals: i === 0 ? 37 : 0,
            interests: i === 0 ? 54 : 0,
            photos: 8 - i * 5,
            corrections_open: demoCorrections.filter((c) => c.track_id === t.id && c.status === 'open').length,
            last_activity: i === 0 ? ago(60 * 24 * 2) : ago(60 * 24 * 75),
          }));
      }
      return rpc<OfficialTrack[]>('admin_official_tracks');
    },
  });
}

// Statistiques avancées

export function useActivityMap(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-activity-map'],
    enabled,
    queryFn: async (): Promise<ActivityDept[]> => {
      if (isDemoMode) {
        // Démo : pilotes répartis autour des circuits de démonstration.
        const byDept = new Map<string, { n: number; lat: number; lng: number }>();
        for (const t of demoTrackDetails) {
          const d = t.postal_code?.slice(0, 2);
          if (!d) continue;
          const cur = byDept.get(d) ?? { n: 0, lat: 0, lng: 0 };
          byDept.set(d, { n: cur.n + 1, lat: cur.lat + t.lat, lng: cur.lng + t.lng });
        }
        const weight: Record<string, number> = { '49': 420, '44': 260, '35': 140, '72': 90, '85': 75, '53': 30, '33': 120, '69': 150, '75': 0 };
        return [...byDept.entries()]
          .map(([dept, v]): ActivityDept => {
            const pilots = weight[dept] ?? Math.round((v.n * 7 + dept.charCodeAt(1)) % 40);
            return {
              dept,
              pilots,
              active_30d: Math.round(pilots * 0.45),
              new_30d: Math.round(pilots * 0.12),
              far_pilots: dept === '53' || dept === '35' ? Math.round(pilots * 0.4) : Math.round(pilots * 0.05),
              tracks: v.n,
              lat: v.lat / v.n,
              lng: v.lng / v.n,
            };
          })
          .concat([{ dept: null, pilots: 64, active_30d: 10, new_30d: 8, far_pilots: 0, tracks: 0, lat: null, lng: null }])
          .sort((a, b) => b.pilots - a.pilots);
      }
      return rpc<ActivityDept[]>('admin_activity_map');
    },
  });
}

/** Département où il manque des kartings : beaucoup de pilotes par circuit, ou beaucoup de pilotes loin d'un circuit. */
export const isShortage = (d: ActivityDept) =>
  d.pilots >= 20 && (d.pilots / Math.max(1, d.tracks) >= 60 || d.far_pilots / d.pilots >= 0.25);

export function useRetention(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-retention'],
    enabled,
    queryFn: async (): Promise<Retention> => {
      if (isDemoMode) {
        const months = ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05'];
        const cohorts = months.map((month, i) => {
          const signups = [212, 341, 298, 187, 164, 82][i];
          return {
            month,
            signups,
            eligible_7d: i === 0 ? 150 : signups,
            returned_7d: Math.round((i === 0 ? 150 : signups) * (0.58 - i * 0.02)),
            eligible_30d: i === 0 ? 0 : signups,
            returned_30d: i === 0 ? 0 : Math.round(signups * (0.36 - i * 0.015)),
            with_challenge: Math.round(signups * (0.41 + i * 0.02)),
            median_hours_to_challenge: [30, 42, 51, 60, 66, 72][i],
          };
        });
        return {
          pilots: 1284,
          eligible_7d: 1222,
          returned_7d: 668,
          eligible_30d: 1072,
          returned_30d: 351,
          with_challenge: 571,
          avg_hours_to_challenge: 94.5,
          median_hours_to_challenge: 41,
          cohorts,
        };
      }
      return rpc<Retention>('admin_retention');
    },
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
    case 'resolve_match':
    case 'resolve_race': {
      const what = a.action === 'resolve_match' ? 'Défi contesté' : 'Course contestée';
      const verdict = { validate: 'validé', correct: 'corrigé', cancel: 'annulé' }[d.decision as string] ?? 'tranché';
      return `${what} : résultat ${verdict}`;
    }
    case 'cancel_match':
      return 'Défi annulé, ELO rendu';
    case 'cancel_race':
      return 'Course annulée, ELO rendu';
    case 'approve_time_attack':
      return 'Time Attack vérifié et confirmé';
    case 'reject_time_attack':
      return 'Time Attack refusé';
    case 'review_validate_time_attack':
      return 'Ticket vérifié à la main : chrono validé';
    case 'review_dnf_time_attack':
      return 'Ticket vérifié à la main : DNF (−15 ELO)';
    case 'review_cancel_time_attack':
      return 'Ticket vérifié à la main : annulé sans pénalité';
    case 'track_correction':
      return `Remontée ${d.decision === 'applied' ? 'appliquée (+20 pts)' : 'rejetée'}`;
    case 'warn':
      return `Avertissement n°${d.number ?? '?'}`;
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
    case 'hide_content':
    case 'show_content': {
      const kind = { post: 'Publication', comment: 'Commentaire', photo: 'Photo', review: 'Avis' }[d.kind as string] ?? 'Contenu';
      return `${kind} ${a.action === 'hide_content' ? 'masqué' : 'rétabli'}${d.kind === 'post' || d.kind === 'photo' ? 'e' : ''}${d.excerpt ? ` : « ${d.excerpt} »` : ''}`;
    }
    case 'announcement':
      return `Annonce ${d.starts_at ? 'programmée' : 'publiée'}${d.region ? ` (${d.region})` : ''}${d.title ? ` : « ${d.title} »` : ''}`;
    default:
      return a.action;
  }
}
