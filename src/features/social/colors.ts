/** Palette des couleurs d'écurie : vives et lisibles sur le fond nuit (même liste qu'en base). */
export const TEAM_COLORS = [
  { value: '#DEFF00', label: 'Volt' },
  { value: '#FF6B1A', label: 'Orange' },
  { value: '#FF3B5C', label: 'Rouge' },
  { value: '#FF4FD8', label: 'Rose' },
  { value: '#9B6BFF', label: 'Violet' },
  { value: '#3D8BFF', label: 'Bleu' },
  { value: '#22D3EE', label: 'Cyan' },
  { value: '#2EE59D', label: 'Vert' },
  { value: '#FFC83D', label: 'Or' },
  { value: '#F5F7FA', label: 'Blanc' },
] as const;

export const DEFAULT_TEAM_COLOR = TEAM_COLORS[0].value;

/** Couleur avec transparence (« #DEFF00 » + 0.12 → « #DEFF001F »), pour les fonds et les bandes. */
export function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()}`;
}
