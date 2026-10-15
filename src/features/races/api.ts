import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { acceptedEntries, confirmationsNeeded } from '@/features/races/state';
import { demoEloHistory, demoPilot, demoProfile, demoRaces, demoTracks, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { Race, RaceFormat } from '@/types/models';

const RACE_SELECT = `
  id, organizer_id, scheduled_at, format, message, status, submitted_at, confirmed_at, dispute_reason, created_at,
  track:tracks (id, name, city),
  entries:race_entries (
    pilot_id, status, position, best_lap_ms, confirmed_at,
    pilot:profiles (id, username, avatar_url, elo, rank)
  )
`;

/** Copie profonde en démo : les objets sont modifiés en place, React Query doit voir un changement. */
const copy = (r: Race): Race => JSON.parse(JSON.stringify(r));

const sortEntries = (r: Race): Race => ({
  ...r,
  entries: [...r.entries].sort(
    (a, b) => (a.position ?? 99) - (b.position ?? 99) || a.pilot.username.localeCompare(b.pilot.username),
  ),
});

/** Courses en cours (et validées récemment) où le pilote est inscrit ou invité. */
export function useMyRaces() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['races', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Race[]> => {
      if (isDemoMode) return demoRaces.filter((r) => r.status !== 'cancelled').map((r) => sortEntries(copy(r)));
      const { data, error } = await supabase
        .from('races')
        .select(RACE_SELECT)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data as unknown as Race[]).map(sortEntries);
    },
  });
}

export function useRace(id: string | undefined) {
  return useQuery({
    queryKey: ['races', 'detail', id],
    enabled: !!id,
    queryFn: async (): Promise<Race | null> => {
      if (isDemoMode) {
        const r = demoRaces.find((x) => x.id === id);
        return r ? sortEntries(copy(r)) : null;
      }
      const { data, error } = await supabase.from('races').select(RACE_SELECT).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data ? sortEntries(data as unknown as Race) : null;
    },
  });
}

/** Gain ou perte d'ELO de chaque participant une fois la course validée. */
export function useRaceEloDeltas(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['elo-history', 'race', id],
    enabled: enabled && !!id,
    queryFn: async (): Promise<Record<string, number>> => {
      if (isDemoMode) return demoRaceDeltas[id!] ?? {};
      const { data, error } = await supabase.from('elo_history').select('profile_id, delta').eq('race_id', id!);
      if (error) throw error;
      return Object.fromEntries(data.map((h) => [h.profile_id, h.delta]));
    },
  });
}

function useInvalidateRaces() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['races'] }),
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
      queryClient.invalidateQueries({ queryKey: ['elo-history'] }),
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
    ]);
}

export type NewRace = {
  trackId: string;
  invitees: string[];
  scheduledAt: string | null;
  format: RaceFormat;
  message: string | null;
};

