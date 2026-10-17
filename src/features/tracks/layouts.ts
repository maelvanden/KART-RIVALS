import type { ImageSourcePropType } from 'react-native';

import type { TrackDetails } from '@/types/models';

/** Tracés fournis avec l'app (nom du circuit en minuscules → image). */
const BUNDLED: Record<string, ImageSourcePropType> = {
  'inwall kart': require('../../../assets/tracks/inwall-kart.png'),
};

/** Image du tracé : embarquée dans l'app, sinon adresse renseignée dans la base. */
export function trackLayout(track: Pick<TrackDetails, 'name' | 'layout_url'>): ImageSourcePropType | null {
  return BUNDLED[track.name.trim().toLowerCase()] ?? (track.layout_url ? { uri: track.layout_url } : null);
}
