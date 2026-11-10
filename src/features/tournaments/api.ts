import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '@/features/auth/auth-provider';
import { tournamentError } from '@/features/tournaments/errors';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { RaceFormat, Tournament, TournamentInvite, TournamentSize } from '@/types/models';

const TOURNAMENT_SELECT = `
  id, organizer_id, name, size, format, starts_at, message, status, champion_id, runner_up_id,
  created_at, started_at, completed_at, banner_url, is_private, prize, is_official, auto_start, min_elo, max_elo,
  track:tracks (id, name, city, cover_url),
  entries:tournament_entries (pilot_id, seed, joined_at, pilot:profiles (id, username, avatar_url, elo, rank)),
  waitlist:tournament_waitlist (pilot_id, joined_at, pilot:profiles (id, username, avatar_url, elo, rank)),
  matches:tournament_matches (
    id, round, slot, pilot_a, pilot_b, challenge_id, winner_id, outcome, decided_at,
    a_position, b_position, a_best_lap_ms, b_best_lap_ms
  )
`;

const DEMO_ERROR = 'Mode démo : les tournois sont disponibles avec un vrai compte.';

/** Les tournois officiels d'abord, puis l'ordre reçu. */
const officialFirst = (list: Tournament[]) => [...list].sort((a, b) => Number(b.is_official) - Number(a.is_official));

/** Inscrits rangés par tête de série (puis ordre d'inscription tant que le tableau n'est pas tiré). */
const sortEntries = (t: Tournament): Tournament => ({
  ...t,
  entries: [...t.entries].sort(
    (a, b) => (a.seed ?? 99) - (b.seed ?? 99) || a.joined_at.localeCompare(b.joined_at),
  ),
  waitlist: [...(t.waitlist ?? [])].sort((a, b) => a.joined_at.localeCompare(b.joined_at)),
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
        .limit(60);
      if (error) throw error;
      return officialFirst((data as unknown as Tournament[]).map(sortEntries));
    },
  });
}

/** Fiche circuit : tournois à venir ou en cours sur ce circuit (les privés seulement pour qui y a accès). */
export function useTrackTournaments(trackId: string | undefined) {
  return useQuery({
    queryKey: ['tournaments', 'track', trackId],
    enabled: !!trackId,
    queryFn: async (): Promise<Tournament[]> => {
      if (isDemoMode) return [];
      const { data, error } = await supabase
        .from('tournaments')
        .select(TOURNAMENT_SELECT)
        .eq('track_id', trackId!)
        .in('status', ['registration', 'running'])
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return officialFirst((data as unknown as Tournament[]).map(sortEntries));
    },
  });
}

/** Tournois où le pilote connecté est inscrit, ou qu'il organise (hors annulés). */
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
      // Un karting organise son tournoi officiel sans forcément y rouler.
      const { data: organized, error: organizedError } = await supabase
        .from('tournaments')
        .select('id')
        .eq('organizer_id', userId!)
        .order('created_at', { ascending: false })
        .limit(30);
      if (organizedError) throw organizedError;
      const { data: waiting, error: waitingError } = await supabase
        .from('tournament_waitlist')
        .select('tournament_id')
        .eq('pilot_id', userId!);
      if (waitingError) throw waitingError;
      const ids = [
        ...new Set([...mine, ...waiting].map((e) => e.tournament_id).concat(organized.map((t) => t.id))),
      ];
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('tournaments')
        .select(TOURNAMENT_SELECT)
        .in('id', ids)
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
    // Tableau en direct : les résultats des autres duels arrivent sans tirer pour rafraîchir.
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 30_000 : false),
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

// ---------- Bannière ----------

/** Format de la bannière : large, comme un en-tête. */
const BANNER = { width: 1280, height: 640 };

/** Ouvre la galerie, recadrage 2:1. Renvoie l'URI locale, ou null si annulé. */
export async function pickBanner(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Autorise l’accès à tes photos pour choisir une bannière.');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [2, 1],
    quality: 0.8,
  });
  return result.canceled ? null : result.assets[0].uri;
}

/** Redimensionne en JPEG léger et envoie dans tournament-banners/<mon id>/<id du tournoi>.jpg. */
async function uploadBanner(userId: string, tournamentId: string, localUri: string): Promise<string> {
  const context = ImageManipulator.manipulate(localUri);
  context.resize({ width: BANNER.width });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  const blob = await (await fetch(saved.uri)).arrayBuffer();
  const path = `${userId}/${tournamentId}.jpg`;
  const { error } = await supabase.storage.from('tournament-banners').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('tournament-banners').getPublicUrl(path);
  // Même chemin à chaque envoi : le paramètre de version force le rafraîchissement des caches.
  return `${data.publicUrl}?v=${Date.now()}`;
}

export type TournamentEdit = {
  id: string;
  name?: string;
  startsAt?: string | null;
  message?: string | null;
  /** URI locale d'une nouvelle bannière, ou null pour la retirer ; absent = inchangée. */
  bannerUri?: string | null;
  /** Modifiable tant que les inscriptions sont ouvertes. */
  isPrivate?: boolean;
  prize?: string | null;
  /** Modifiable tant que les inscriptions sont ouvertes. */
  autoStart?: boolean;
};

