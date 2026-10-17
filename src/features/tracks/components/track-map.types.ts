import type { TrackDetails } from '@/types/models';

export type TrackMapProps = {
  tracks: TrackDetails[];
  height: number;
  /** Circuit mis en avant (marqueur plus grand). */
  selectedId?: string;
  onSelect?: (track: TrackDetails) => void;
};

/** Indoor en vert fluo, outdoor en orange. */
/** Filigrane du plan : le département si tous les circuits affichés en partagent un seul. */
export function regionLabel(tracks: Pick<TrackDetails, 'region'>[]): string | null {
  const regions = [...new Set(tracks.map((t) => t.region).filter(Boolean))];
  return regions.length === 1 ? regions[0]! : null;
}

export const markerColor = (t: Pick<TrackDetails, 'is_indoor'>, neon: string, orange: string) =>
  t.is_indoor ? neon : orange;
