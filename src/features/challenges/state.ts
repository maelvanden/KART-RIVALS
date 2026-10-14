import type { Challenge } from '@/types/models';

/** Où en est le défi, du point de vue du pilote connecté. */
export type ChallengeStep =
  | 'awaiting_my_answer'
  | 'awaiting_their_answer'
  | 'to_race' // accepté, aucun résultat (ou résultat contesté à ressaisir)
  | 'awaiting_my_validation'
  | 'awaiting_their_validation'
  | 'done'
  | 'closed'; // refusé, annulé ou expiré

export function challengeStep(c: Challenge, myId: string): ChallengeStep {
  const iAmChallenger = c.challenger_id === myId;
  if (c.status === 'completed' || c.match?.status === 'confirmed') return 'done';
  if (c.status === 'pending') return iAmChallenger ? 'awaiting_their_answer' : 'awaiting_my_answer';
  if (c.status !== 'accepted') return 'closed';
  if (!c.match || c.match.status === 'disputed') return 'to_race';
  const myConfirmation = iAmChallenger ? c.match.challenger_confirmed_at : c.match.opponent_confirmed_at;
  return myConfirmation ? 'awaiting_their_validation' : 'awaiting_my_validation';
}

export const stepLabel: Record<ChallengeStep, string> = {
  awaiting_my_answer: 'Défi reçu',
  awaiting_their_answer: 'En attente de réponse',
  to_race: 'Accepté · à courir',
  awaiting_my_validation: 'Résultat à valider',
  awaiting_their_validation: 'Validation adverse en attente',
  done: 'Résultat validé',
  closed: 'Terminé',
};

/** Les étapes où c'est au pilote connecté d'agir. */
export const needsMe = (step: ChallengeStep) =>
  step === 'awaiting_my_answer' || step === 'awaiting_my_validation' || step === 'to_race';
