import type { ImageSourcePropType } from 'react-native';

import type { TrackDetails } from '@/types/models';

export type TrackLayout = { source: ImageSourcePropType; /** largeur / hauteur */ ratio: number };

/** Tracés fournis avec l'app (nom du circuit en minuscules → image). */
const BUNDLED: Record<string, TrackLayout> = {
  'inwall kart': { source: require('../../../assets/tracks/inwall-kart.png'), ratio: 856 / 780 },
  'mk racing': { source: require('../../../assets/tracks/mk-racing.png'), ratio: 1200 / 916 },
  'speedpark angers': { source: require('../../../assets/tracks/speedpark-angers.png'), ratio: 1200 / 667 },
};

/** Image du tracé : celle envoyée par les admins du karting, sinon celle embarquée dans l'app. */
export function trackLayout(track: Pick<TrackDetails, 'name' | 'layout_url'>): TrackLayout | null {
  if (track.layout_url) return { source: { uri: track.layout_url }, ratio: 0 };
  return BUNDLED[track.name.trim().toLowerCase()] ?? null;
}
