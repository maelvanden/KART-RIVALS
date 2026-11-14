import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { demoPilots } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { tournamentError } from '@/features/tournaments/errors';
import { demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { RankTier } from '@/types/models';

export type TournamentFilter = 'watch' | 'registration' | 'running' | 'done';
export type TournamentStatus = 'registration' | 'running' | 'completed' | 'cancelled';

export type AdminTournamentRow = {
  id: string;
  name: string;
  status: TournamentStatus;
  track_id: string;
  track_name: string;
  track_city: string;
  organizer_id: string;
  organizer: string | null;
  size: number;
  entries: number;
  waitlist: number;
  is_official: boolean;
  is_private: boolean;
  on_site: boolean;
  created_at: string;
  starts_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  champion: string | null;
  /** Duels à jouer en ce moment. */
  playing: number;
  /** Duels bloqués : délai dépassé de plus de 3 jours, ou sans délai et en attente depuis plus de 21 jours. */
  stuck: number;
  disputed: number;
  stuck_since: string | null;
};

export type AdminTournamentPilot = {
  id: string;
  username: string;
  avatar_url: string | null;
  elo: number;
  rank: RankTier;
  seed?: number | null;
  joined_at: string;
  /** Compte suspendu ou banni. */
  restricted?: boolean;
};

export type AdminTournamentDuel = {
  id: string;
  label: string;
  challenge_id: string;
  a: { id: string; username: string };
  b: { id: string; username: string };
  deadline_at: string | null;
  opened_at: string;
  stuck_since: string | null;
  disputed: boolean;
  /** Un résultat saisi attend sa validation : pas de forfait possible tant qu'il n'est pas tranché. */
  awaiting: boolean;
};

export type AdminTournamentAction = {
  id: number;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  admin: string | null;
  pilot: string | null;
};

export type AdminTournamentDetail = {
  id: string;
  name: string;
  status: TournamentStatus;
  size: number;
  format: 'position' | 'lap_time';
  track_id: string;
  track_name: string;
  organizer_id: string;
  organizer: string | null;
  is_official: boolean;
  is_private: boolean;
  on_site: boolean;
  prize: string | null;
  created_at: string;
  starts_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  registration_closes_at: string | null;
  champion: string | null;
  entries: AdminTournamentPilot[];
  waitlist: AdminTournamentPilot[];
  duels: AdminTournamentDuel[];
  actions: AdminTournamentAction[];
};

export const TOURNAMENT_STATUS: Record<TournamentStatus, string> = {
  registration: 'Inscriptions',
  running: 'En cours',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

// ---------- Mode démo ----------

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const pilot = (p: (typeof demoPilots)[keyof typeof demoPilots], seed: number | null, days: number): AdminTournamentPilot => ({
  ...p,
  seed,
  joined_at: ago(days),
  restricted: false,
});

const demoTournaments: AdminTournamentDetail[] = [
  {
    id: 'tr-1',
    name: 'Open d’automne',
    status: 'running',
    size: 4,
    format: 'position',
    track_id: 't2',
    track_name: 'SpeedPark Angers',
    organizer_id: 'p3',
    organizer: demoPilots.p3.username,
    is_official: false,
    is_private: false,
    on_site: false,
    prize: null,
    created_at: ago(20),
    starts_at: null,
    started_at: ago(12),
    completed_at: null,
    registration_closes_at: null,
    champion: null,
    entries: [pilot(demoPilots.p3, 1, 20), pilot(demoPilots.p1, 2, 19), pilot(demoPilots.p2, 3, 18), pilot(demoPilots.p4, 4, 15)],
    waitlist: [],
    duels: [
      {
        id: 'du-1',
        label: 'Demi-finale',
        challenge_id: 'ch-1',
        a: { id: 'p3', username: demoPilots.p3.username },
        b: { id: 'p4', username: demoPilots.p4.username },
        deadline_at: ago(5),
        opened_at: ago(12),
        stuck_since: ago(2),
        disputed: false,
        awaiting: false,
      },
      {
        id: 'du-2',
        label: 'Demi-finale',
        challenge_id: 'ch-2',
        a: { id: 'p1', username: demoPilots.p1.username },
        b: { id: 'p2', username: demoPilots.p2.username },
        deadline_at: ago(5),
        opened_at: ago(12),
        stuck_since: null,
        disputed: true,
        awaiting: false,
      },
    ],
    actions: [],
  },
  {
    id: 'tr-2',
    name: 'Trophée SpeedPark',
    status: 'registration',
    size: 8,
    format: 'lap_time',
    track_id: 't2',
    track_name: 'SpeedPark Angers',
    organizer_id: 'p1',
    organizer: demoPilots.p1.username,
    is_official: true,
    is_private: false,
    on_site: true,
    prize: 'Une session offerte',
    created_at: ago(4),
    starts_at: new Date(Date.now() + 9 * 86_400_000).toISOString(),
    started_at: null,
    completed_at: null,
    registration_closes_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    champion: null,
    entries: [pilot(demoPilots.p1, null, 4), pilot(demoPilots.p2, null, 3), pilot(demoPilots.p4, null, 1)],
    waitlist: [],
    actions: [],
    duels: [],
  },
  {
    id: 'tr-3',
    name: 'Coupe des coéquipiers',
    status: 'completed',
    size: 4,
    format: 'position',
    track_id: 't3',
    track_name: 'Inwall Kart',
    organizer_id: 'p2',
    organizer: demoPilots.p2.username,
    is_official: false,
    is_private: true,
    on_site: false,
    prize: null,
    created_at: ago(50),
    starts_at: null,
    started_at: ago(45),
    completed_at: ago(30),
    registration_closes_at: null,
    champion: demoPilots.p3.username,
    entries: [pilot(demoPilots.p3, 1, 50), pilot(demoPilots.p2, 2, 50), pilot(demoPilots.p1, 3, 49), pilot(demoPilots.p4, 4, 48)],
    waitlist: [],
    duels: [],
    actions: [],
  },
];

const demoCity: Record<string, string> = { t2: 'Beaucouzé', t3: 'Les Ponts-de-Cé' };

const toRow = (t: AdminTournamentDetail): AdminTournamentRow => {
  const stuck = t.duels.filter((d) => d.stuck_since);
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    track_id: t.track_id,
    track_name: t.track_name,
    track_city: demoCity[t.track_id] ?? '',
    organizer_id: t.organizer_id,
    organizer: t.organizer,
    size: t.size,
    entries: t.entries.length,
    waitlist: t.waitlist.length,
    is_official: t.is_official,
    is_private: t.is_private,
    on_site: t.on_site,
    created_at: t.created_at,
    starts_at: t.starts_at,
    started_at: t.started_at,
    completed_at: t.completed_at,
    champion: t.champion,
    playing: t.duels.length,
    stuck: stuck.length,
    disputed: t.duels.filter((d) => d.disputed).length,
    stuck_since: stuck.map((d) => d.stuck_since!).sort()[0] ?? null,
  };
};

const demoFind = (id: string) => {
  const t = demoTournaments.find((x) => x.id === id);
  if (!t) throw new Error('Tournoi introuvable.');
  return t;
};

const demoLog = (t: AdminTournamentDetail, action: string, pilotName: string | null, details: Record<string, unknown>) =>
  t.actions.unshift({
    id: Date.now(),
    action,
    details: { name: t.name, ...details },
    created_at: new Date().toISOString(),
    admin: demoProfile.username,
    pilot: pilotName,
  });

// ---------- Hooks ----------

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  // Les messages viennent soit des fonctions des tournois, soit des fonctions admin.
  if (error) throw socialError(tournamentError(error));
  return data as T;
}

