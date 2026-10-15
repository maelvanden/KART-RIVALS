// Edge Function time-attack-ticket : valide la photo du ticket d'une session Time Attack.
//
// Appel (depuis l'app, utilisateur connecté) :
//   POST { session_id, ticket_path }   — ticket_path : time-attack-tickets/<uid>/<session_id>/<fichier>
// Réponse :
//   200 { ok: true, check_in_at, ticket_at, best_lap_ms }
//   4xx { ok: false, code, check_in_at?, ticket_at?, deadline_at? }   (codes : _shared/time-attack-rules.ts)
//
// Règle d'or : l'heure de session lue sur le ticket doit être STRICTEMENT postérieure au check-in
// enregistré par le serveur. La décision finale est prise en SQL (record_time_attack_ticket).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

import { checkTicketTiming, wallClockToUtc, type TicketErrorCode } from '../_shared/time-attack-rules.ts';
import { readTicket } from './vision.ts';

const BUCKET = 'time-attack-tickets';
// Heure imprimée sur les tickets : heure locale des circuits.
const TICKET_TIME_ZONE = Deno.env.get('TICKET_TIME_ZONE') ?? 'Europe/Paris';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Details = { check_in_at?: string; ticket_at?: string; deadline_at?: string; status?: string };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const refuse = (status: number, code: TicketErrorCode, details: Details = {}) => json(status, { ok: false, code, ...details });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return refuse(405, 'BAD_REQUEST');

  // Heure de réception : c'est elle qui compte pour l'échéance de 90 min, pas la durée de lecture par l'IA.
  const receivedAt = new Date();

  // ---------- Pilote connecté ----------
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return refuse(401, 'UNAUTHORIZED');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return refuse(401, 'UNAUTHORIZED');
  const pilotId = auth.user.id;

  let body: { session_id?: unknown; ticket_path?: unknown };
  try {
    body = await req.json();
  } catch {
    return refuse(400, 'BAD_REQUEST');
  }
  const sessionId = typeof body.session_id === 'string' ? body.session_id : null;
  const ticketPath = typeof body.ticket_path === 'string' ? body.ticket_path : null;
  if (!sessionId || !ticketPath || !ticketPath.startsWith(`${pilotId}/${sessionId}/`) || ticketPath.includes('..')) {
    return refuse(400, 'BAD_REQUEST');
  }

  // ---------- Session : contrôles avant d'appeler l'IA ----------
  const { data: session, error: sessionError } = await admin
    .from('time_attack_sessions')
    .select('id, pilot_id, status, check_in_at, deadline_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session || session.pilot_id !== pilotId) return refuse(404, 'SESSION_NOT_FOUND');
  const times: Details = { check_in_at: session.check_in_at, deadline_at: session.deadline_at };
  if (session.status !== 'on_track') return refuse(409, 'SESSION_CLOSED', { ...times, status: session.status });
  const checkInAt = new Date(session.check_in_at);
  const deadlineAt = new Date(session.deadline_at);
  if (receivedAt > deadlineAt) return refuse(409, 'DEADLINE_PASSED', times);

  // ---------- Lecture du ticket par l'IA Vision ----------
  const { data: file, error: fileError } = await admin.storage.from(BUCKET).download(ticketPath);
  if (fileError || !file) return refuse(400, 'BAD_REQUEST', times);
  const mediaType = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';

  let reading;
  try {
    reading = await readTicket(new Uint8Array(await file.arrayBuffer()), mediaType);
  } catch (e) {
    console.error('vision error', e);
    return refuse(503, 'VISION_UNAVAILABLE', times);
  }
  if (!reading || !reading.is_timing_ticket) return refuse(422, 'NOT_A_TICKET', times);
  if (!reading.session_time) return refuse(422, 'TICKET_TIME_UNREADABLE', times);
  // La date est exigée : sans elle, un vieux ticket « 15:00 » passerait pour une session du jour.
  if (!reading.session_date) return refuse(422, 'TICKET_DATE_UNREADABLE', times);

  const ticketAt = wallClockToUtc(reading.session_date, reading.session_time, TICKET_TIME_ZONE);
  if (!ticketAt) return refuse(422, 'TICKET_TIME_UNREADABLE', times);
  const bestLapMs = reading.best_lap_ms && reading.best_lap_ms > 0 ? reading.best_lap_ms : null;

  // ---------- Règle d'or : ticket_timestamp > check_in_timestamp ----------
  const verdict = checkTicketTiming({ checkInAt, deadlineAt, receivedAt, ticketAt });

  // Enregistrement (refus compris, pour garder la trace des tentatives) et contrôle d'autorité sous verrou.
  const { data: recorded, error: recordError } = await admin.rpc('record_time_attack_ticket', {
    p_session_id: sessionId,
    p_pilot_id: pilotId,
    p_ticket_at: ticketAt.toISOString(),
    p_best_lap_ms: bestLapMs,
    p_ticket_path: ticketPath,
    p_received_at: receivedAt.toISOString(),
  });
  if (recordError) throw recordError;

  const result = recorded as { ok: boolean; code?: TicketErrorCode; status?: string };
  const details = { ...times, ticket_at: ticketAt.toISOString() };
  const code = verdict ?? (result.ok ? null : result.code!);
  if (code) {
    const status = code === 'SESSION_CLOSED' || code === 'DEADLINE_PASSED' ? 409 : code === 'SESSION_NOT_FOUND' ? 404 : 422;
    return refuse(status, code, { ...details, status: result.status });
  }
  return json(200, { ok: true, ...details, best_lap_ms: bestLapMs });
});
