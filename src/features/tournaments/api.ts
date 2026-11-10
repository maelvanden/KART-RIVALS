import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { tournamentError } from '@/features/tournaments/errors';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { RaceFormat, Tournament, TournamentSize } from '@/types/models';

const TOURNAMENT_SELECT = `
  id, organizer_id, name, size, format, starts_at, message, status, champion_id, runner_up_id,
  created_at, started_at, completed_at,
  track:tracks (id, name, city),
  entries:tournament_entries (pilot_id, seed, joined_at, pilot:profiles (id, username, avatar_url, elo, rank)),
  matches:tournament_matches (id, round, slot, pilot_a, pilot_b, challenge_id, winner_id, outcome, decided_at)
`;

const DEMO_ERROR = 'Mode démo : les tournois sont disponibles avec un vrai compte.';

/** Inscrits rangés par tête de série (puis ordre d'inscription tant que le tableau n'est pas tiré). */
const sortEntries = (t: Tournament): Tournament => ({
  ...t,
  entries: [...t.entries].sort(
    (a, b) => (a.seed ?? 99) - (b.seed ?? 99) || a.joined_at.localeCompare(b.joined_at),
  ),
});

/** Tournois dont les inscriptions sont ouvertes, les plus récents d'abord. */
export function useOpenTournaments() {
  return useQuery({
    queryKey: ['tournaments', 'open'],
    queryFn: async (): Promise<Tournament[]> => {
      if (isDemoMode) return [];
      const { data, error } = await supabase
        .from('tournaments')
        .select(TOURNAMENT_SELECT)
        .eq('status', 'registration')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data as unknown as Tournament[]).map(sortEntries);
    },
  });
}

/** Tournois où le pilote connecté est inscrit (hors annulés). */
export function useMyTournaments() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['tournaments', 'mine', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Tournament[]> => {
      if (isDemoMode) return [];
      const { data: mine, error: idsError } = await supabase
        .from('tournament_entries')
        .select('tournament_id')
        .eq('pilot_id', userId!)
        .order('joined_at', { ascending: false })
        .limit(30);
      if (idsError) throw idsError;
      if (mine.length === 0) return [];
      const { data, error } = await supabase
        .from('tournaments')
        .select(TOURNAMENT_SELECT)
        .in('id', mine.map((e) => e.tournament_id))
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Tournament[]).map(sortEntries);
    },
  });
}

export function useTournament(id: string | undefined) {
  return useQuery({
    queryKey: ['tournaments', 'detail', id],
    enabled: !!id,
    queryFn: async (): Promise<Tournament | null> => {
      if (isDemoMode) return null;
      const { data, error } = await supabase.from('tournaments').select(TOURNAMENT_SELECT).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data ? sortEntries(data as unknown as Tournament) : null;
    },
  });
}

/** Case du tableau liée à un défi (écran du défi : abandon, lien vers le tableau). */
export function useTournamentMatchForChallenge(challengeId: string | undefined, tournamentId: string | null | undefined) {
  return useQuery({
    queryKey: ['tournaments', 'match', challengeId],
    enabled: !!challengeId && !!tournamentId && !isDemoMode,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournament_matches')
        .select('id, round, decided_at, tournament:tournaments (id, name, size, status)')
        .eq('challenge_id', challengeId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as {
        id: string;
        round: number;
        decided_at: string | null;
        tournament: { id: string; name: string; size: TournamentSize; status: Tournament['status'] };
      } | null;
    },
  });
}

export type Trophy = {
  id: string;
  name: string;
  size: TournamentSize;
  completed_at: string;
  track: { id: string; name: string; city: string };
  place: 'champion' | 'finalist';
};

/** Vitrine : tournois remportés et finales perdues du pilote. */
export function usePilotTrophies(pilotId: string | undefined) {
  return useQuery({
    queryKey: ['tournaments', 'trophies', pilotId],
    enabled: !!pilotId,
    queryFn: async (): Promise<Trophy[]> => {
      if (isDemoMode) return [];
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, size, completed_at, champion_id, track:tracks (id, name, city)')
        .eq('status', 'completed')
        .or(`champion_id.eq.${pilotId},runner_up_id.eq.${pilotId}`)
        .order('completed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as unknown as (Omit<Trophy, 'place'> & { champion_id: string | null })[]).map(
        ({ champion_id, ...t }) => ({ ...t, place: champion_id === pilotId ? 'champion' : 'finalist' }),
      );
    },
  });
}

function useInvalidateTournaments() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
      queryClient.invalidateQueries({ queryKey: ['challenges'] }),
      queryClient.invalidateQueries({ queryKey: ['challenge'] }),
    ]);
}

async function rpc(fn: string, args: Record<string, unknown>) {
  if (isDemoMode) throw new Error(DEMO_ERROR);
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw tournamentError(error);
  return data;
}

export type NewTournament = {
  trackId: string;
  name: string;
  size: TournamentSize;
  format: RaceFormat;
  startsAt: string | null;
  message: string | null;
};

export function useCreateTournament() {
  const invalidate = useInvalidateTournaments();
  return useMutation({
    mutationFn: async (input: NewTournament): Promise<string> =>
      rpc('create_tournament', {
        p_track_id: input.trackId,
        p_name: input.name,
        p_size: input.size,
        p_format: input.format,
        p_starts_at: input.startsAt,
        p_message: input.message,
      }),
    onSuccess: invalidate,
  });
}

/** Mutations sur un tournoi : inscription, désinscription, lancement, annulation. */
function useTournamentAction(fn: string) {
  const invalidate = useInvalidateTournaments();
  return useMutation({
    mutationFn: async (tournamentId: string) => {
      await rpc(fn, { p_tournament_id: tournamentId });
    },
    onSuccess: invalidate,
  });
}

export const useJoinTournament = () => useTournamentAction('join_tournament');
export const useLeaveTournament = () => useTournamentAction('leave_tournament');
export const useStartTournament = () => useTournamentAction('start_tournament');
export const useCancelTournament = () => useTournamentAction('cancel_tournament');

export function useForfeitTournamentMatch() {
  const invalidate = useInvalidateTournaments();
  return useMutation({
    mutationFn: async (matchId: string) => {
      await rpc('forfeit_tournament_match', { p_match_id: matchId });
    },
    onSuccess: invalidate,
  });
}

export function useAwardWalkover() {
  const invalidate = useInvalidateTournaments();
  return useMutation({
    mutationFn: async ({ matchId, winnerId }: { matchId: string; winnerId: string }) => {
      await rpc('award_tournament_walkover', { p_match_id: matchId, p_winner_id: winnerId });
    },
    onSuccess: invalidate,
  });
}
