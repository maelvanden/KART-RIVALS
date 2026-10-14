/** "1:02.345", "62.345" ou "62,3" → millisecondes ; null si le format est invalide. */
export function parseLapTime(input: string): number | null {
  const match = input.trim().replace(',', '.').match(/^(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  const [, minutes = '0', seconds, fraction = '0'] = match;
  if (match[1] !== undefined && Number(seconds) >= 60) return null;
  const ms = Number(minutes) * 60_000 + Number(seconds) * 1000 + Number(fraction.padEnd(3, '0'));
  return ms > 0 ? ms : null;
}

/** 62345 → "1:02.345" */
export function formatLapTime(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const sec = `${seconds}.${String(millis).padStart(3, '0')}`;
  return minutes > 0 ? `${minutes}:${sec.padStart(6, '0')}` : sec;
}

export const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
