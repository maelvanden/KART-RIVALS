import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { demoChallenges, demoEloHistory, demoNearby, demoProfile, demoTracks, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { Challenge, Match, RaceFormat } from '@/types/models';

const CHALLENGE_SELECT = `
  id, challenger_id, opponent_id, status, format, scheduled_at, message, created_at,
  challenger:profiles!challenges_challenger_id_fkey (id, username, elo, rank),
  opponent:profiles!challenges_opponent_id_fkey (id, username, elo, rank),
  track:tracks (id, name, city),
  match:matches (
    id, submitted_by, status, winner_id, challenger_position, opponent_position,
    challenger_best_lap_ms, opponent_best_lap_ms, challenger_confirmed_at, opponent_confirmed_at, dispute_reason
  )
`;

type ChallengeRow = Omit<Challenge, 'match'> & { match: Match | Match[] | null };

/** La relation 1-1 matches → challenges peut revenir en objet ou en tableau selon PostgREST. */
const normalize = (row: ChallengeRow): Challenge => ({
  ...row,
  match: Array.isArray(row.match) ? (row.match[0] ?? null) : row.match,
});

export function useMyChallenges() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['challenges', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Challenge[]> => {
      if (isDemoMode) return demoChallenges.filter((c) => c.status === 'pending' || c.status === 'accepted');
      const { data, error } = await supabase
        .from('challenges')
        .select(CHALLENGE_SELECT)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as ChallengeRow[]).map(normalize);
    },
  });
}

export function useChallenge(id: string | undefined) {
  return useQuery({
    queryKey: ['challenge', id],
    enabled: !!id,
    queryFn: async (): Promise<Challenge | null> => {
      if (isDemoMode) return demoChallenges.find((c) => c.id === id) ?? null;
      const { data, error } = await supabase.from('challenges').select(CHALLENGE_SELECT).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data ? normalize(data as unknown as ChallengeRow) : null;
    },
  });
}

/** Après toute action sur un défi : listes, détail, et profil (l'ELO peut avoir changé). */
function useInvalidateChallenges() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['challenges'] }),
      queryClient.invalidateQueries({ queryKey: ['challenge'] }),
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
      queryClient.invalidateQueries({ queryKey: ['elo-history'] }),
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
    ]);
}

export type NewChallenge = {
  opponentId: string;
  trackId: string;
  scheduledAt: string | null;
  format: RaceFormat;
  message: string | null;
};

