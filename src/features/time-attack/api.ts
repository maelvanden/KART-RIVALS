import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '@/features/auth/auth-provider';
import { socialError } from '@/features/social/errors';
import { TicketRejectedError, type TicketRejection } from '@/features/time-attack/errors';
import { demoEloHistory, demoProfile, demoTracks, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { TimeAttackSession } from '@/types/models';

const SESSION_SELECT = `
  id, status, check_in_at, deadline_at, ticket_at, best_lap_ms, validated_at,
  rejection_count, last_rejection_code, last_rejected_ticket_at, dnf_at, elo_penalty,
  review_requested_at, rejected_reason,
  track:tracks (id, name, city)
`;

/** Les sessions Time Attack du pilote, la plus récente d'abord. */
export function useTimeAttackSessions() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['time-attack', userId],
    enabled: !!userId,
    queryFn: async (): Promise<TimeAttackSession[]> => {
      if (isDemoMode) return demoList();
      const { data, error } = await supabase
        .from('time_attack_sessions')
        .select(SESSION_SELECT)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as unknown as TimeAttackSession[];
    },
  });
}

function useInvalidateTimeAttack() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['time-attack'] }),
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
      queryClient.invalidateQueries({ queryKey: ['elo-history'] }),
    ]);
}

/** « Je pars rouler » : le serveur enregistre l'heure du check-in, le délai de 90 min démarre. */
export function useStartTimeAttack() {
  const invalidate = useInvalidateTimeAttack();
  return useMutation({
    mutationFn: async (trackId: string) => {
      if (isDemoMode) return demoStart(trackId);
      const { error } = await supabase.rpc('start_time_attack', { p_track_id: trackId });
      if (error) {
        throw new Error(
          error.message.includes('already in progress') ? 'Tu as déjà une session Time Attack en cours.' : error.message,
        );
      }
    },
    onSuccess: invalidate,
  });
}

/**
 * Photo du ticket prise avec l'appareil photo, depuis l'app (la galerie n'est pas proposée :
 * pas de vieille photo ni d'image retouchée). Null si le pilote annule.
 */
export async function takeTicketPhoto(): Promise<TicketPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Autorise l’accès à l’appareil photo dans les réglages pour photographier ton ticket.');
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled) return null;
  const { uri, width } = result.assets[0];
  return { uri, width };
}

export type TicketPhoto = { uri: string; width: number };

/** Largeur maximale envoyée : assez pour lire le ticket, et sous la limite de 1 Mo de l'OCR gratuit. */
const MAX_WIDTH = 1600;

