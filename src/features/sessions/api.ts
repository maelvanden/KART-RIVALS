import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { demoPilots } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { demoProfile, demoTrackDetails, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { PilotSummary, RaceFormat } from '@/types/models';

export type SessionVisibility = 'public' | 'teammates';
export type SessionStatus = 'open' | 'started' | 'cancelled' | 'expired';

export type OpenSession = {
  id: string;
  host_id: string;
  track_id: string;
  starts_at: string;
  spots: number;
  format: RaceFormat;
  visibility: SessionVisibility;
  message: string | null;
  status: SessionStatus;
  race_id: string | null;
  challenge_id: string | null;
  created_at: string;
  track: { id: string; name: string; city: string; postal_code: string | null } | null;
  host: PilotSummary | null;
  participants: { profile_id: string; joined_at: string; pilot: PilotSummary | null }[];
};

export type NewSession = {
  trackId: string;
  startsAt: string;
  spots: number;
  format: RaceFormat;
  visibility: SessionVisibility;
  message: string;
};

const PILOT = 'id, username, avatar_url, elo, rank';
const COLUMNS = `id, host_id, track_id, starts_at, spots, format, visibility, message, status, race_id, challenge_id, created_at,
  track:tracks (id, name, city, postal_code),
  host:profiles!open_sessions_host_id_fkey (${PILOT}),
  participants:session_participants (profile_id, joined_at, pilot:profiles (${PILOT}))`;

export const placesLeft = (s: Pick<OpenSession, 'spots' | 'participants'>) => Math.max(0, s.spots - s.participants.length);

// ---------- Mode démo ----------
const at = (days: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const me = (): PilotSummary => ({
  id: demoProfile.id,
  username: demoProfile.username,
  avatar_url: demoProfile.avatar_url,
  elo: demoProfile.elo,
  rank: demoProfile.rank,
});
const demoTrack = (id: string) => {
  const t = demoTrackDetails.find((x) => x.id === id)!;
  return { id: t.id, name: t.name, city: t.city, postal_code: t.postal_code };
};
const demoPilot = (id: string) => (id === demoProfile.id ? me() : demoPilots[id]);
const joined = (ids: string[]) => ids.map((id, i) => ({ profile_id: id, joined_at: at(-1, 10 + i), pilot: demoPilot(id) }));
// Prochain samedi (ou dans 2 jours si on est déjà samedi).
const nextSaturday = (() => {
  const d = new Date();
  return ((6 - d.getDay() + 7) % 7) || 7;
})();
let demoSeq = 0;
const demoSessions: OpenSession[] = [
  {
    id: 'ss-1', host_id: 'p1', track_id: 't1', starts_at: at(nextSaturday, 14), spots: 5, format: 'position', visibility: 'public',
    message: 'Session chill, tous niveaux. On prend 3 séries et on finit au bar 🏁', status: 'open', race_id: null, challenge_id: null,
    created_at: at(-1, 9), track: demoTrack('t1'), host: demoPilots.p1, participants: joined(['p1', 'p3']),
  },
  {
    id: 'ss-2', host_id: 'p2', track_id: 't3', starts_at: at(2, 20), spots: 4, format: 'lap_time', visibility: 'public',
    message: 'Chasse au meilleur tour sur la grande piste, objectif sous les 39 s.', status: 'open', race_id: null, challenge_id: null,
    created_at: at(-1, 12), track: demoTrack('t3'), host: demoPilots.p2, participants: joined(['p2']),
  },
  {
    id: 'ss-3', host_id: 'p3', track_id: 't2', starts_at: at(5, 10), spots: 3, format: 'position', visibility: 'teammates',
    message: 'Entre coéquipiers, on s’entraîne pour le Grand Prix.', status: 'open', race_id: null, challenge_id: null,
    created_at: at(-1, 15), track: demoTrack('t2'), host: demoPilots.p3, participants: joined(['p3', 'p4']),
  },
];

// ---------- Lecture ----------

/** Sessions ouvertes à venir que je peux voir (publiques, ou de mes coéquipiers). */
export function useOpenSessions(trackId?: string) {
  return useQuery({
    queryKey: ['open-sessions', trackId ?? 'all'],
    queryFn: async (): Promise<OpenSession[]> => {
      if (isDemoMode) {
        const now = new Date().toISOString();
        return demoSessions
          .filter((s) => s.status === 'open' && s.starts_at > now && (!trackId || s.track_id === trackId))
          .map((s) => ({ ...s, participants: [...s.participants] }))
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      }
      let query = supabase
        .from('open_sessions')
        .select(COLUMNS)
        .eq('status', 'open')
        .gt('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(100);
      if (trackId) query = query.eq('track_id', trackId);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as OpenSession[];
    },
  });
}

/** Mes sessions (organisées ou rejointes), y compris celles déjà lancées en course. */
export function useMySessions() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['open-sessions', 'mine', userId],
    enabled: !!userId,
    queryFn: async (): Promise<OpenSession[]> => {
      const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
      if (isDemoMode) {
        return demoSessions
          .filter((s) => s.participants.some((p) => p.profile_id === demoProfile.id) && s.starts_at > since && s.status !== 'cancelled')
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      }
      const mine = await supabase.from('session_participants').select('session_id').eq('profile_id', userId!);
      if (mine.error) throw mine.error;
      const ids = mine.data.map((r) => r.session_id as string);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('open_sessions')
        .select(COLUMNS)
        .in('id', ids)
        .neq('status', 'cancelled')
        .gt('starts_at', since)
        .order('starts_at');
      if (error) throw error;
      return data as unknown as OpenSession[];
    },
  });
}