export function useCreateChallenge() {
  const invalidate = useInvalidateChallenges();
  return useMutation({
    mutationFn: async (input: NewChallenge): Promise<string> => {
      if (isDemoMode) return demoCreate(input);
      const { data, error } = await supabase
        .from('challenges')
        .insert({
          opponent_id: input.opponentId,
          track_id: input.trackId,
          scheduled_at: input.scheduledAt,
          format: input.format,
          message: input.message,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: invalidate,
  });
}

export function useRespondChallenge() {
  const invalidate = useInvalidateChallenges();
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      if (isDemoMode) return demoUpdate(id, (c) => ({ ...c, status: accept ? 'accepted' : 'declined' }));
      const { error } = await supabase.rpc('respond_challenge', { p_challenge_id: id, p_accept: accept });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCancelChallenge() {
  const invalidate = useInvalidateChallenges();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) return demoUpdate(id, (c) => ({ ...c, status: 'cancelled' }));
      const { error } = await supabase.rpc('cancel_challenge', { p_challenge_id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type ResultInput =
  | { format: 'position'; challengerPosition: number; opponentPosition: number }
  | { format: 'lap_time'; challengerLapMs: number; opponentLapMs: number };

export function useSubmitResult() {
  const invalidate = useInvalidateChallenges();
  return useMutation({
    mutationFn: async ({ challengeId, result }: { challengeId: string; result: ResultInput }) => {
      if (isDemoMode) return demoSubmit(challengeId, result);
      const { error } = await supabase.rpc('submit_match_result', {
        p_challenge_id: challengeId,
        p_challenger_position: result.format === 'position' ? result.challengerPosition : null,
        p_opponent_position: result.format === 'position' ? result.opponentPosition : null,
        p_challenger_best_lap_ms: result.format === 'lap_time' ? result.challengerLapMs : null,
        p_opponent_best_lap_ms: result.format === 'lap_time' ? result.opponentLapMs : null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useConfirmMatch() {
  const invalidate = useInvalidateChallenges();
  return useMutation({
    mutationFn: async (matchId: string) => {
      if (isDemoMode) return demoConfirm(matchId);
      const { error } = await supabase.rpc('confirm_match', { p_match_id: matchId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDisputeMatch() {
  const invalidate = useInvalidateChallenges();
  return useMutation({
    mutationFn: async ({ matchId, reason }: { matchId: string; reason: string | null }) => {
      if (isDemoMode) {
        return demoUpdateMatch(matchId, (m) => ({
          ...m,
          status: 'disputed',
          dispute_reason: reason,
          challenger_confirmed_at: null,
          opponent_confirmed_at: null,
        }));
      }
      const { error } = await supabase.rpc('dispute_match', { p_match_id: matchId, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Points ELO gagnés ou perdus par le pilote connecté sur ce match (null tant qu'il n'est pas validé). */
export function useMatchEloDelta(matchId: string | undefined, enabled: boolean) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['elo-history', 'match', matchId, userId],
    enabled: enabled && !!matchId && !!userId,
    queryFn: async (): Promise<number | null> => {
      if (isDemoMode) return demoEloHistory.find((p) => p.match_id === matchId)?.delta ?? null;
      const { data, error } = await supabase
        .from('elo_history')
        .select('delta')
        .eq('match_id', matchId!)
        .eq('profile_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data?.delta ?? null;
    },
  });
}

// ---------- Mode démo : mêmes règles que les fonctions SQL, appliquées en mémoire ----------

function demoUpdate(id: string, update: (c: Challenge) => Challenge) {
  const i = demoChallenges.findIndex((c) => c.id === id);
  if (i >= 0) demoChallenges[i] = update(demoChallenges[i]);
}

function demoUpdateMatch(matchId: string, update: (m: Match) => Match) {
  const c = demoChallenges.find((x) => x.match?.id === matchId);
  if (c?.match) demoUpdate(c.id, (x) => ({ ...x, match: update(x.match!) }));
}

function demoCreate(input: NewChallenge): string {
  const rival = demoNearby.find((p) => p.id === input.opponentId);
  const id = `demo-${Date.now()}`;
  demoChallenges.unshift({
    id,
    challenger_id: demoProfile.id,
    opponent_id: input.opponentId,
    status: 'pending',
    format: input.format,
    scheduled_at: input.scheduledAt,
    message: input.message,
    created_at: new Date().toISOString(),
    challenger: { id: demoProfile.id, username: demoProfile.username, elo: demoProfile.elo, rank: demoProfile.rank },
    opponent: { id: input.opponentId, username: rival?.username ?? 'Pilote', elo: rival?.elo ?? 1000, rank: rival?.rank ?? 'novice' },
    track: demoTracks.find((t) => t.id === input.trackId) ?? demoTracks[0],
    match: null,
  });
  return id;
}

function demoSubmit(challengeId: string, result: ResultInput) {
  demoUpdate(challengeId, (c) => {
    const [a, b] =
      result.format === 'position'
        ? [result.challengerPosition, result.opponentPosition]
        : [result.challengerLapMs, result.opponentLapMs];
    const now = new Date().toISOString();
    const iAmChallenger = c.challenger_id === demoProfile.id;
    return {
      ...c,
      match: {
        id: c.match?.id ?? `m-${challengeId}`,
        submitted_by: demoProfile.id,
        status: 'awaiting_confirmation',
        winner_id: a < b ? c.challenger_id : b < a ? c.opponent_id : null,
        challenger_position: result.format === 'position' ? result.challengerPosition : null,
        opponent_position: result.format === 'position' ? result.opponentPosition : null,
        challenger_best_lap_ms: result.format === 'lap_time' ? result.challengerLapMs : null,
        opponent_best_lap_ms: result.format === 'lap_time' ? result.opponentLapMs : null,
        challenger_confirmed_at: iAmChallenger ? now : null,
        opponent_confirmed_at: iAmChallenger ? null : now,
        dispute_reason: null,
      },
    };
  });
}

function demoConfirm(matchId: string) {
  const c = demoChallenges.find((x) => x.match?.id === matchId);
  if (!c?.match) return;
  const now = new Date().toISOString();
  const iAmChallenger = c.challenger_id === demoProfile.id;
  const rival = iAmChallenger ? c.opponent : c.challenger;
  // Même formule que confirm_match() : K = 40 pendant les 10 premiers matchs, 24 ensuite, 16 dès 1850.
  const expected = 1 / (1 + 10 ** ((rival.elo - demoProfile.elo) / 400));
  const score = c.match.winner_id === demoProfile.id ? 1 : c.match.winner_id === null ? 0.5 : 0;
  const k = demoProfile.matches_played < 10 ? 40 : demoProfile.elo >= 1850 ? 16 : 24;
  const delta = Math.round(k * (score - expected));
  demoProfile.elo += delta;
  if (score === 1) demoProfile.wins += 1;
  else if (score === 0) demoProfile.losses += 1;
  else demoProfile.draws += 1;
  demoProfile.matches_played += 1;
  demoEloHistory.push({ delta, elo_after: demoProfile.elo, created_at: now, match_id: matchId });
  demoUpdate(c.id, (x) => ({
    ...x,
    status: 'completed',
    match: {
      ...x.match!,
      status: 'confirmed',
      challenger_confirmed_at: x.match!.challenger_confirmed_at ?? now,
      opponent_confirmed_at: x.match!.opponent_confirmed_at ?? now,
    },
  }));
}
