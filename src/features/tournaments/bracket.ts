import { rankMeta, rankThresholds } from '@/theme';
import type { RankTier, Tournament, TournamentMatch, TournamentSize, TournamentStatus } from '@/types/models';

export const TOURNAMENT_SIZES: TournamentSize[] = [4, 8, 16, 32];

/** Nombre de tours : 4 pilotes → 2 (demies, finale), 8 → 3, 16 → 4, 32 → 5 (des seizièmes à la finale). */
export const roundCount = (size: TournamentSize) => Math.log2(size);

/** Minimum de pilotes pour lancer avant que le tableau soit complet (sinon le tableau du dessous suffit). */
export const minPilotsToStart = (size: TournamentSize) => ({ 4: 3, 8: 4, 16: 9, 32: 17 })[size];

/** Nom d'un tour (« Quarts de finale », ou « Quarts » en version courte pour les colonnes du tableau). */
export function roundLabel(round: number, rounds: number, short = false): string {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return 'Finale';
  if (fromEnd === 1) return short ? 'Demies' : 'Demi-finales';
  if (fromEnd === 2) return short ? 'Quarts' : 'Quarts de finale';
  if (fromEnd === 3) return short ? '8es' : 'Huitièmes de finale';
  return short ? '16es' : 'Seizièmes de finale';
}

/** Nom d'un duel de ce tour, au singulier (« Demi-finale à courir »). */
export function matchLabel(round: number, rounds: number, slot = 0): string {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return slot === 1 ? 'Petite finale' : 'Finale';
  if (fromEnd === 1) return 'Demi-finale';
  if (fromEnd === 2) return 'Quart de finale';
  if (fromEnd === 3) return 'Huitième de finale';
  return 'Seizième de finale';
}

/** Ce que contient un tableau de cette taille (« 16es → finale »). */
export const sizeSummary = (size: TournamentSize) =>
  ({ 4: 'Demies et finale', 8: 'Des quarts à la finale', 16: 'Des 8es à la finale', 32: 'Des 16es à la finale' })[size];

