// Vérification d'un ticket de karting à partir du texte lu par l'OCR, sans IA.
// Le pilote déclare le nom imprimé et son meilleur tour ; on vérifie qu'ils figurent bien sur le ticket
// et on repère la date et l'heure de session. Sans dépendance : testable hors de Deno.

/** Minuscules, sans accents, espaces simples. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\S\n]+/g, ' ')
    .trim();
}

/** Lettres et chiffres seulement : « Jean-Dupont » et « JEAN DUPONT » deviennent « jeandupont ». */
export const compact = (text: string) => normalize(text).replace(/[^a-z0-9]/g, '');

/**
 * Distance d'édition minimale entre `needle` et une sous-chaîne quelconque de `haystack`
 * (tolère les petites erreurs de lecture de l'OCR : O/0, l/1…).
 */
function substringDistance(needle: string, haystack: string): number {
  let prev = new Array(haystack.length + 1).fill(0);
  for (let i = 1; i <= needle.length; i++) {
    const cur = [i];
    for (let j = 1; j <= haystack.length; j++) {
      const cost = needle[i - 1] === haystack[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return Math.min(...prev);
}

/** `target` figure-t-il dans `text` (1 erreur de lecture tolérée tous les 6 caractères) ? */
function fuzzyIncludes(text: string, target: string): boolean {
  const tolerance = Math.floor(target.length / 6);
  return text.includes(target) || (tolerance > 0 && substringDistance(target, text) <= tolerance);
}

/** Lignes du ticket où figure le nom déclaré (1 erreur de lecture tolérée tous les 6 caractères). */
export function linesWithName(lines: string[], name: string): number[] {
  const target = compact(name);
  if (target.length < 2) return [];
  const found: number[] = [];
  lines.forEach((line, i) => {
    if (fuzzyIncludes(compact(line), target)) found.push(i);
  });
  return found;
}

export type PrintedLap = { ms: number; decimals: number };

/** Temps au tour imprimés sur une ligne : « 47.312 », « 47,31 », « 1:02.345 », « 1'02"345 ». */
export function lapTimesIn(line: string): PrintedLap[] {
  const laps: PrintedLap[] = [];
  const re = /(?<![\d:.,])(?:(\d{1,2})\s?[:'´]\s?)?(\d{1,2})\s?[.,"]\s?(\d{2,3})(?![\d:])/g;
  for (const m of line.matchAll(re)) {
    const minutes = Number(m[1] ?? 0);
    const seconds = Number(m[2]);
    if (seconds >= 60 || minutes > 9) continue;
    const fraction = m[3];
    const ms = minutes * 60_000 + seconds * 1000 + Number(fraction.padEnd(3, '0'));
    if (ms >= 10_000) laps.push({ ms, decimals: fraction.length }); // un tour de kart dure plus de 10 s
  }
  return laps;
}

/** Même temps, à la précision imprimée (un ticket au centième affiche 47.31 pour 47.312). */
const sameLap = (printed: PrintedLap, claimedMs: number) =>
  printed.decimals === 3 ? printed.ms === claimedMs : Math.floor(printed.ms / 10) === Math.floor(claimedMs / 10);

/**
 * Le meilleur tour déclaré figure-t-il sur le ticket, pour ce pilote ?
 * - Feuille de classement (plusieurs pilotes) : le temps doit être sur la ligne du nom.
 * - Ticket individuel (nom en en-tête) : le temps doit figurer sur le ticket.
 */
export function lapMatches(lines: string[], nameLines: number[], claimedMs: number): boolean {
  const onNameLine = nameLines.flatMap((i) => lapTimesIn(lines[i]));
  if (onNameLine.length > 0) return onNameLine.some((l) => sameLap(l, claimedMs));
  return lines.some((line) => lapTimesIn(line).some((l) => sameLap(l, claimedMs)));
}

/** Première date imprimée : « 15/10/2026 », « 15-10-26 », « 15.10.2026 » ou « 2026-10-15 » → "2026-10-15". */
export function findDate(text: string): string | null {
  const iso = text.match(/(?<!\d)(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/);
  if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const fr = text.match(/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?![\d.,])/);
  if (fr) {
    const year = fr[3].length === 2 ? 2000 + Number(fr[3]) : Number(fr[3]);
    return toIso(year, Number(fr[2]), Number(fr[1]));
  }
  return null;
}

function toIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Heures imprimées (« 14:25 », « 14:25:30 », « 14h25 »), hors temps au tour (suivis d'une décimale).
 * Renvoyées au format "HH:MM[:SS]".
 */
export function clockTimesIn(text: string): string[] {
  const times: string[] = [];
  const re = /(?<![\d:.,'])(\d{1,2})\s?[:hH]\s?(\d{2})(?::(\d{2}))?(?![\d.,"']|\s?[.,]\d)/g;
  for (const m of text.matchAll(re)) {
    const [h, mi, s] = [Number(m[1]), Number(m[2]), m[3] === undefined ? null : Number(m[3])];
    if (h > 23 || mi > 59 || (s !== null && s > 59)) continue;
    times.push(`${String(h).padStart(2, '0')}:${m[2]}${s === null ? '' : `:${m[3]}`}`);
  }
  return times;
}

/** Mots qu'on trouve sur un ticket de chronométrage de karting (français et anglais). */
const KARTING_WORDS = [
  'kart', 'tour', 'lap', 'best', 'meilleur', 'session', 'pilote', 'driver', 'temps', 'time',
  'classement', 'position', 'pos', 'manche', 'heat', 'race', 'course', 'chrono', 'ecart', 'gap',
];

/**
 * Le texte ressemble-t-il à un vrai ticket de chronométrage ?
 * Au moins 3 temps au tour imprimés et 2 mots du vocabulaire du karting.
 */
export function looksLikeTimingTicket(lines: string[]): boolean {
  const lapCount = lines.reduce((n, line) => n + lapTimesIn(line).length, 0);
  const words = new Set(lines.join(' ').split(/[^a-z]+/));
  const vocabulary = KARTING_WORDS.filter((w) => [...words].some((word) => word.startsWith(w))).length;
  return lapCount >= 3 && vocabulary >= 2;
}

/** Mots trop génériques pour identifier un circuit. */
const GENERIC_TRACK_WORDS = new Set([
  'karting', 'kart', 'karts', 'circuit', 'piste', 'racing', 'race', 'park', 'indoor', 'outdoor', 'club', 'loisirs',
  'loisir', 'center', 'centre', 'sport', 'sports', 'speed', 'land', 'world', 'arena', 'saint', 'sainte', 'sur', 'les',
]);

/**
 * Le ticket mentionne-t-il le circuit du check-in (nom ou ville) ?
 * Si le nom du circuit n'a aucun mot distinctif, le contrôle est ignoré.
 */
export function mentionsTrack(lines: string[], trackName: string, city: string): boolean {
  const keys = `${trackName} ${city}`
    .split(/[\s\-'’·,()]+/)
    .map(compact)
    .filter((w) => w.length >= 4 && !GENERIC_TRACK_WORDS.has(w));
  if (keys.length === 0) return true;
  const text = lines.map(compact).join('');
  return keys.some((k) => fuzzyIncludes(text, k));
}

export type TicketCheck =
  | { ok: true; date: string; time: string; lapMs: number }
  | {
      ok: false;
      code: 'NOT_A_TICKET' | 'TRACK_NOT_FOUND' | 'NAME_NOT_FOUND' | 'LAP_NOT_FOUND' | 'TICKET_DATE_UNREADABLE' | 'TICKET_TIME_UNREADABLE';
    };

export type TicketClaim = {
  /** Nom imprimé sur le ticket, déclaré par le pilote. */
  name: string;
  /** Meilleur tour déclaré par le pilote. */
  lapMs: number;
  /** Circuit choisi au check-in. */
  trackName: string;
  trackCity: string;
};

/**
 * Contrôle du texte OCR face aux déclarations du pilote.
 * L'heure retenue est la PLUS TÔT imprimée : l'heure de session précède toujours l'heure d'impression,
 * et en cas de doute c'est le joueur, pas le tricheur, qui doit reprendre sa photo.
 */
export function checkTicketText(ocrText: string, claim: TicketClaim): TicketCheck {
  const lines = ocrText.split(/\r?\n/).map(normalize).filter(Boolean);
  if (!looksLikeTimingTicket(lines)) return { ok: false, code: 'NOT_A_TICKET' };
  if (!mentionsTrack(lines, claim.trackName, claim.trackCity)) return { ok: false, code: 'TRACK_NOT_FOUND' };

  const nameLines = linesWithName(lines, claim.name);
  if (nameLines.length === 0) return { ok: false, code: 'NAME_NOT_FOUND' };
  if (!lapMatches(lines, nameLines, claim.lapMs)) return { ok: false, code: 'LAP_NOT_FOUND' };

  const all = lines.join('\n');
  const date = findDate(all);
  if (!date) return { ok: false, code: 'TICKET_DATE_UNREADABLE' };
  // Heures sur les lignes datées en priorité (une durée « 10:00 » ailleurs n'est pas une heure de session).
  const datedTimes = lines.filter((l) => findDate(l)).flatMap(clockTimesIn);
  const times = (datedTimes.length > 0 ? datedTimes : clockTimesIn(all)).sort();
  if (times.length === 0) return { ok: false, code: 'TICKET_TIME_UNREADABLE' };

  return { ok: true, date, time: times[0], lapMs: claim.lapMs };
}