export function useCreateRace() {
  const invalidate = useInvalidateRaces();
  return useMutation({
    mutationFn: async (input: NewRace): Promise<string> => {
      if (isDemoMode) return demoCreateRace(input);
      const { data, error } = await supabase.rpc('create_race', {
        p_track_id: input.trackId,
        p_invitees: input.invitees,
        p_scheduled_at: input.scheduledAt,
        p_format: input.format,
        p_message: input.message,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function useRespondRace() {
  const { userId } = useAuth();
  const invalidate = useInvalidateRaces();
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      if (isDemoMode) {
        const e = demoRaces.find((r) => r.id === id)?.entries.find((x) => x.pilot_id === userId);
        if (e) e.status = accept ? 'accepted' : 'declined';
        return;
      }
      const { error } = await supabase.rpc('respond_race', { p_race_id: id, p_accept: accept });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCancelRace() {
  const invalidate = useInvalidateRaces();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) {
        const r = demoRaces.find((x) => x.id === id);
        if (r) r.status = 'cancelled';
        return;
      }
      const { error } = await supabase.rpc('cancel_race', { p_race_id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type RaceResultInput = { pilot_id: string; position?: number; best_lap_ms?: number }[];

export function useSubmitRaceResult() {
  const { userId } = useAuth();
  const invalidate = useInvalidateRaces();
  return useMutation({
    mutationFn: async ({ id, results }: { id: string; results: RaceResultInput }) => {
      if (isDemoMode) return demoSubmit(id, results, userId!);
      const { error } = await supabase.rpc('submit_race_result', { p_race_id: id, p_results: results });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useConfirmRace() {
  const { userId } = useAuth();
  const invalidate = useInvalidateRaces();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) return demoConfirm(id, userId!);
      const { error } = await supabase.rpc('confirm_race', { p_race_id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDisputeRace() {
  const invalidate = useInvalidateRaces();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string | null }) => {
      if (isDemoMode) {
        const r = demoRaces.find((x) => x.id === id);
        if (r) {
          r.status = 'disputed';
          r.dispute_reason = reason;
          r.entries.forEach((e) => (e.confirmed_at = null));
        }
        return;
      }
      const { error } = await supabase.rpc('dispute_race', { p_race_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// ---------- Mode démo : mêmes règles que les fonctions SQL ----------

const demoRaceDeltas: Record<string, Record<string, number>> = {};

function demoCreateRace(input: NewRace): string {
  const id = `race-${Date.now()}`;
  const pilot = (pid: string) => {
    const p = demoPilot(pid);
    return { id: pid, username: p?.username ?? 'Pilote', avatar_url: p?.avatar_url ?? null, elo: p?.elo ?? 1000, rank: p?.rank ?? 'novice' };
  };
  demoRaces.unshift({
    id,
    organizer_id: demoProfile.id,
    scheduled_at: input.scheduledAt,
    format: input.format,
    message: input.message,
    status: 'open',
    submitted_at: null,
    confirmed_at: null,
    dispute_reason: null,
    created_at: new Date().toISOString(),
    track: demoTracks.find((t) => t.id === input.trackId) ?? demoTracks[0],
    entries: [demoProfile.id, ...input.invitees].map((pid) => ({
      pilot_id: pid,
      // En démo, les invités acceptent tout de suite pour pouvoir saisir le résultat.
      status: 'accepted' as const,
      position: null,
      best_lap_ms: null,
      confirmed_at: null,
      pilot: pilot(pid),
    })),
  });
  return id;
}

function demoSubmit(id: string, results: RaceResultInput, me: string) {
  const r = demoRaces.find((x) => x.id === id);
  if (!r) return;
  r.entries.forEach((e) => {
    if (e.status === 'invited') e.status = 'declined';
  });
  const laps = results.map((x) => x.best_lap_ms ?? 0);
  r.entries.forEach((e) => {
    const res = results.find((x) => x.pilot_id === e.pilot_id);
    if (!res || e.status !== 'accepted') return;
    e.best_lap_ms = res.best_lap_ms ?? null;
    e.position = r.format === 'lap_time' ? 1 + laps.filter((l) => l < (res.best_lap_ms ?? 0)).length : (res.position ?? null);
    e.confirmed_at = e.pilot_id === me ? new Date().toISOString() : null;
  });
  r.status = 'awaiting_confirmation';
  r.submitted_at = new Date().toISOString();
  r.dispute_reason = null;
  // En démo, les autres participants valident aussitôt : on voit le résultat et l'ELO tout de suite.
  demoConfirm(id, me);
}

function demoConfirm(id: string, me: string) {
  const r = demoRaces.find((x) => x.id === id);
  if (!r) return;
  const mine = r.entries.find((e) => e.pilot_id === me);
  if (mine) mine.confirmed_at = mine.confirmed_at ?? new Date().toISOString();
  // En démo, les autres pilotes valident aussi pour atteindre la majorité.
  const accepted = acceptedEntries(r);
  for (const e of accepted) {
    if (accepted.filter((x) => x.confirmed_at).length >= confirmationsNeeded(r)) break;
    e.confirmed_at = e.confirmed_at ?? new Date().toISOString();
  }
  // ELO multijoueur : chaque paire compte comme un mini-duel, pondéré par 1 / (n - 1).
  const n = accepted.length;
  const deltas: Record<string, number> = {};
  for (const e of accepted) {
    let sum = 0;
    for (const o of accepted) {
      if (o === e) continue;
      const score = e.position! < o.position! ? 1 : e.position === o.position ? 0.5 : 0;
      sum += score - 1 / (1 + 10 ** ((o.pilot.elo - e.pilot.elo) / 400));
    }
    deltas[e.pilot_id] = Math.round((24 * sum) / (n - 1));
  }
  demoRaceDeltas[id] = deltas;
  const myDelta = deltas[demoProfile.id];
  if (myDelta !== undefined) {
    demoProfile.elo += myDelta;
    demoProfile.race_count += 1;
    const pos = accepted.find((e) => e.pilot_id === demoProfile.id)?.position ?? 99;
    if (pos === 1) demoProfile.race_wins += 1;
    if (pos <= 3) demoProfile.race_podiums += 1;
    demoEloHistory.push({ delta: myDelta, elo_after: demoProfile.elo, created_at: new Date().toISOString() });
  }
  r.status = 'confirmed';
  r.confirmed_at = new Date().toISOString();
}