export const statusLabel: Record<TournamentStatus, string> = {
  registration: 'Inscriptions ouvertes',
  running: 'En cours',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

/** Les cases du tableau rangées par tour, dans l'ordre des slots. */
export function bracketRounds(t: Tournament): TournamentMatch[][] {
  const rounds = roundCount(t.size);
  return Array.from({ length: rounds }, (_, i) =>
    t.matches.filter((m) => m.round === i + 1 && !isThirdPlace(m, rounds)).sort((a, b) => a.slot - b.slot),
  );
}

/** La petite finale occupe la case « dernier tour, slot 1 », à côté de la finale. */
export const isThirdPlace = (m: Pick<TournamentMatch, 'round' | 'slot'>, rounds: number) => m.round === rounds && m.slot === 1;

export function thirdPlaceMatch(t: Tournament): TournamentMatch | null {
  const rounds = roundCount(t.size);
  return t.matches.find((m) => isThirdPlace(m, rounds)) ?? null;
}

/** Les pilotes à la 3e place : le vainqueur de la petite finale, sinon les deux demi-finalistes battus (ex æquo). */
export function thirdPlaces(t: Tournament): string[] {
  if (t.third_place) return t.third_place_id ? [t.third_place_id] : [];
  return semiFinalLosers(t);
}

/** Le tour en train de se jouer : le premier qui a encore une case non tranchée (la finale une fois terminé). */
export function currentRound(t: Tournament): number {
  const open = t.matches.filter((m) => !m.decided_at).map((m) => m.round);
  return open.length > 0 ? Math.min(...open) : roundCount(t.size);
}

/** Duels joués (hors qualifiés d'office) et duels au total, pour la barre d'avancement. */
export function progress(t: Tournament): { played: number; total: number } {
  const real = t.matches.filter((m) => m.outcome !== 'bye');
  return { played: real.filter((m) => m.decided_at).length, total: real.length };
}

/** Le duel en cours du pilote (case avec ses deux pilotes, non tranchée), s'il en a un. */
export function myCurrentMatch(t: Tournament, myId: string): TournamentMatch | null {
  if (t.status !== 'running') return null;
  return (
    t.matches.find((m) => !m.decided_at && m.challenge_id && (m.pilot_a === myId || m.pilot_b === myId)) ?? null
  );
}

/** Encore en lice : inscrit et jamais battu dans une case tranchée. */
export function isStillIn(t: Tournament, pilotId: string): boolean {
  if (!t.entries.some((e) => e.pilot_id === pilotId)) return false;
  if (t.status === 'completed') return t.champion_id === pilotId;
  return !t.matches.some(
    (m) => m.decided_at && m.winner_id !== pilotId && (m.pilot_a === pilotId || m.pilot_b === pilotId),
  );
}

/** Le tour atteint par le pilote (pour « Éliminé en demi-finale ») ; la petite finale n'élimine personne. */
export function eliminatedIn(t: Tournament, pilotId: string): TournamentMatch | null {
  const rounds = roundCount(t.size);
  return (
    t.matches.find(
      (m) =>
        m.decided_at &&
        !isThirdPlace(m, rounds) &&
        m.winner_id !== pilotId &&
        (m.pilot_a === pilotId || m.pilot_b === pilotId),
    ) ?? null
  );
}

/** Échéance passée ? */
export const isPast = (iso: string | null) => !!iso && new Date(iso).getTime() < Date.now();

/** Duel dont l'échéance est passée. */
export const isOverdue = (m: Pick<TournamentMatch, 'decided_at' | 'deadline_at'>) => !m.decided_at && isPast(m.deadline_at);

/** Les deux demi-finalistes battus (3es ex æquo sur le podium). */
export function semiFinalLosers(t: Tournament): string[] {
  const semis = roundCount(t.size) - 1;
  return t.matches
    .filter((m) => m.round === semis && m.decided_at && m.winner_id)
    .map((m) => (m.winner_id === m.pilot_a ? m.pilot_b : m.pilot_a))
    .filter((id): id is string => !!id);
}

// ---------- Conditions d'entrée ----------

export type EloRange = { minElo: number | null; maxElo: number | null };

/** Fourchette d'ELO couverte par les rangs de `from` à `to` (inclus). Le premier et le dernier rang n'ont pas de borne. */
export function rankRange(from: RankTier, to: RankTier): EloRange {
  const i = rankThresholds.findIndex((t) => t.tier === from);
  const j = rankThresholds.findIndex((t) => t.tier === to);
  const [lo, hi] = i <= j ? [i, j] : [j, i];
  return {
    minElo: lo === 0 ? null : rankThresholds[lo].min,
    maxElo: hi === rankThresholds.length - 1 ? null : rankThresholds[hi + 1].min - 1,
  };
}

/** « Bronze à Or » quand la fourchette tombe sur des rangs entiers, sinon « 1200 à 1500 ELO » ; null si ouvert à tous. */
export function conditionsLabel(t: { min_elo: number | null; max_elo: number | null }): string | null {
  const { min_elo: min, max_elo: max } = t;
  if (min === null && max === null) return null;
  const lo = min === null ? 0 : rankThresholds.findIndex((r) => r.min === min);
  const hi = max === null ? rankThresholds.length - 1 : rankThresholds.findIndex((r) => r.min === max + 1) - 1;
  if (lo >= 0 && hi >= lo) {
    const a = rankMeta[rankThresholds[lo].tier].label;
    const b = rankMeta[rankThresholds[hi].tier].label;
    if (lo === hi) return `Rang ${a}`;
    if (min === null) return `Jusqu’à ${b}`;
    if (max === null) return `${a} et plus`;
    return `${a} à ${b}`;
  }
  if (min === null) return `${max} ELO maximum`;
  if (max === null) return `${min} ELO minimum`;
  return `${min} à ${max} ELO`;
}

export const meetsConditions = (t: { min_elo: number | null; max_elo: number | null }, elo: number) =>
  (t.min_elo === null || elo >= t.min_elo) && (t.max_elo === null || elo <= t.max_elo);
