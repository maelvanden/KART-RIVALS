import type { RankTier } from '@/types/models';

/**
 * Design system « Motorsport / Gaming Premium ».
 * Aplats sombres et froids, un seul accent Volt agressif pour l'action, bordures fines, angles vifs.
 */
export const palette = {
  night: '#161920', // fond principal (jamais de noir pur)
  slate: '#212631', // cartes, modales
  slateHigh: '#2A3040', // éléments posés sur une carte (pistes, champs, cases)
  volt: '#DEFF00', // accent : CTA principaux, onglets actifs
  white: '#FFFFFF',
  steel: '#8A95A5', // texte secondaire
  hairline: 'rgba(255, 255, 255, 0.08)', // bordures 1px
  orange: '#FF6B1A',
  red: '#FF3B5C',
} as const;

export const colors = {
  background: palette.night,
  surface: palette.slate,
  surfaceAlt: palette.slateHigh,
  border: palette.hairline,
  /** Bordure plus marquée (focus, sélection discrète). */
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  text: palette.white,
  textMuted: palette.steel,
  /** Accent Volt (nom historique « neon » conservé dans tout le code). */
  neon: palette.volt,
  neonDim: 'rgba(222, 255, 0, 0.12)',
  /** Fond d'un élément sélectionné (case, carte cochée). */
  selected: 'rgba(222, 255, 0, 0.07)',
  orange: palette.orange,
  orangeDim: 'rgba(255, 107, 26, 0.14)',
  danger: palette.red,
  /** Texte posé sur le Volt. */
  onNeon: palette.night,
  overlay: 'rgba(10, 12, 16, 0.72)',
} as const;

/** Dégradés discrets pour les cartes « héros » (une lueur Volt ou orange dans un coin). */
export const gradients = {
  voltGlow: ['#2B321C', palette.slate, palette.slate] as const,
  heat: ['#2B321C', palette.slate, '#33221C'] as const,
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Angles vifs : boutons 6, cartes 12, étiquettes et puces 4 (pas de formes ovales). */
export const radius = { sm: 6, md: 8, lg: 12, pill: 4 } as const;

/**
 * Polices (chargées dans src/app/_layout.tsx) : Oswald, condensée et en majuscules, pour les titres et
 * les gros chiffres ; Inter pour le texte. Chaque graisse est une famille distincte.
 */
export const fonts = {
  display: 'Oswald_700Bold',
  displayMedium: 'Oswald_600SemiBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export const rankMeta: Record<RankTier, { label: string; color: string }> = {
  novice: { label: 'Novice', color: '#8A93A3' },
  bronze: { label: 'Bronze', color: '#CD7F32' },
  argent: { label: 'Argent', color: '#C0C7D1' },
  or: { label: 'Or', color: '#FFC83D' },
  platine: { label: 'Platine', color: '#4FE3D6' },
  diamant: { label: 'Diamant', color: '#5AA9FF' },
  legende: { label: 'Légende', color: '#FF6B1A' },
};

/** Seuils ELO de chaque rang — doivent rester alignés sur la colonne générée `profiles.rank`. */
export const rankThresholds: { tier: RankTier; min: number }[] = [
  { tier: 'novice', min: 0 },
  { tier: 'bronze', min: 1100 },
  { tier: 'argent', min: 1250 },
  { tier: 'or', min: 1400 },
  { tier: 'platine', min: 1550 },
  { tier: 'diamant', min: 1700 },
  { tier: 'legende', min: 1850 },
];

export function rankForElo(elo: number): RankTier {
  return rankThresholds.findLast((t) => elo >= t.min)?.tier ?? 'novice';
}

/** Vrai si `rank` est au moins `min` (même ordre que l'enum rank_tier en base). */
export function rankAtLeast(rank: RankTier, min: RankTier): boolean {
  const index = (tier: RankTier) => rankThresholds.findIndex((t) => t.tier === tier);
  return index(rank) >= index(min);
}
