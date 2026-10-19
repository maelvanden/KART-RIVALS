import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { useAuth } from '@/features/auth/auth-provider';
import { demoPilots } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { demoProfile, demoTrackDetails, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { PilotSummary, ReportReason, TrackDetails } from '@/types/models';

export type AdminRoles = { is_app_admin: boolean; admin_exists: boolean; managed_track_ids: string[] };
export type AdminPilot = PilotSummary & { since: string };
export type TrackAdminRequest = {
  id: string;
  track_id: string;
  track_name: string;
  track_city: string;
  profile_id: string;
  username: string;
  avatar_url: string | null;
  elo: number;
  rank: PilotSummary['rank'];
  message: string | null;
  created_at: string;
};
export type ReportStatus = 'open' | 'reviewed' | 'dismissed';
export type AdminReport = {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  reporter_id: string;
  reporter_username: string | null;
  target_id: string;
  target_username: string | null;
  target_report_count: number;
  message_id: string | null;
  message_kind: string | null;
  message_body: string | null;
  message_hidden: boolean;
  photo_id: string | null;
  photo_path: string | null;
  photo_hidden: boolean;
  review_id?: string | null;
  review_comment?: string | null;
  review_track?: string | null;
  review_hidden?: boolean;
};
/** Champs d'une fiche circuit modifiables par ses gestionnaires (chaîne vide = effacer). */
export type TrackPageInput = Partial<
  Pick<
    TrackDetails,
    | 'name'
    | 'address'
    | 'postal_code'
    | 'city'
    | 'kart_power'
    | 'is_indoor'
    | 'description'
    | 'booking_url'
    | 'website'
    | 'phone'
    | 'instagram_url'
    | 'facebook_url'
    | 'tiktok_url'
    | 'youtube_url'
    | 'layout_url'
    | 'lat'
    | 'lng'
  > & { length_m: number | string | null }
>;

// ---------- Mode démo : le pilote de démo est admin appli et gère SpeedPark Angers ----------
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const asAdmin = (p: PilotSummary, minutes: number): AdminPilot => ({ ...p, since: ago(minutes) });
const demoAdmin = {
  appAdmins: [] as AdminPilot[],
  trackAdmins: { t1: [] as AdminPilot[] } as Record<string, AdminPilot[]>,
  requests: [
    {
      id: 'req-1',
      track_id: 't3',
      track_name: 'Inwall Kart',
      track_city: 'Les Ponts-de-Cé',
      profile_id: 'p4',
      username: demoPilots.p4.username,
      avatar_url: null,
      elo: demoPilots.p4.elo,
      rank: demoPilots.p4.rank,
      message: 'Je suis responsable de piste chez Inwall, je voudrais tenir la fiche à jour (horaires, événements).',
      created_at: ago(120),
    },
  ] as TrackAdminRequest[],
  myRequests: {} as Record<string, boolean>,
  reports: [
    {
      id: 'rep-1',
      reason: 'harassment',
      details: 'Insultes après la course de samedi.',
      status: 'open',
      created_at: ago(45),
      reporter_id: 'p1',
      reporter_username: 'TurboLéa',
      target_id: 'p2',
      target_username: 'Drift_Max',
      target_report_count: 2,
      message_id: 'm-x',
      message_kind: 'text',
      message_body: 'T’as gagné en trichant, reviens plus jamais sur la piste.',
      message_hidden: false,
      photo_id: null,
      photo_path: null,
      photo_hidden: false,
    },
    {
      id: 'rep-2',
      reason: 'cheating',
      details: 'Chrono impossible sur SpeedPark, 3 s sous le record.',
      status: 'open',
      created_at: ago(300),
      reporter_id: 'p3',
      reporter_username: 'ApexHunter',
      target_id: 'p4',
      target_username: 'KartiNono',
      target_report_count: 1,
      message_id: null,
      message_kind: null,
      message_body: null,
      message_hidden: false,
      photo_id: null,
      photo_path: null,
      photo_hidden: false,
    },
  ] as AdminReport[],
};
const demoMe = (): PilotSummary => ({
  id: demoProfile.id,
  username: demoProfile.username,
  avatar_url: demoProfile.avatar_url,
  elo: demoProfile.elo,
  rank: demoProfile.rank,
});
demoAdmin.appAdmins.push(asAdmin(demoMe(), 9000));
demoAdmin.trackAdmins.t1.push(asAdmin(demoMe(), 9000));

const demoPilot = (id: string): PilotSummary | undefined => (id === demoProfile.id ? demoMe() : demoPilots[id]);

// ---------- Rôles ----------

export function useAdminRoles() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['admin-roles', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<AdminRoles> => {
      if (isDemoMode) {
        return {
          is_app_admin: demoAdmin.appAdmins.some((a) => a.id === demoProfile.id),
          admin_exists: demoAdmin.appAdmins.length > 0,
          managed_track_ids: Object.entries(demoAdmin.trackAdmins)
            .filter(([, list]) => list.some((a) => a.id === demoProfile.id))
            .map(([id]) => id),
        };
      }
      const { data, error } = await supabase.rpc('my_admin_roles');
      if (error) throw error;
      return data as AdminRoles;
    },
  });
}

