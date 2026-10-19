import type { TrackEvent } from '@/features/events/api';

const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** « sam. 25 oct. · 20:00 – 23:00 » pour un événement, « Jusqu'au 31 déc. » pour une promo. */
export function eventWhen(e: Pick<TrackEvent, 'kind' | 'starts_at' | 'ends_at'>, long = false): string {
  const fmt = long ? longDay : day;
  if (e.kind === 'promo' || !e.starts_at) {
    return e.ends_at ? `Jusqu’au ${fmt.format(new Date(e.ends_at))}` : '';
  }
  const start = new Date(e.starts_at);
  const end = e.ends_at ? new Date(e.ends_at) : null;
  const head = `${fmt.format(start)} · ${time.format(start)}`;
  if (!end) return head;
  return sameDay(start, end) ? `${head} – ${time.format(end)}` : `${head} → ${fmt.format(end)}`;
}

/** Jour et mois pour la vignette de date. */
export function dateBadge(iso: string) {
  const d = new Date(iso);
  return { day: String(d.getDate()), month: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') };
}

/** « 25/10/2026 » + « 20:00 » → ISO (heure locale) ; null si vide ou invalide. */
export function parseLocalDate(date: string, hour: string): string | null {
  const m = date.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const h = hour.trim().match(/^(\d{1,2})(?:[:h](\d{2}))?$/i);
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), h ? Number(h[1]) : 23, h ? Number(h[2] ?? 0) : 59);
  return Number.isNaN(d.getTime()) || d.getDate() !== Number(m[1]) ? null : d.toISOString();
}

/** ISO → { date: "25/10/2026", hour: "20:00" } pour pré-remplir le formulaire. */
export function splitLocalDate(iso: string | null) {
  if (!iso) return { date: '', hour: '' };
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`, hour: `${p(d.getHours())}:${p(d.getMinutes())}` };
}
