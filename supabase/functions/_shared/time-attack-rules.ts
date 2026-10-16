// Règles anti-triche du Time Attack, sans dépendance : testables hors de Deno.
// Le contrôle d'autorité est refait en SQL (record_time_attack_ticket) sous verrou.

/** Codes renvoyés à l'app ; l'app les traduit en message pour le pilote. */
export type TicketErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CLOSED'
  | 'DEADLINE_PASSED'
  | 'NOT_A_TICKET'
  | 'TRACK_NOT_FOUND'
  | 'NAME_NOT_FOUND'
  | 'LAP_NOT_FOUND'
  | 'TICKET_TIME_UNREADABLE'
  | 'TICKET_DATE_UNREADABLE'
  | 'TICKET_BEFORE_CHECK_IN'
  | 'TICKET_IN_FUTURE'
  | 'TICKET_ALREADY_USED'
  | 'OCR_UNAVAILABLE';

/** Tolérance sur l'horloge de l'imprimante du circuit. */
export const FUTURE_TOLERANCE_MS = 10 * 60_000;

/**
 * Heure murale lue sur le ticket ("2026-10-15" + "14:25" ou "14:25:30") dans le fuseau du circuit
 * → instant UTC. Null si le format est invalide.
 */
export function wallClockToUtc(date: string, time: string, timeZone: string): Date | null {
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!d || !t) return null;
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [h, mi, s] = [Number(t[1]), Number(t[2]), Number(t[3] ?? 0)];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59 || s > 59) return null;

  const asUtc = Date.UTC(y, mo - 1, da, h, mi, s);
  // Décalage du fuseau à cet instant ; recalculé une fois pour les changements d'heure.
  let utc = asUtc - tzOffsetMs(asUtc, timeZone);
  utc = asUtc - tzOffsetMs(utc, timeZone);
  const result = new Date(utc);
  // Rejette les dates impossibles (31 février…).
  return localDate(result, timeZone) === date ? result : null;
}

/** "YYYY-MM-DD" de l'instant donné dans le fuseau. */
export function localDate(at: Date, timeZone: string): string {
  const p = parts(at.getTime(), timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

function parts(ms: number, timeZone: string) {
  const out: Record<string, string> = {};
  for (const { type, value } of new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms))) {
    out[type] = value;
  }
  return out;
}

function tzOffsetMs(ms: number, timeZone: string): number {
  const p = parts(ms, timeZone);
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return local - Math.floor(ms / 1000) * 1000;
}

/**
 * Règle d'or : le ticket doit être STRICTEMENT postérieur au check-in.
 * Renvoie le code de refus, ou null si le ticket est recevable.
 */
export function checkTicketTiming(input: {
  checkInAt: Date;
  deadlineAt: Date;
  receivedAt: Date;
  ticketAt: Date;
}): TicketErrorCode | null {
  const { checkInAt, deadlineAt, receivedAt, ticketAt } = input;
  if (receivedAt.getTime() > deadlineAt.getTime()) return 'DEADLINE_PASSED';
  if (ticketAt.getTime() <= checkInAt.getTime()) return 'TICKET_BEFORE_CHECK_IN';
  if (ticketAt.getTime() > receivedAt.getTime() + FUTURE_TOLERANCE_MS) return 'TICKET_IN_FUTURE';
  return null;
}
