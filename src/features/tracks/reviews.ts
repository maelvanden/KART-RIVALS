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
  /** Réponse publique du circuit, signée du circuit et non du compte qui l'a écrite. */
  reply: ReviewReply | null;
};
export type ReviewReply = { body: string; created_at: string; updated_at: string };

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
    reply: { body: 'Merci Apex ! On garde un œil sur les tarifs du week-end, une formule trois sessions arrive en décembre.', created_at: daysAgo(2), updated_at: daysAgo(2) },
  },
  {
    id: 'rv-2', track_id: 't1', author_id: 'p1', track_score: 4, karts_score: 4, staff_score: 5, price_score: 4,
    comment: 'Accueil top, briefing clair. Piste courte mais technique.',
    hidden_at: null, updated_at: daysAgo(10), author: { username: 'TurboLéa', avatar_url: null }, reply: null,
  },
  {
    id: 'rv-3', track_id: 't3', author_id: 'p2', track_score: 5, karts_score: 4, staff_score: 4, price_score: 4,
    comment: 'La plus grande piste indoor du coin, les épingles sont un régal.',
    hidden_at: null, updated_at: daysAgo(6), author: { username: 'Drift_Max', avatar_url: null }, reply: null,
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
      // Des copies : la démo modifie ses avis en place, sans quoi le cache ne verrait aucun changement.
      if (isDemoMode) {
        return demoReviews
          .filter((r) => r.track_id === trackId)
          .map((r) => ({ ...r, reply: r.reply ? { ...r.reply } : null }))
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      }
      const { data, error } = await supabase
        .from('track_reviews')
        .select(
          `id, track_id, author_id, track_score, karts_score, staff_score, price_score, comment, hidden_at, updated_at,
           author:profiles!track_reviews_author_id_fkey (username, avatar_url),
           reply:track_review_replies (body, created_at, updated_at)`,
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
            reply: null,
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

export const REPLY_MIN = 3;
export const REPLY_MAX = 500;

const REPLY_ERRORS: Record<string, string> = {
  'Reply must be 3 to 500 characters': `La réponse doit faire entre ${REPLY_MIN} et ${REPLY_MAX} caractères.`,
  'Review not found': 'Cet avis n’est plus disponible.',
  'Reply not found': 'Cette réponse n’existe plus.',
};

function replyError(error: { message: string }): Error {
  const known = Object.entries(REPLY_ERRORS).find(([code]) => error.message.includes(code));
  return known ? new Error(known[1]) : socialError(error);
}

/** Répond à un avis au nom du circuit (admins du circuit et admins appli) ; modifie la réponse si elle existe déjà. */
export function useReplyToReview() {
  const invalidate = useInvalidateReviews();
  return useMutation({
    mutationFn: async ({ reviewId, body }: { reviewId: string; body: string }) => {
      const text = body.trim();
      if (text.length < REPLY_MIN || text.length > REPLY_MAX) throw new Error(REPLY_ERRORS['Reply must be 3 to 500 characters']);
      if (isDemoMode) {
        const review = demoReviews.find((r) => r.id === reviewId);
        if (!review) throw new Error(REPLY_ERRORS['Review not found']);
        const now = new Date().toISOString();
        review.reply = { body: text, created_at: review.reply?.created_at ?? now, updated_at: now };
        return;
      }
      const { error } = await supabase.rpc('reply_to_review', { p_review_id: reviewId, p_body: text });
      if (error) throw replyError(error);
    },
    onSuccess: invalidate,
  });
}

/** Retire une réponse : son auteur (admins du circuit), ou l'équipe Kart Rivals si elle est inappropriée. */
export function useDeleteReply() {
  const invalidate = useInvalidateReviews();
  return useMutation({
    mutationFn: async (reviewId: string) => {
      if (isDemoMode) {
        const review = demoReviews.find((r) => r.id === reviewId);
        if (review) review.reply = null;
        return;
      }
      const { error } = await supabase.rpc('delete_review_reply', { p_review_id: reviewId });
      if (error) throw replyError(error);
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
