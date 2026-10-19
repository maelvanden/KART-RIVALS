/** « À l'instant », « Il y a 5 min », « Il y a 3 h », « Il y a 2 j », puis la date. */
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'À l’instant';
  if (s < 3600) return `Il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `Il y a ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86_400) return `Il y a ${Math.floor(s / 86_400)} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** 58972 → { main: "0:58", ms: ".972" }. */
export function splitLap(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return { main: `${minutes}:${String(seconds).padStart(2, '0')}`, ms: `.${String(ms % 1000).padStart(3, '0')}` };
}

/** « 58.972 », « 1:02.345 » ou « 58,972 » → millisecondes ; null si invalide. */
export function parseLap(input: string): number | null {
  const m = input.trim().replace(',', '.').match(/^(?:(\d{1,2}):)?(\d{1,2})\.(\d{1,3})$/);
  if (!m) return null;
  const ms = (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000 + Number(m[3].padEnd(3, '0'));
  return ms >= 10_000 && ms <= 600_000 ? ms : null;
}
