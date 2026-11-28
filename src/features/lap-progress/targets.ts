import { formatGap } from '@/features/lap-progress/progress';
import type { LapTarget } from '@/types/models';

/** Écart à combler, au millième : arrondi, « 0,32 s » ne suffirait pas à battre un pilote devant de 0,322 s. */
export const formatTargetGap = (ms: number) => `${(ms / 1000).toFixed(3).replace('.', ',')} s`;

/** 1 → « 1er », 3 → « 3e ». */
export const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);

/** Écart au pilote juste devant, en ms ; null si je détiens (ou égale) le record. */
export const targetGapMs = (t: LapTarget) => (t.target_lap_ms === null ? null : t.lap_ms - t.target_lap_ms);

/** Je détiens le record (seul, ou le premier à l'avoir établi en cas d'égalité). */
export const holdsRecord = (t: LapTarget, myId: string | null | undefined) => t.target_id === null && t.record_id === myId;

/** « Il te manque 0,32 s pour battre Lucas » · « Tu détiens le record » · « Tu égales le record de Lucas ». */
export function targetHeadline(t: LapTarget, myId: string | null | undefined): string {
  const gap = targetGapMs(t);
  if (gap === null) {
    return holdsRecord(t, myId) ? 'Tu détiens le record' : `Tu égales le record de ${t.record_username}`;
  }
  return `Il te manque ${formatTargetGap(gap)} pour battre ${t.target_username}`;
}

/** Ligne secondaire : place gagnée en battant l'objectif, et écart au record s'il est plus loin. */
export function targetSubline(t: LapTarget, myId: string | null | undefined): string {
  const place = `${ordinal(t.position)} sur ${t.pilots}`;
  if (t.target_position === null) {
    return holdsRecord(t, myId) ? `${place} · ${t.pilots > 1 ? 'défends-le !' : 'premier chrono validé ici'}` : place;
  }
  const next = `${place} · passe ${ordinal(t.target_position)}`;
  if (t.target_id === t.record_id) return `${next} et prends le record`;
  return `${next} · record à ${formatGap(t.lap_ms - t.record_lap_ms)}`;
}
