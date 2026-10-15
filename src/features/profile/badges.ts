import { icons, type IconName } from '@/components/ui/icon';
import type { BadgeStats } from '@/types/models';

export type Badge = {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  /** Couleur du badge une fois débloqué. */
  tone: 'neon' | 'orange' | 'gold';
  unlocked: boolean;
  /** Avancement vers le badge (affiché tant qu'il est verrouillé). */
  progress?: { value: number; target: number };
};

const count = (value: number, target: number) => ({
  unlocked: value >= target,
  progress: { value: Math.min(value, target), target },
});

/** Les badges, dans l'ordre d'affichage, calculés à partir des statistiques du pilote. */
export function computeBadges(s: BadgeStats): Badge[] {
  const crowns: Badge[] = s.crowned_tracks.map((track) => ({
    id: `king-${track}`,
    title: `Roi de ${track}`,
    description: `N°1 du circuit ${track} (au moins 3 victoires, seul en tête).`,
    icon: icons.crown,
    tone: 'gold',
    unlocked: true,
  }));

  return [
    { id: 'first-race', title: 'Premier départ', description: 'Valider son premier match.', icon: icons.challenge, tone: 'neon', ...count(s.matches, 1) },
    { id: 'first-win', title: 'Première victoire', description: 'Gagner un match.', icon: icons.trophy, tone: 'neon', ...count(s.wins, 1) },
    { id: 'regular', title: 'Habitué', description: 'Disputer 10 matchs.', icon: icons.helmet, tone: 'neon', ...count(s.matches, 10) },
    { id: 'streak-3', title: 'En feu', description: 'Gagner 3 matchs d’affilée.', icon: icons.flame, tone: 'orange', ...count(s.best_streak, 3) },
    { id: 'streak-5', title: 'Intouchable', description: 'Gagner 5 matchs d’affilée.', icon: icons.flame, tone: 'orange', ...count(s.best_streak, 5) },
    {
      id: 'giant-killer',
      title: 'Tueur de géant',
      description: 'Battre un pilote qui avait au moins 100 ELO de plus.',
      icon: icons.bolt,
      tone: 'orange',
      ...count(s.giant_kills, 1),
    },
    { id: 'explorer', title: 'Globe-trotter', description: 'Courir sur 3 circuits différents.', icon: icons.explore, tone: 'neon', ...count(s.tracks_raced, 3) },
    { id: 'chrono', title: 'Chronométreur', description: 'Disputer 5 matchs au meilleur tour.', icon: icons.timer, tone: 'neon', ...count(s.lap_time_matches, 5) },
    { id: 'gold', title: 'Pilote d’or', description: 'Atteindre 1400 ELO (rang Or).', icon: icons.medal, tone: 'gold', ...count(s.peak_elo, 1400) },
    { id: 'veteran', title: 'Vétéran', description: 'Disputer 50 matchs.', icon: icons.premium, tone: 'gold', ...count(s.matches, 50) },
    ...(crowns.length > 0
      ? crowns
      : [
          {
            id: 'king',
            title: 'Roi du circuit',
            description: 'Être seul n°1 d’un circuit avec au moins 3 victoires.',
            icon: icons.crown,
            tone: 'gold' as const,
            unlocked: false,
          },
        ]),
  ];
}
