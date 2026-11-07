import { formatLapTime } from '@/lib/format';
import type { LapProgressPoint } from '@/types/models';

const DAY = 86_400_000;

/** Progression d'un pilote sur un circuit. */
export type TrackProgress = {
  trackId: string;
  trackName: string;
  /** Chronos du plus ancien au plus récent. */
  laps: LapProgressPoint[];
  first: LapProgressPoint;
  /** Meilleur tour (le plus ancien en cas d'égalité). */
  best: LapProgressPoint;
  last: LapProgressPoint;
  /** Temps gagné entre le premier chrono et le record, en ms (0 si pas encore mieux). */
  gainMs: number;
};

/** Regroupe les chronos par circuit ; le circuit roulé le plus récemment en premier. */
export function groupByTrack(points: LapProgressPoint[]): TrackProgress[] {
  const byTrack = new Map<string, LapProgressPoint[]>();
  for (const p of points) byTrack.set(p.track_id, [...(byTrack.get(p.track_id) ?? []), p]);
  return [...byTrack.values()]
    .map((list) => {
      const laps = [...list].sort((a, b) => Date.parse(a.driven_at) - Date.parse(b.driven_at));
      const best = laps.reduce((b, p) => (p.lap_ms < b.lap_ms ? p : b));
      return {
        trackId: laps[0].track_id,
        trackName: laps[0].track_name,
        laps,
        first: laps[0],
        best,
        last: laps[laps.length - 1],
        gainMs: laps[0].lap_ms - best.lap_ms,
      };
    })
    .sort((a, b) => Date.parse(b.last.driven_at) - Date.parse(a.last.driven_at));
}

/** 1234 → "1,2 s" ; 456 → "0,46 s" ; 45 → "0,045 s". */
export function formatGap(ms: number): string {
  const s = Math.abs(ms) / 1000;
  const digits = s >= 1 ? 1 : s >= 0.1 ? 2 : 3;
  return `${s.toFixed(digits).replace('.', ',')} s`;
}

/** Durée entre deux dates, pour une phrase : « en 3 jours », « en 2 semaines », « en 2 mois », « en 1 an ». */
export function formatSpan(fromIso: string, toIso: string): string {
  const days = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY));
  if (days < 1) return 'dans la journée';
  if (days < 14) return `en ${days} jour${days > 1 ? 's' : ''}`;
  if (days < 45) return `en ${Math.round(days / 7)} semaines`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `en ${months} mois`;
  return `en ${Math.round(months / 12)} ans`;
}

/** Phrase d'accroche : « −1,2 s en 2 mois sur Inwall Kart ». */
export function headline(p: TrackProgress): string {
  if (p.laps.length === 1) return `Premier chrono sur ${p.trackName} : ${formatLapTime(p.first.lap_ms)}`;
  if (p.gainMs <= 0) return `Ton premier chrono sur ${p.trackName} reste ta référence`;
  return `−${formatGap(p.gainMs)} ${formatSpan(p.first.driven_at, p.best.driven_at)} sur ${p.trackName}`;
}

/** Ligne secondaire : nombre de sorties et écart de la dernière au record. */
export function subline(p: TrackProgress): string {
  const sessions = `${p.laps.length} chrono${p.laps.length > 1 ? 's' : ''}`;
  if (p.laps.length === 1) return 'Reviens rouler pour voir ta courbe se dessiner.';
  if (p.last === p.best) return `${sessions} · record battu à ta dernière sortie !`;
  return `${sessions} · dernière sortie à +${formatGap(p.last.lap_ms - p.best.lap_ms)} de ton record`;
}
