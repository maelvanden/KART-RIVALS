import type { RankTier } from '@/types/models';

export const colors = {
  background: '#0A0B0D',
  surface: '#14161A',
  surfaceAlt: '#1C1F25',
  border: '#262A31',
  text: '#F5F7FA',
  textMuted: '#8A93A3',
  neon: '#39FF14',
  neonDim: 'rgba(57, 255, 20, 0.12)',
  orange: '#FF6B1A',
  orangeDim: 'rgba(255, 107, 26, 0.14)',
  danger: '#FF3B5C',
  onNeon: '#061200',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

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