async function compressTicket({ uri, width }: TicketPhoto): Promise<ArrayBuffer> {
  const context = ImageManipulator.manipulate(uri);
  if (width > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return (await fetch(saved.uri)).arrayBuffer();
}

export type TicketSubmission = {
  sessionId: string;
  photo: TicketPhoto;
  /** Nom imprimé sur le ticket. */
  ticketName: string;
  /** Meilleur tour imprimé sur le ticket. */
  bestLapMs: number;
};

/**
 * Envoie la photo du ticket puis la fait valider par l'Edge Function : le nom et le meilleur tour déclarés
 * doivent figurer sur le ticket (lu par OCR), et l'heure de session doit être postérieure au check-in.
 * Un refus lève TicketRejectedError.
 */
export function useSubmitTicket() {
  const { userId } = useAuth();
  const invalidate = useInvalidateTimeAttack();
  return useMutation({
    mutationFn: async ({ sessionId, photo, ticketName, bestLapMs }: TicketSubmission) => {
      if (isDemoMode) return demoSubmit(sessionId, bestLapMs);

      const bytes = await compressTicket(photo);
      const path = `${userId}/${sessionId}/${Date.now()}.jpg`;
      const upload = await supabase.storage.from('time-attack-tickets').upload(path, bytes, { contentType: 'image/jpeg' });
      if (upload.error) throw upload.error;

      const { error } = await supabase.functions.invoke('time-attack-ticket', {
        body: { session_id: sessionId, ticket_path: path, ticket_name: ticketName, best_lap_ms: bestLapMs },
      });
      if (error instanceof FunctionsHttpError) {
        const body = (await (error.context as Response).json().catch(() => null)) as TicketRejection | null;
        if (body?.code) throw new TicketRejectedError(body);
      }
      if (error) throw error;
    },
    // Un refus est aussi enregistré sur la session : on rafraîchit dans les deux cas.
    onSettled: invalidate,
  });
}

export type ReviewRequest = { sessionId: string; ticketName: string; bestLapMs: number; note?: string };

/**
 * Lecture automatique ratée ou erronée : le dernier ticket envoyé part en vérification manuelle chez les admins.
 * La session sort du compte à rebours : plus de DNF tant qu'un admin n'a pas tranché.
 */
export function useRequestTimeAttackReview() {
  const invalidate = useInvalidateTimeAttack();
  return useMutation({
    mutationFn: async ({ sessionId, ticketName, bestLapMs, note }: ReviewRequest) => {
      if (isDemoMode) return demoRequestReview(sessionId, bestLapMs);
      const { error } = await supabase.rpc('request_time_attack_review', {
        p_session_id: sessionId,
        p_ticket_name: ticketName,
        p_best_lap_ms: bestLapMs,
        p_note: note?.trim() || null,
      });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

// ---------- Mode démo : mêmes règles que l'Edge Function et les fonctions SQL ----------

const MINUTE = 60_000;
const DNF_PENALTY = 15;
const iso = (ms: number) => new Date(ms).toISOString();

function demoSession(trackIndex: number, checkInMs: number, patch: Partial<TimeAttackSession> = {}): TimeAttackSession {
  return {
    id: `ta-${checkInMs}`,
    status: 'on_track',
    check_in_at: iso(checkInMs),
    deadline_at: iso(checkInMs + 90 * MINUTE),
    ticket_at: null,
    best_lap_ms: null,
    validated_at: null,
    rejection_count: 0,
    last_rejection_code: null,
    last_rejected_ticket_at: null,
    dnf_at: null,
    elo_penalty: null,
    review_requested_at: null,
    rejected_reason: null,
    track: demoTracks[trackIndex % demoTracks.length],
    ...patch,
  };
}

const now = Date.now();
// Une session en piste depuis 40 min (son ticket sera accepté), et un historique.
const demoSessions: TimeAttackSession[] = [
  demoSession(0, now - 40 * MINUTE),
  demoSession(1, now - 3 * 24 * 60 * MINUTE, {
    status: 'validated',
    ticket_at: iso(now - 3 * 24 * 60 * MINUTE + 25 * MINUTE),
    validated_at: iso(now - 3 * 24 * 60 * MINUTE + 70 * MINUTE),
    best_lap_ms: 47_312,
  }),
  demoSession(0, now - 9 * 24 * 60 * MINUTE, {
    status: 'dnf',
    dnf_at: iso(now - 9 * 24 * 60 * MINUTE + 95 * MINUTE),
    elo_penalty: DNF_PENALTY,
  }),
];

function demoList(): TimeAttackSession[] {
  // Le « planificateur » de la démo : 5 min après l'échéance, vérification si un ticket a été envoyé, sinon DNF.
  for (const s of demoSessions) {
    if (s.status === 'on_track' && new Date(s.deadline_at).getTime() + 5 * MINUTE < Date.now()) {
      if (s.rejection_count > 0) {
        s.status = 'pending_review';
        s.review_requested_at = new Date().toISOString();
        continue;
      }
      s.status = 'dnf';
      s.dnf_at = new Date().toISOString();
      s.elo_penalty = DNF_PENALTY;
      demoProfile.elo -= DNF_PENALTY;
      demoEloHistory.push({ delta: -DNF_PENALTY, elo_after: demoProfile.elo, created_at: s.dnf_at });
    }
  }
  return JSON.parse(JSON.stringify(demoSessions));
}

function demoStart(trackId: string) {
  if (demoSessions.some((s) => s.status === 'on_track')) throw new Error('Tu as déjà une session Time Attack en cours.');
  const index = Math.max(0, demoTracks.findIndex((t) => t.id === trackId));
  demoSessions.unshift(demoSession(index, Date.now()));
}

/** En démo, le ticket « lu » date toujours d'il y a 20 min : refusé si le check-in est plus récent. */
async function demoSubmit(sessionId: string, bestLapMs: number) {
  await new Promise((r) => setTimeout(r, 1200)); // le temps de la lecture
  const s = demoSessions.find((x) => x.id === sessionId);
  if (!s) throw new TicketRejectedError({ code: 'SESSION_NOT_FOUND' });
  const received = Date.now();
  const ticketMs = Math.floor((received - 20 * MINUTE) / MINUTE) * MINUTE;
  const times = { check_in_at: s.check_in_at, deadline_at: s.deadline_at, ticket_at: iso(ticketMs) };
  let code: string | null = null;
  if (s.status !== 'on_track') code = 'SESSION_CLOSED';
  else if (received > new Date(s.deadline_at).getTime()) code = 'DEADLINE_PASSED';
  else if (ticketMs <= new Date(s.check_in_at).getTime()) code = 'TICKET_BEFORE_CHECK_IN';
  if (code) {
    s.rejection_count += 1;
    s.last_rejection_code = code;
    s.last_rejected_ticket_at = times.ticket_at;
    throw new TicketRejectedError({ code, ...times });
  }
  s.status = 'validated';
  s.ticket_at = times.ticket_at;
  s.validated_at = iso(received);
  s.best_lap_ms = bestLapMs;
}

function demoRequestReview(sessionId: string, bestLapMs: number) {
  const s = demoSessions.find((x) => x.id === sessionId);
  if (!s || s.status !== 'on_track') throw new Error('Cette session est déjà clôturée.');
  if (s.rejection_count === 0) throw new Error('Envoie d’abord la photo de ton ticket avant l’échéance.');
  s.status = 'pending_review';
  s.review_requested_at = new Date().toISOString();
  s.best_lap_ms = bestLapMs;
}
