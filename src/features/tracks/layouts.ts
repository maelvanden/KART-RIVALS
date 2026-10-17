import type { ImageSourcePropType } from 'react-native';

import type { TrackDetails } from '@/types/models';

export type TrackLayout = { source: ImageSourcePropType; /** largeur / hauteur */ ratio: number };

/** Tracés fournis avec l'app (nom du circuit en minuscules → image). */
const BUNDLED: Record<string, TrackLayout> = {
  'inwall kart': { source: require('../../../assets/tracks/inwall-kart.png'), ratio: 856 / 780 },
  'speedpark angers': { source: require('../../../assets/tracks/speedpark-angers.png'), ratio: 1200 / 667 },
};

/** Image du tracé : embarquée dans l'app, sinon adresse renseignée dans la base. */
export function trackLayout(track: Pick<TrackDetails, 'name' | 'layout_url'>): TrackLayout | null {
  return BUNDLED[track.name.trim().toLowerCase()] ?? (track.layout_url ? { source: { uri: track.layout_url }, ratio: 4 / 3 } : null);
}