export function useAdminTournaments(filter: TournamentFilter, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-tournaments', filter],
    enabled,
    queryFn: async (): Promise<AdminTournamentRow[]> => {
      if (isDemoMode) {
        return demoTournaments
          .map(toRow)
          .filter((t) =>
            filter === 'watch'
              ? t.status === 'running' && t.stuck + t.disputed > 0
              : filter === 'done'
                ? t.status === 'completed' || t.status === 'cancelled'
                : t.status === filter,
          );
      }
      return rpc<AdminTournamentRow[]>('admin_tournaments', { p_filter: filter });
    },
  });
}

export function useAdminTournament(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-tournament', id],
    enabled: !!id && enabled,
    queryFn: async (): Promise<AdminTournamentDetail> => {
      if (isDemoMode) {
        const t = demoFind(id!);
        return { ...t, entries: [...t.entries], waitlist: [...t.waitlist], duels: [...t.duels], actions: [...t.actions] };
      }
      return rpc<AdminTournamentDetail>('admin_tournament_detail', { p_tournament_id: id });
    },
  });
}

function useInvalidateTournaments() {
  const queryClient = useQueryClient();
  return () =>
    ['admin-tournaments', 'admin-tournament', 'admin-actions', 'admin-disputes', 'tournaments', 'tournament'].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    );
}

