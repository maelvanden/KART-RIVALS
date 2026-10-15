// Edge Function time-attack-ticket : valide la photo du ticket d'une session Time Attack.
//
// Appel (depuis l'app, utilisateur connecté) :
//   POST { session_id, ticket_path, ticket_name, best_lap_ms }
//     ticket_path : time-attack-tickets/<uid>/<session_id>/<fichier>
//     ticket_name : nom imprimé sur le ticket, déclaré par le pilote
//     best_lap_ms : meilleur tour déclaré par le pilote
// Réponse :
//   200 { ok: true, check_in_at, ticket_at, best_lap_ms }
//   4xx { ok: false, code, check_in_at?, ticket_at?, deadline_at? }   (codes : _shared/time-attack-rules.ts)
//
// Le texte du ticket est lu par OCR (OCR.space) : on vérifie que le nom et le temps déclarés y figurent,
// puis la règle d'or : l'heure de session imprimée doit être STRICTEMENT postérieure au check-in enregistré
// par le serveur. La décision finale est prise en SQL (record_time_attack_ticket).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

import { checkTicketText } from '../_shared/ticket-ocr.ts';
import { checkTicketTiming, wallClockToUtc, type TicketErrorCode } from '../_shared/time-attack-rules.ts';
import { readTicketText } from './ocr-space.ts';

const BUCKET = 'time-attack-tickets';
// Heure imprimée sur les tickets : heure locale des circuits.
const TICKET_TIME_ZONE = Deno.env.get('TICKET_TIME_ZONE') ?? 'Europe/Paris';
const OCR_SPACE_API_KEY = Deno.env.get('OCR_SPACE_API_KEY') ?? '';

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

  // Heure de réception : c'est elle qui compte pour l'échéance de 90 min, pas la durée de lecture du ticket.
  const receivedAt = new Date();

  // ---------- Pilote connecté ----------
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return refuse(401, 'UNAUTHORIZED');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return refuse(401, 'UNAUTHORIZED');
  const pilotId = auth.user.id;

  let body: { session_id?: unknown; ticket_path?: unknown; ticket_name?: unknown; best_lap_ms?: unknown };
  try {
    body = await req.json();
  } catch {
    return refuse(400, 'BAD_REQUEST');
  }
  const sessionId = typeof body.session_id === 'string' ? body.session_id : null;
  const ticketPath = typeof body.ticket_path === 'string' ? body.ticket_path : null;
  const ticketName = typeof body.ticket_name === 'string' ? body.ticket_name.trim().slice(0, 60) : '';
  const claimedLapMs = Number.isInteger(body.best_lap_ms) ? (body.best_lap_ms as number) : 0;
  if (
    !sessionId ||
    !ticketPath ||
    !ticketPath.startsWith(`${pilotId}/${sessionId}/`) ||
    ticketPath.includes('..') ||
    ticketName.length < 2 ||
    claimedLapMs < 10_000 ||
    claimedLapMs > 600_000
  ) {
    return refuse(400, 'BAD_REQUEST');
  }

  // ---------- Session : contrôles avant de lire le ticket ----------
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

  // ---------- Lecture du ticket (OCR) ----------
  if (!OCR_SPACE_API_KEY) return refuse(503, 'OCR_UNAVAILABLE', times);
  const { data: file, error: fileError } = await admin.storage.from(BUCKET).download(ticketPath);
  if (fileError || !file) return refuse(400, 'BAD_REQUEST', times);

  let ocrText: string;
  try {
    ocrText = await readTicketText(file, OCR_SPACE_API_KEY);
  } catch (e) {
    console.error('ocr error', e);
    return refuse(503, 'OCR_UNAVAILABLE', times);
  }

  // Le nom et le temps déclarés doivent figurer sur le ticket ; la date est exigée
  // (sans elle, un vieux ticket « 15:00 » passerait pour une session du jour).
  const reading = checkTicketText(ocrText, ticketName, claimedLapMs);
  if (!reading.ok) return refuse(422, reading.code, times);
  const ticketAt = wallClockToUtc(reading.date, reading.time, TICKET_TIME_ZONE);
  if (!ticketAt) return refuse(422, 'TICKET_TIME_UNREADABLE', times);

  // ---------- Règle d'or : ticket_timestamp > check_in_timestamp ----------
  const verdict = checkTicketTiming({ checkInAt, deadlineAt, receivedAt, ticketAt });

  // Enregistrement (refus compris, pour garder la trace des tentatives) et contrôle d'autorité sous verrou.
  const { data: recorded, error: recordError } = await admin.rpc('record_time_attack_ticket', {
    p_session_id: sessionId,
    p_pilot_id: pilotId,
    p_ticket_at: ticketAt.toISOString(),
    p_best_lap_ms: claimedLapMs,
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

  // Trace du ticket retenu (en cas de contestation).
  await admin.from('time_attack_sessions').update({ ticket_name: ticketName, ocr_text: ocrText.slice(0, 5000) }).eq('id', sessionId);
  return json(200, { ok: true, ...details, best_lap_ms: claimedLapMs });
});