export function useOpenSession(id: string | undefined) {
  return useQuery({
    queryKey: ['open-sessions', 'one', id],
    enabled: !!id,
    queryFn: async (): Promise<OpenSession | null> => {
      if (isDemoMode) {
        const s = demoSessions.find((x) => x.id === id);
        return s ? { ...s, participants: [...s.participants] } : null;
      }
      const { data, error } = await supabase.from('open_sessions').select(COLUMNS).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as unknown as OpenSession | null;
    },
  });
}

// ---------- Actions ----------
function useInvalidateSessions() {
  const queryClient = useQueryClient();
  return () =>
    ['open-sessions', 'races', 'challenges'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
}

export function useCreateSession() {
  const invalidate = useInvalidateSessions();
  return useMutation({
    mutationFn: async (input: NewSession): Promise<string> => {
      if (isDemoMode) {
        const id = `ss-new-${++demoSeq}`;
        demoSessions.push({
          id, host_id: demoProfile.id, track_id: input.trackId, starts_at: input.startsAt, spots: input.spots,
          format: input.format, visibility: input.visibility, message: input.message.trim() || null, status: 'open',
          race_id: null, challenge_id: null, created_at: new Date().toISOString(), track: demoTrack(input.trackId),
          host: me(), participants: joined([demoProfile.id]),
        });
        return id;
      }
      const { data, error } = await supabase.rpc('create_open_session', {
        p_track_id: input.trackId,
        p_starts_at: input.startsAt,
        p_spots: input.spots,
        p_format: input.format,
        p_visibility: input.visibility,
        p_message: input.message.trim() || null,
      });
      if (error) throw socialError(error);
      return data as string;
    },
    onSuccess: invalidate,
  });
}

function demoFind(id: string) {
  const s = demoSessions.find((x) => x.id === id);
  if (!s) throw new Error('Session introuvable.');
  return s;
}

export function useJoinSession() {
  const invalidate = useInvalidateSessions();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) {
        const s = demoFind(id);
        if (placesLeft(s) === 0) throw new Error('La session est complète.');
        s.participants.push({ profile_id: demoProfile.id, joined_at: new Date().toISOString(), pilot: me() });
        return;
      }
      const { error } = await supabase.rpc('join_open_session', { p_id: id });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useLeaveSession() {
  const invalidate = useInvalidateSessions();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) {
        const s = demoFind(id);
        s.participants = s.participants.filter((p) => p.profile_id !== demoProfile.id);
        return;
      }
      const { error } = await supabase.rpc('leave_open_session', { p_id: id });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useCancelSession() {
  const invalidate = useInvalidateSessions();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) {
        demoFind(id).status = 'cancelled';
        return;
      }
      const { error } = await supabase.rpc('cancel_open_session', { p_id: id });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

/** Lance la session : course (3+ pilotes) ou défi accepté (2 pilotes). */
export function useStartSession() {
  const invalidate = useInvalidateSessions();
  return useMutation({
    mutationFn: async (id: string): Promise<{ kind: string; race_id: string | null; challenge_id: string | null }> => {
      if (isDemoMode) {
        const s = demoFind(id);
        if (s.participants.length < 2) throw new Error('Attends au moins un autre pilote.');
        s.status = 'started';
        // En démo, on renvoie vers une course / un défi d'exemple.
        if (s.participants.length >= 3) s.race_id = 'r1';
        else s.challenge_id = 'c2';
        return { kind: s.race_id ? 'race' : 'challenge', race_id: s.race_id, challenge_id: s.challenge_id };
      }
      const { data, error } = await supabase.rpc('start_open_session', { p_id: id });
      if (error) throw socialError(error);
      return data as { kind: string; race_id: string | null; challenge_id: string | null };
    },
    onSuccess: invalidate,
  });
}
