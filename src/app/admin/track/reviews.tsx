import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles, useCanManageTrack } from '@/features/admin/api';
import { RatingStars } from '@/features/tracks/components/rating-stars';
import { ReviewReply } from '@/features/tracks/components/review-reply';
import { useTrack } from '@/features/tracks/api';
import { reviewOverall, useTrackReviews, type TrackReview } from '@/features/tracks/reviews';
import { colors, spacing } from '@/theme';

type Filter = 'open' | 'all';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** Avis des pilotes sur un circuit, pour y répondre : ceux sans réponse d'abord. Admins du circuit et admins appli. */
export default function TrackReviewsAdminScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const track = useTrack(id);
  const roles = useAdminRoles();
  const canManage = useCanManageTrack(id);
  const reviews = useTrackReviews(id);
  const [filter, setFilter] = useState<Filter>('open');

  const all = reviews.data ?? [];
  const unanswered = all.filter((r) => !r.reply);
  const shown = filter === 'open' ? unanswered : all;
  const name = track.data?.name ?? 'ce circuit';

  return (
    <Screen safeTop={false} refreshing={reviews.isRefetching} onRefresh={reviews.refetch}>
      <Stack.Screen options={{ title: track.data ? `Avis · ${track.data.name}` : 'Avis des pilotes' }} />
      {roles.isPending || track.isPending ? <Loading /> : null}
      {roles.data && !canManage ? (
        <EmptyState title="Accès réservé" message="Seuls les admins de ce karting et les admins appli répondent aux avis." />
      ) : null}
      {canManage ? (
        <>
          <Text variant="caption">
            Ta réponse est publique et signée « {name} » : elle apparaît sous l’avis, pour tous les pilotes. Le pilote est
            prévenu à la première réponse. Reste courtois, même si l’avis est sévère.
          </Text>
          <Segmented
            options={[
              { value: 'open', label: `Sans réponse · ${unanswered.length}` },
              { value: 'all', label: `Tous · ${all.length}` },
            ]}
            value={filter}
            onChange={setFilter}
          />
          {reviews.isPending ? <Loading /> : null}
          {reviews.error ? <ErrorState error={reviews.error} /> : null}
          {reviews.data && shown.length === 0 ? (
            <EmptyState
              title={filter === 'open' ? 'Tous les avis ont une réponse' : 'Aucun avis pour l’instant'}
              message={filter === 'open' ? 'Bravo : les pilotes voient que le circuit les écoute. 🏁' : undefined}
            />
          ) : null}
          {shown.map((r) => (
            <ReviewCard key={`${r.id}-${r.reply?.updated_at ?? 'none'}`} review={r} trackId={id} trackName={name} />
          ))}
          {all.length === 50 ? <Text variant="caption">Les 50 avis les plus récents.</Text> : null}
        </>
      ) : null}
    </Screen>
  );
}

function ReviewCard({ review: r, trackId, trackName }: { review: TrackReview; trackId: string; trackName: string }) {
  return (
    <Card style={[styles.card, !r.reply && styles.open]}>
      <View style={styles.head}>
        <Text style={styles.author}>{r.author?.username ?? 'Pilote'}</Text>
        <RatingStars value={reviewOverall(r)} />
        <Text variant="caption">{dateFmt.format(new Date(r.updated_at))}</Text>
      </View>
      <Text variant="caption">
        Piste {r.track_score} · Karts {r.karts_score} · Accueil {r.staff_score} · Prix {r.price_score}
      </Text>
      {r.comment ? <Text style={styles.comment}>{r.comment}</Text> : <Text variant="caption">Notes seules, sans commentaire.</Text>}
      <ReviewReply review={r} trackId={trackId} trackName={trackName} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  open: { borderLeftWidth: 3, borderLeftColor: colors.orange },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  author: { flex: 1, fontWeight: '800' },
  comment: { lineHeight: 21 },
});