/** Modification par l'organisateur : seuls les champs fournis changent. */
export function useUpdateTournament() {
  const { userId } = useAuth();
  const invalidate = useInvalidateTournaments();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (edit: TournamentEdit) => {
      if (isDemoMode) throw new Error(DEMO_ERROR);
      const data: Record<string, string | boolean> = {};
      if (edit.isPrivate !== undefined) data.is_private = edit.isPrivate;
      if (edit.prize !== undefined) data.prize = edit.prize ?? '';
      if (edit.autoStart !== undefined) data.auto_start = edit.autoStart;
      if (edit.name !== undefined) data.name = edit.name;
      if (edit.startsAt !== undefined) data.starts_at = edit.startsAt ?? '';
      if (edit.message !== undefined) data.message = edit.message ?? '';
      if (edit.bannerUri !== undefined) {
        data.banner_url = edit.bannerUri ? await uploadBanner(userId!, edit.id, edit.bannerUri) : '';
      }
      await rpc('update_tournament', { p_tournament_id: edit.id, p_data: data });
    },
    // Le nom et la bannière s'affichent aussi dans la liste de la Radio.
    onSuccess: () => Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: ['conversations'] })]),
  });
}

// ---------- Discussion ----------

/** Conversation Radio du tournoi : null tant que le pilote n'est pas inscrit (seuls les inscrits la lisent). */
export function useTournamentConversation(tournamentId: string | undefined, registered: boolean) {
  return useQuery({
    queryKey: ['tournaments', 'conversation', tournamentId, registered],
    enabled: !!tournamentId && registered && !isDemoMode,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.from('conversations').select('id').eq('tournament_id', tournamentId!).maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });
}

export type NewTournament = {
  trackId: string;
  name: string;
  size: TournamentSize;
  format: RaceFormat;
  startsAt: string | null;
  message: string | null;
  isPrivate: boolean;
  prize: string | null;
  /** Tournoi officiel du karting (réservé aux admins de la fiche circuit). */
  isOfficial: boolean;
  /** Tournoi officiel : l'organisateur roule-t-il aussi ? (toujours inscrit sinon) */
  participate: boolean;
  autoStart: boolean;
  minElo: number | null;
  maxElo: number | null;
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
        p_is_private: input.isPrivate,
        p_prize: input.prize,
        p_is_official: input.isOfficial,
        p_participate: input.participate,
        p_auto_start: input.autoStart,
        p_min_elo: input.minElo,
        p_max_elo: input.maxElo,
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

// ---------- Invitations ----------

/** Tournois où je suis invité et n'ai pas encore répondu, avec le pilote qui m'invite. */
export function useMyTournamentInvites() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['tournaments', 'my-invites', userId],
    enabled: !!userId,
    queryFn: async (): Promise<(Tournament & { invited_by_name: string | null })[]> => {
      if (isDemoMode) return [];
      const { data: invites, error: invitesError } = await supabase
        .from('tournament_invites')
        .select('tournament_id, inviter:profiles!tournament_invites_invited_by_fkey (username)')
        .eq('pilot_id', userId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (invitesError) throw invitesError;
      if (invites.length === 0) return [];
      const inviter = new Map(
        (invites as unknown as { tournament_id: string; inviter: { username: string } | null }[]).map((i) => [
          i.tournament_id,
          i.inviter?.username ?? null,
        ]),
      );
      const { data, error } = await supabase
        .from('tournaments')
        .select(TOURNAMENT_SELECT)
        .in('id', [...inviter.keys()])
        .eq('status', 'registration');
      if (error) throw error;
      return (data as unknown as Tournament[]).map((t) => ({ ...sortEntries(t), invited_by_name: inviter.get(t.id) ?? null }));
    },
  });
}

/** Invitations d'un tournoi visibles par moi : la mienne, celles que j'ai envoyées, toutes si je l'organise. */
export function useTournamentInvites(tournamentId: string | undefined) {
  return useQuery({
    queryKey: ['tournaments', 'invites', tournamentId],
    enabled: !!tournamentId && !isDemoMode,
    queryFn: async (): Promise<TournamentInvite[]> => {
      const { data, error } = await supabase
        .from('tournament_invites')
        .select(
          `pilot_id, invited_by, status, created_at,
           pilot:profiles!tournament_invites_pilot_id_fkey (id, username, avatar_url, elo, rank),
           inviter:profiles!tournament_invites_invited_by_fkey (username)`,
        )
        .eq('tournament_id', tournamentId!)
        .order('created_at');
      if (error) throw error;
      return data as unknown as TournamentInvite[];
    },
  });
}

/** Invite des pilotes ; renvoie le nombre d'invitations réellement envoyées (ni inscrits, ni déjà invités). */
export function useInviteToTournament() {
  const invalidate = useInvalidateTournaments();
  return useMutation({
    mutationFn: async ({ tournamentId, pilotIds }: { tournamentId: string; pilotIds: string[] }): Promise<number> =>
      rpc('invite_to_tournament', { p_tournament_id: tournamentId, p_pilot_ids: pilotIds }),
    onSuccess: invalidate,
  });
}

export const useDeclineTournamentInvite = () => useTournamentAction('decline_tournament_invite');

export function useRevokeTournamentInvite() {
  const invalidate = useInvalidateTournaments();
  return useMutation({
    mutationFn: async ({ tournamentId, pilotId }: { tournamentId: string; pilotId: string }) => {
      await rpc('revoke_tournament_invite', { p_tournament_id: tournamentId, p_pilot_id: pilotId });
    },
    onSuccess: invalidate,
  });
}
