import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { socialError } from '@/features/social/errors';
import { demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { ReportReason } from '@/types/models';

export type ReviewScores = { track: number; karts: number; staff: number; price: number };
export type TrackRating = ReviewScores & { reviews: number; overall: number };
export type TrackReview = {
  id: string;
  track_id: string;
  author_id: string;
  track_score: number;
  karts_score: number;
  staff_score: number;
  price_score: number;
  comment: string | null;
  hidden_at: string | null;
  updated_at: string;
  author: { username: string; avatar_url: string | null } | null;
};

export const CRITERIA: { key: keyof ReviewScores; label: string }[] = [
  { key: 'track', label: 'Piste' },
  { key: 'karts', label: 'Karts' },
  { key: 'staff', label: 'Accueil' },
  { key: 'price', label: 'Prix' },
];

export const reviewOverall = (r: Pick<TrackReview, 'track_score' | 'karts_score' | 'staff_score' | 'price_score'>) =>
  (r.track_score + r.karts_score + r.staff_score + r.price_score) / 4;

// ---------- Mode démo ----------
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const demoReviews: TrackReview[] = [
  {
    id: 'rv-1', track_id: 't1', author_id: 'p3', track_score: 4, karts_score: 5, staff_score: 5, price_score: 3,
    comment: 'Le pont au-dessus de la piste est génial et les karts bien entretenus. Un peu cher le week-end.',
    hidden_at: null, updated_at: daysAgo(3), author: { username: 'ApexHunter', avatar_url: null },
  },
  {
    id: 'rv-2', track_id: 't1', author_id: 'p1', track_score: 4, karts_score: 4, staff_score: 5, price_score: 4,
    comment: 'Accueil top, briefing clair. Piste courte mais technique.',
    hidden_at: null, updated_at: daysAgo(10), author: { username: 'TurboLéa', avatar_url: null },
  },
  {
    id: 'rv-3', track_id: 't3', author_id: 'p2', track_score: 5, karts_score: 4, staff_score: 4, price_score: 4,
    comment: 'La plus grande piste indoor du coin, les épingles sont un régal.',
    hidden_at: null, updated_at: daysAgo(6), author: { username: 'Drift_Max', avatar_url: null },
  },
];

function ratingsOf(list: TrackReview[]): Record<string, TrackRating> {
  const byTrack: Record<string, TrackReview[]> = {};
  for (const r of list.filter((x) => !x.hidden_at)) (byTrack[r.track_id] ??= []).push(r);
  const avg = (rs: TrackReview[], f: (r: TrackReview) => number) => Math.round((rs.reduce((s, r) => s + f(r), 0) / rs.length) * 10) / 10;
  return Object.fromEntries(
    Object.entries(byTrack).map(([id, rs]) => [
      id,
      {
        reviews: rs.length,
        overall: avg(rs, reviewOverall),
        track: avg(rs, (r) => r.track_score),
        karts: avg(rs, (r) => r.karts_score),
        staff: avg(rs, (r) => r.staff_score),
        price: avg(rs, (r) => r.price_score),
      },
    ]),
  );
}

// ---------- Lecture ----------

/** Moyennes des avis de chaque circuit (circuit → note). */
export function useTrackRatings() {
  return useQuery({
    queryKey: ['track-ratings'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, TrackRating>> => {
      if (isDemoMode) return ratingsOf(demoReviews);
      const { data, error } = await supabase.rpc('track_ratings');
      if (error) throw error;
      const rows = data as ({ track_id: string } & Record<keyof TrackRating, number | string>)[];
      return Object.fromEntries(
        rows.map((r) => [
          r.track_id,
          {
            reviews: Number(r.reviews),
            overall: Number(r.overall),
            track: Number(r.track),
            karts: Number(r.karts),
            staff: Number(r.staff),
            price: Number(r.price),
          },
        ]),
      );
    },
  });
}

/** Avis d'un circuit, les plus récents d'abord (le mien même s'il est masqué). */
export function useTrackReviews(trackId: string | undefined) {
  return useQuery({
    queryKey: ['track-reviews', trackId],
    enabled: !!trackId,
    queryFn: async (): Promise<TrackReview[]> => {
      if (isDemoMode) return demoReviews.filter((r) => r.track_id === trackId).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      const { data, error } = await supabase
        .from('track_reviews')
        .select(
          `id, track_id, author_id, track_score, karts_score, staff_score, price_score, comment, hidden_at, updated_at,
           author:profiles!track_reviews_author_id_fkey (username, avatar_url)`,
        )
        .eq('track_id', trackId!)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as TrackReview[];
    },
  });
}

// ---------- Écriture ----------
function useInvalidateReviews() {
  const queryClient = useQueryClient();
  return () => ['track-reviews', 'track-ratings'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
}

export function useSaveReview(trackId: string) {
  const invalidate = useInvalidateReviews();
  const { userId } = useAuth();
  return useMutation({
    mutationFn: async ({ scores, comment }: { scores: ReviewScores; comment: string }) => {
      if (isDemoMode) {
        const existing = demoReviews.find((r) => r.track_id === trackId && r.author_id === demoProfile.id);
        const fields = {
          track_score: scores.track,
          karts_score: scores.karts,
          staff_score: scores.staff,
          price_score: scores.price,
          comment: comment.trim() || null,
          updated_at: new Date().toISOString(),
        };
        if (existing) Object.assign(existing, fields);
        else
          demoReviews.push({
            id: `rv-${Date.now()}`,
            track_id: trackId,
            author_id: userId ?? demoProfile.id,
            hidden_at: null,
            author: { username: demoProfile.username, avatar_url: demoProfile.avatar_url },
            ...fields,
          });
        return;
      }
      const { error } = await supabase.rpc('save_track_review', {
        p_track_id: trackId,
        p_track: scores.track,
        p_karts: scores.karts,
        p_staff: scores.staff,
        p_price: scores.price,
        p_comment: comment.trim() || null,
      });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteReview() {
  const invalidate = useInvalidateReviews();
  return useMutation({
    mutationFn: async (reviewId: string) => {
      if (isDemoMode) {
        const i = demoReviews.findIndex((r) => r.id === reviewId);
        if (i >= 0) demoReviews.splice(i, 1);
        return;
      }
      const { error } = await supabase.from('track_reviews').delete().eq('id', reviewId);
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

/** Signale un avis ; masqué pour tous après 3 signalements. */
export function useReportReview() {
  return useMutation({
    mutationFn: async ({ reviewId, reason, details }: { reviewId: string; reason: ReportReason; details?: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase.rpc('report_track_review', {
        p_review_id: reviewId,
        p_reason: reason,
        p_details: details?.trim() || null,
      });
      if (error) throw socialError(error);
    },
  });
}