/** Le pilote connecté peut-il gérer cette fiche (admin appli ou admin de ce karting) ? */
export function useCanManageTrack(trackId: string | undefined) {
  const roles = useAdminRoles().data;
  return !!roles && !!trackId && (roles.is_app_admin || roles.managed_track_ids.includes(trackId));
}

function useInvalidate(...keys: string[]) {
  const queryClient = useQueryClient();
  return () => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
}

export function useClaimAppAdmin() {
  const invalidate = useInvalidate('admin-roles', 'app-admins');
  return useMutation({
    mutationFn: async () => {
      if (isDemoMode) {
        if (demoAdmin.appAdmins.length === 0) demoAdmin.appAdmins.push(asAdmin(demoMe(), 0));
        return;
      }
      const { error } = await supabase.rpc('claim_app_admin');
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useAppAdmins(enabled: boolean) {
  return useQuery({
    queryKey: ['app-admins'],
    enabled,
    queryFn: async (): Promise<AdminPilot[]> => {
      if (isDemoMode) return [...demoAdmin.appAdmins];
      const { data, error } = await supabase.rpc('list_app_admins');
      if (error) throw socialError(error);
      return data as AdminPilot[];
    },
  });
}

export function useSetAppAdmin() {
  const invalidate = useInvalidate('app-admins', 'admin-roles');
  return useMutation({
    mutationFn: async ({ pilotId, admin }: { pilotId: string; admin: boolean }) => {
      if (isDemoMode) {
        if (!admin) {
          if (demoAdmin.appAdmins.length <= 1) throw new Error('Il faut garder au moins un admin appli.');
          demoAdmin.appAdmins = demoAdmin.appAdmins.filter((a) => a.id !== pilotId);
        } else {
          const p = demoPilot(pilotId);
          if (p && !demoAdmin.appAdmins.some((a) => a.id === pilotId)) demoAdmin.appAdmins.push(asAdmin(p, 0));
        }
        return;
      }
      const { error } = await supabase.rpc('set_app_admin', { p_profile_id: pilotId, p_admin: admin });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

// ---------- Admins karting ----------

export function useTrackAdmins(trackId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['track-admins', trackId],
    enabled: !!trackId && enabled,
    queryFn: async (): Promise<AdminPilot[]> => {
      if (isDemoMode) return [...(demoAdmin.trackAdmins[trackId!] ?? [])];
      const { data, error } = await supabase.rpc('list_track_admins', { p_track_id: trackId });
      if (error) throw socialError(error);
      return data as AdminPilot[];
    },
  });
}

export function useSetTrackAdmin(trackId: string) {
  const invalidate = useInvalidate('track-admins', 'admin-roles', 'admin-requests');
  return useMutation({
    mutationFn: async ({ pilotId, admin }: { pilotId: string; admin: boolean }) => {
      if (isDemoMode) {
        const list = (demoAdmin.trackAdmins[trackId] ??= []);
        if (admin) {
          const p = demoPilot(pilotId);
          if (p && !list.some((a) => a.id === pilotId)) list.push(asAdmin(p, 0));
        } else {
          demoAdmin.trackAdmins[trackId] = list.filter((a) => a.id !== pilotId);
        }
        return;
      }
      const { error } = await supabase.rpc('set_track_admin', { p_track_id: trackId, p_profile_id: pilotId, p_admin: admin });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

// ---------- Demandes de gestion ----------

/** Ma demande en attente pour ce circuit. */
export function useMyTrackRequest(trackId: string | undefined) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['admin-requests', 'mine', trackId],
    enabled: !!trackId && !!userId,
    queryFn: async (): Promise<boolean> => {
      if (isDemoMode) return !!demoAdmin.myRequests[trackId!];
      const { data, error } = await supabase
        .from('track_admin_requests')
        .select('id')
        .eq('track_id', trackId!)
        .eq('profile_id', userId!)
        .eq('status', 'pending')
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}

export function useRequestTrackAdmin(trackId: string) {
  const invalidate = useInvalidate('admin-requests');
  return useMutation({
    mutationFn: async (message: string) => {
      if (isDemoMode) {
        demoAdmin.myRequests[trackId] = true;
        return;
      }
      const { error } = await supabase.rpc('request_track_admin', { p_track_id: trackId, p_message: message.trim() || null });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useAdminTrackRequests(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-requests', 'all'],
    enabled,
    queryFn: async (): Promise<TrackAdminRequest[]> => {
      if (isDemoMode) return [...demoAdmin.requests];
      const { data, error } = await supabase.rpc('admin_track_requests');
      if (error) throw socialError(error);
      return data as TrackAdminRequest[];
    },
  });
}

export function useRespondTrackRequest() {
  const invalidate = useInvalidate('admin-requests', 'track-admins');
  return useMutation({
    mutationFn: async ({ request, accept }: { request: TrackAdminRequest; accept: boolean }) => {
      if (isDemoMode) {
        demoAdmin.requests = demoAdmin.requests.filter((r) => r.id !== request.id);
        const p = demoPilot(request.profile_id);
        if (accept && p) (demoAdmin.trackAdmins[request.track_id] ??= []).push(asAdmin(p, 0));
        return;
      }
      const { error } = await supabase.rpc('respond_track_admin_request', { p_request_id: request.id, p_accept: accept });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

// ---------- Fiche circuit ----------

/** Liens saisis sans protocole (« www.monkarting.fr ») complétés en https://. */
export function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  if (/^https:\/\//i.test(v)) return v;
  return `https://${v.replace(/^http:\/\//i, '')}`;
}

export function useUpdateTrackPage(trackId: string) {
  const invalidate = useInvalidate('tracks-map', 'tracks');
  return useMutation({
    mutationFn: async (input: TrackPageInput) => {
      if (isDemoMode) {
        const t = demoTrackDetails.find((x) => x.id === trackId);
        if (t) {
          const clean = Object.fromEntries(
            Object.entries(input).map(([k, v]) => [k, v === '' ? null : k === 'length_m' && v != null ? Number(v) : v]),
          );
          Object.assign(t, clean);
        }
        return;
      }
      const { error } = await supabase.rpc('update_track_page', { p_track_id: trackId, p_data: input });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

/** Envoie l'image du tracé (bucket public track-layouts) et renvoie son adresse. */
export async function uploadTrackLayout(trackId: string, uri: string, width: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (width > 2000) context.resize({ width: 2000 });
  const image = await context.renderAsync();
  // PNG : garde la transparence des plans de piste.
  const saved = await image.saveAsync({ format: SaveFormat.PNG });
  if (isDemoMode) return saved.uri;
  const bytes = await (await fetch(saved.uri)).arrayBuffer();
  const path = `${trackId}/${Date.now()}.png`;
  const { error } = await supabase.storage.from('track-layouts').upload(path, bytes, { contentType: 'image/png' });
  if (error) throw error;
  return supabase.storage.from('track-layouts').getPublicUrl(path).data.publicUrl;
}

// ---------- Signalements ----------

export function useAdminReports(status: ReportStatus, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-reports', status],
    enabled,
    queryFn: async (): Promise<AdminReport[]> => {
      if (isDemoMode) return demoAdmin.reports.filter((r) => r.status === status);
      const { data, error } = await supabase.rpc('admin_reports', { p_status: status });
      if (error) throw socialError(error);
      return data as AdminReport[];
    },
  });
}

export function useResolveReport() {
  const invalidate = useInvalidate('admin-reports');
  return useMutation({
    mutationFn: async ({ reportId, status, hide }: { reportId: string; status: 'reviewed' | 'dismissed'; hide?: boolean }) => {
      if (isDemoMode) {
        const r = demoAdmin.reports.find((x) => x.id === reportId);
        if (r) {
          r.status = status;
          if (hide !== undefined) {
            r.message_hidden = !!r.message_id && hide;
            r.photo_hidden = !!r.photo_id && hide;
          }
        }
        return;
      }
      const { error } = await supabase.rpc('resolve_report', { p_report_id: reportId, p_status: status, p_hide: hide ?? null });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export const trackPhotoUrl = (path: string) => supabase.storage.from('track-photos').getPublicUrl(path).data.publicUrl;
