import { challengeStep, needsMe, stepLabel } from '@/features/challenges/state';
import { dateTimeFormat } from '@/lib/format';
import { rankMeta, rankThresholds } from '@/theme';
import type { Challenge, Profile } from '@/types/models';

/** Données du widget : uniquement des valeurs simples (sérialisées vers l'extension iOS). */
export type PilotWidgetProps = {
  signedIn: boolean;
  elo: number;
  rankLabel: string;
  rankColor: string;
  /** Rang suivant ('' au rang maximum). */
  nextRankLabel: string;
  /** Points ELO manquants pour le rang suivant. */
  toNext: number;
  /** Progression dans le rang actuel, de 0 à 1. */
  progress: number;
  /** Place au classement national (0 sans match validé). */
  position: number;
  /** Prochain défi ('' sans défi en cours). */
  challengeOpponent: string;
  challengeTrack: string;
  challengeWhen: string;
  challengeStatus: string;
  challengeNeedsMe: boolean;
  challengeUrl: string;
};

/**
 * Le défi à montrer : d'abord le prochain défi planifié (date à venir la plus proche), sinon un défi qui attend une
 * action du pilote, sinon le plus récent.
 */
export function nextChallengeFor(list: Challenge[], myId: string): Challenge | null {
  const now = Date.now();
  const open = list.filter((c) => {
    const step = challengeStep(c, myId);
    return step !== 'done' && step !== 'closed';
  });
  const scheduled = open
    .filter((c) => c.scheduled_at && Date.parse(c.scheduled_at) > now)
    .sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!));
  return scheduled[0] ?? open.find((c) => needsMe(challengeStep(c, myId))) ?? open[0] ?? null;
}

export function widgetPropsFor(
  me: Pick<Profile, 'elo' | 'rank'> | null,
  position: number | null,
  challenge: Challenge | null,
  myId: string | null,
): PilotWidgetProps {
  const elo = me?.elo ?? 1000;
  const index = Math.max(0, rankThresholds.findLastIndex((t) => elo >= t.min));
  const current = rankThresholds[index];
  const next = rankThresholds[index + 1];
  const opponent = challenge && myId ? (challenge.challenger_id === myId ? challenge.opponent : challenge.challenger) : null;
  const step = challenge && myId ? challengeStep(challenge, myId) : null;
  return {
    signedIn: !!me,
    elo,
    rankLabel: rankMeta[current.tier].label,
    rankColor: rankMeta[current.tier].color,
    nextRankLabel: next ? rankMeta[next.tier].label : '',
    toNext: next ? next.min - elo : 0,
    progress: next ? Math.min(1, Math.max(0, (elo - current.min) / (next.min - current.min))) : 1,
    position: position ?? 0,
    challengeOpponent: opponent?.username ?? '',
    challengeTrack: challenge?.track?.name ?? '',
    challengeWhen: challenge?.scheduled_at ? dateTimeFormat.format(new Date(challenge.scheduled_at)) : 'Date à fixer',
    challengeStatus: step ? stepLabel[step] : '',
    challengeNeedsMe: step ? needsMe(step) : false,
    challengeUrl: challenge ? `kartrivals://challenge/${challenge.id}` : 'kartrivals://challenges',
  };
}