export function useAdminCancelTournament() {
  const invalidate = useInvalidateTournaments();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      if (isDemoMode) {
        const t = demoFind(id);
        if (t.status === 'completed' || t.status === 'cancelled') throw new Error('Ce tournoi est terminé.');
        t.status = 'cancelled';
        t.duels = [];
        demoLog(t, 'cancel_tournament', t.organizer, { reason: reason?.trim() || undefined });
        return;
      }
      await rpc('admin_cancel_tournament', { p_tournament_id: id, p_reason: reason?.trim() || null });
    },
    onSuccess: invalidate,
  });
}

export function useAdminRemoveTournamentPilot() {
  const invalidate = useInvalidateTournaments();
  return useMutation({
    mutationFn: async ({ id, pilotId, reason }: { id: string; pilotId: string; reason?: string }) => {
      if (isDemoMode) {
        const t = demoFind(id);
        if (t.status !== 'registration') throw new Error('Les inscriptions sont closes.');
        if (t.organizer_id === pilotId && !t.is_official) throw new Error('L’organisateur ne peut pas se désinscrire : annule le tournoi.');
        const removed = [...t.entries, ...t.waitlist].find((p) => p.id === pilotId);
        const wasEntry = t.entries.some((p) => p.id === pilotId);
        t.entries = t.entries.filter((p) => p.id !== pilotId);
        t.waitlist = t.waitlist.filter((p) => p.id !== pilotId);
        if (wasEntry && t.waitlist.length > 0) t.entries.push(t.waitlist.shift()!);
        demoLog(t, 'remove_tournament_pilot', removed?.username ?? null, { reason: reason?.trim() || undefined });
        return;
      }
      await rpc('admin_remove_tournament_pilot', { p_tournament_id: id, p_pilot_id: pilotId, p_reason: reason?.trim() || null });
    },
    onSuccess: invalidate,
  });
}

export function useAdminTournamentWalkover() {
  const invalidate = useInvalidateTournaments();
  return useMutation({
    mutationFn: async ({ tournamentId, matchId, winnerId, reason }: { tournamentId: string; matchId: string; winnerId: string; reason?: string }) => {
      if (isDemoMode) {
        const t = demoFind(tournamentId);
        const d = t.duels.find((x) => x.id === matchId);
        if (!d) throw new Error('Ce duel n’est pas en cours.');
        const [winner, loser] = d.a.id === winnerId ? [d.a, d.b] : [d.b, d.a];
        t.duels = t.duels.filter((x) => x.id !== matchId);
        demoLog(t, 'tournament_walkover', loser.username, { winner: winner.username, label: d.label, reason: reason?.trim() || undefined });
        return;
      }
      await rpc('admin_tournament_walkover', { p_match_id: matchId, p_winner_id: winnerId, p_reason: reason?.trim() || null });
    },
    onSuccess: invalidate,
  });
}

export function useAdminSetTournamentOfficial() {
  const invalidate = useInvalidateTournaments();
  return useMutation({
    mutationFn: async ({ id, official }: { id: string; official: boolean }) => {
      if (isDemoMode) {
        const t = demoFind(id);
        if (t.status !== 'registration') throw new Error('Les inscriptions sont closes.');
        if (official && t.is_private) throw new Error('Un tournoi officiel est forcément public.');
        t.is_official = official;
        demoLog(t, official ? 'tournament_official' : 'tournament_unofficial', t.organizer, {});
        return;
      }
      await rpc('admin_set_tournament_official', { p_tournament_id: id, p_official: official });
    },
    onSuccess: invalidate,
  });
}
