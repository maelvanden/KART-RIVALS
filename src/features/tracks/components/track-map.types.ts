import type { TrackDetails } from '@/types/models';

export type TrackMapProps = {
  tracks: TrackDetails[];
  height: number;
  /** Circuit mis en avant (marqueur plus grand). */
  selectedId?: string;
  onSelect?: (track: TrackDetails) => void;
};

/** Indoor en vert fluo, outdoor en orange. */
export const markerColor = (t: Pick<TrackDetails, 'is_indoor'>, neon: string, orange: string) =>
  t.is_indoor ? neon : orange;
