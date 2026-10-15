import type { Race } from '@/types/models';

/** Où en est la course, du point de vue du pilote connecté. */
export type RaceStep =
  | 'invited' // invitation à accepter ou refuser
  | 'waiting_start' // inscrit, en attente du résultat de l'organisateur
  | 'to_submit' // organisateur : saisir (ou ressaisir) le résultat
  | 'to_validate' // résultat à valider ou contester
  | 'validated_by_me' // déjà validé, en attente de la majorité
  | 'done'
  | 'closed'; // annulée, ou invitation refusée

export function raceStep(r: Race, myId: string): RaceStep {
  const me = r.entries.find((e) => e.pilot_id === myId);
  if (r.status === 'confirmed') return me?.status === 'accepted' ? 'done' : 'closed';
  if (r.status === 'cancelled' || !me || me.status === 'declined') return 'closed';
  const organizer = r.organizer_id === myId;
  if (r.status === 'open' || r.status === 'disputed') {
    if (me.status === 'invited') return 'invited';
    return organizer ? 'to_submit' : 'waiting_start';
  }
  return me.confirmed_at ? 'validated_by_me' : 'to_validate';
}

export const raceStepLabel: Record<RaceStep, string> = {
  invited: 'Invitation reçue',
  waiting_start: 'Inscrit · à courir',
  to_submit: 'Résultat à saisir',
  to_validate: 'Résultat à valider',
  validated_by_me: 'En attente des autres',
  done: 'Course validée',
  closed: 'Terminée',
};

export const raceNeedsMe = (step: RaceStep) => step === 'invited' || step === 'to_validate' || step === 'to_submit';

export const acceptedEntries = (r: Race) => r.entries.filter((e) => e.status === 'accepted');

/** Validation à la majorité stricte des participants. */
export const confirmationsNeeded = (r: Race) => Math.floor(acceptedEntries(r).length / 2) + 1;
