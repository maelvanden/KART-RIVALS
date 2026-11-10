import type { Tournament, TournamentMatch, TournamentSize, TournamentStatus } from '@/types/models';

/** Nombre de tours : 8 pilotes → 3 (quarts, demies, finale), 16 → 4. */
export const roundCount = (size: TournamentSize) => (size === 16 ? 4 : 3);

/** Minimum de pilotes pour lancer avant que le tableau soit complet (sinon un tableau de 8 suffit). */
export const minPilotsToStart = (size: TournamentSize) => (size === 16 ? 9 : 4);

export function roundLabel(round: number, rounds: number, short = false): string {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return 'Finale';
  if (fromEnd === 1) return short ? 'Demies' : 'Demi-finales';
  if (fromEnd === 2) return short ? 'Quarts' : 'Quarts de finale';
  return short ? '8es' : 'Huitièmes de finale';
}

/** Nom d'un duel de ce tour, au singulier (« Demi-finale à courir »). */
export function matchLabel(round: number, rounds: number): string {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return 'Finale';
  if (fromEnd === 1) return 'Demi-finale';
  if (fromEnd === 2) return 'Quart de finale';
  return 'Huitième de finale';
}

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
    t.matches.filter((m) => m.round === i + 1).sort((a, b) => a.slot - b.slot),
  );
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

/** Le tour atteint par le pilote (pour « Éliminé en demi-finale »). */
export function eliminatedIn(t: Tournament, pilotId: string): TournamentMatch | null {
  return (
    t.matches.find(
      (m) => m.decided_at && m.winner_id !== pilotId && (m.pilot_a === pilotId || m.pilot_b === pilotId),
    ) ?? null
  );
}
