import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { demoPilots } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { RankTier } from '@/types/models';

/** Statistiques d'une fiche circuit pour son exploitant (RPC track_stats). Les périodes « 30 j » sont glissantes. */
export type TrackStats = {
  /** Visites de la fiche : une par pilote et par jour, gérants exclus. */
  views_30d: number;
  views_prev_30d: number;
  viewers_30d: number;
  /** Pilotes avec au moins un résultat validé sur le circuit (défi, course ou Time Attack). */
  pilots_30d: number;
  pilots_prev_30d: number;
  pilots_total: number;
  /** Pilotes dont le tout premier résultat sur ce circuit date des 30 derniers jours. */
  new_pilots_30d: number;
  matches_30d: number;
  races_30d: number;
  time_attacks_30d: number;
  /** Pilotes dont c'est le circuit favori. */
  fans: number;
  rating: number | null;
  reviews: number;
  reviews_30d: number;
  photos: number;
  corrections_open: number;
  sessions_upcoming: number;
  tournaments_live: number;
  weeks: { week: string; pilots: number; views: number }[];
  /** Pilotes les plus présents sur 90 jours. */
  regulars: { id: string; username: string; avatar_url: string | null; elo: number; rank: RankTier; count: number }[];
  record: { username: string; lap_ms: number; at: string } | null;
  events_upcoming: number;
  promos_active: number;
  interests_30d: number;
  reveals_30d: number;
  /** Événements à venir et promos en cours, avec l'intérêt suscité. */
  live: {
    id: string;
    kind: 'event' | 'promo';
    title: string;
    starts_at: string | null;
    ends_at: string | null;
    interests: number;
    reveals: number;
  }[];
};

const DAY = 86_400_000;

function demoStats(trackId: string): TrackStats {
  const busy = trackId === demoProfile.home_track_id;
  const scale = busy ? 1 : 0.4;
  const n = (v: number) => Math.round(v * scale);
  const week = (i: number) => new Date(Date.now() - i * 7 * DAY).toISOString();
  return {
    views_30d: n(412),
    views_prev_30d: n(338),
    viewers_30d: n(187),
    pilots_30d: n(64),
    pilots_prev_30d: n(52),
    pilots_total: n(231),
    new_pilots_30d: n(19),
    matches_30d: n(38),
    races_30d: n(9),
    time_attacks_30d: n(27),
    fans: n(87),
    rating: busy ? 4.3 : 3.9,
    reviews: n(31),
    reviews_30d: n(6),
    photos: n(14),
    corrections_open: busy ? 1 : 0,
    sessions_upcoming: n(3),
    tournaments_live: busy ? 1 : 0,
    weeks: [14, 17, 12, 21, 19, 26, 23, 28].map((pilots, i) => ({
      week: week(7 - i),
      pilots: n(pilots),
      views: n(pilots * 3.6 + i * 4),
    })),
    regulars: [demoPilots.p3, demoPilots.p1, demoPilots.p2].map((p, i) => ({
      id: p.id,
      username: p.username,
      avatar_url: p.avatar_url,
      elo: p.elo,
      rank: p.rank,
      count: [11, 8, 5][i],
    })),
    record: { username: demoPilots.p3.username, lap_ms: 23984, at: new Date(Date.now() - 12 * DAY).toISOString() },
    events_upcoming: busy ? 2 : 0,
    promos_active: busy ? 1 : 0,
    interests_30d: n(54),
    reveals_30d: n(37),
    live: busy
      ? [
          { id: 'ev-1', kind: 'event', title: 'Nocturne endurance 2 h', starts_at: new Date(Date.now() + 6 * DAY).toISOString(), ends_at: null, interests: 41, reveals: 0 },
          { id: 'ev-2', kind: 'promo', title: '−20 % le mardi soir', starts_at: null, ends_at: new Date(Date.now() + 15 * DAY).toISOString(), interests: 0, reveals: 37 },
          { id: 'ev-3', kind: 'event', title: 'Challenge des écuries', starts_at: new Date(Date.now() + 20 * DAY).toISOString(), ends_at: null, interests: 13, reveals: 0 },
        ]
      : [],
  };
}

export function useTrackStats(trackId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['track-stats', trackId],
    enabled: !!trackId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TrackStats> => {
      if (isDemoMode) return demoStats(trackId!);
      const { data, error } = await supabase.rpc('track_stats', { p_track: trackId });
      if (error) throw socialError(error);
      return data as TrackStats;
    },
  });
}

/** Compte une visite de la fiche (une par pilote et par jour, côté serveur). Jamais bloquant pour l'affichage. */
export function useLogTrackView(trackId: string | undefined) {
  useEffect(() => {
    if (!trackId || isDemoMode) return;
    supabase.rpc('log_track_view', { p_track: trackId }).then(
      () => undefined,
      () => undefined,
    );
  }, [trackId]);
}

/** Évolution en % par rapport à la période précédente ; null quand il n'y a pas de base de comparaison. */
export function trend(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
