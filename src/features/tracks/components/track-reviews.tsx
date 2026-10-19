import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { ReportSheet } from '@/features/social/components/report-sheet';
import { RatingStars, StarInput } from '@/features/tracks/components/rating-stars';
import {
  CRITERIA,
  reviewOverall,
  useDeleteReview,
  useSaveReview,
  useTrackRatings,
  useTrackReviews,
  type ReviewScores,
  type TrackReview,
} from '@/features/tracks/reviews';
import { confirmAction } from '@/lib/confirm';
import { colors, fonts, spacing } from '@/theme';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** Avis des pilotes sur un circuit : moyennes par critère, avis, et le mien à donner ou modifier. */
export function TrackReviews({ trackId, trackName }: { trackId: string; trackName: string }) {
  const { userId } = useAuth();
  const rating = useTrackRatings().data?.[trackId];
  const reviews = useTrackReviews(trackId);
  const remove = useDeleteReview();
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState<TrackReview | null>(null);
  const mine = reviews.data?.find((r) => r.author_id === userId);
  const others = (reviews.data ?? []).filter((r) => r.author_id !== userId);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text variant="label" style={styles.title}>
          Avis des pilotes
        </Text>
        {rating ? <Text variant="label">{rating.reviews}</Text> : null}
      </View>

      {rating ? (
        <Card style={styles.summary}>
          <View style={styles.overall}>
            <Text style={styles.score}>{rating.overall.toLocaleString('fr-FR')}</Text>
            <RatingStars value={rating.overall} size={16} />
            <Text variant="caption">
              {rating.reviews} avis
            </Text>
          </View>
          <View style={styles.criteria}>
            {CRITERIA.map((c) => (
              <View key={c.key} style={styles.criterion}>
                <Text style={styles.criterionLabel}>{c.label}</Text>
                <View style={styles.bar}>
                  <View style={[styles.fill, { width: `${(rating[c.key] / 5) * 100}%` }]} />
                </View>
                <Text style={styles.criterionValue}>{rating[c.key].toLocaleString('fr-FR')}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : reviews.data ? (
        <Text variant="caption">Pas encore d’avis : sois le premier à noter {trackName}.</Text>
      ) : null}

      {mine ? (
        <ReviewItem
          review={mine}
          mine
          onEdit={() => setEditing(true)}
          onDelete={() => confirmAction('Supprimer ton avis ?', 'Il ne comptera plus dans la note du circuit.', 'Supprimer', () => remove.mutate(mine.id))}
        />
      ) : (
        <Button
          title="Donner mon avis"
          variant="secondary"
          icon={<Icon name={icons.star} size={18} color={colors.text} />}
          onPress={() => setEditing(true)}
        />
      )}
      {others.slice(0, 10).map((r) => (
        <ReviewItem key={r.id} review={r} onReport={() => setReporting(r)} />
      ))}

      <ReviewSheet key={mine ? `${mine.id}-${mine.updated_at}` : 'new'} visible={editing} onClose={() => setEditing(false)} trackId={trackId} trackName={trackName} existing={mine} />
      <ReportSheet
        target={
          reporting
            ? { pilotId: reporting.author_id, username: reporting.author?.username ?? 'ce pilote', reviewId: reporting.id, preview: reporting.comment ?? undefined }
            : null
        }
        onClose={() => setReporting(null)}
      />
    </View>
  );
}

function ReviewItem({
  review: r,
  mine,
  onEdit,
  onDelete,
  onReport,
}: {
  review: TrackReview;
  mine?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
}) {
  return (
    <Card style={[styles.item, mine && styles.itemMine]}>
      <View style={styles.itemHead}>
        <Text style={styles.author}>{mine ? 'Ton avis' : (r.author?.username ?? 'Pilote')}</Text>
        <RatingStars value={reviewOverall(r)} />
        <Text variant="caption">{dateFmt.format(new Date(r.updated_at))}</Text>
      </View>
      <Text variant="caption">
        Piste {r.track_score} · Karts {r.karts_score} · Accueil {r.staff_score} · Prix {r.price_score}
      </Text>
      {r.comment ? <Text style={styles.comment}>{r.comment}</Text> : null}
      {mine && r.hidden_at ? <Text style={styles.hidden}>Masqué après signalements : visible par toi seul.</Text> : null}
      {mine ? (
        <View style={styles.actions}>
          <Button title="Modifier" variant="quiet" onPress={onEdit} />
          <Button title="Supprimer" variant="quiet" onPress={onDelete} />
        </View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Signaler cet avis" onPress={onReport} hitSlop={8} style={styles.report}>
          <Icon name={icons.report} size={13} color={colors.textMuted} />
          <Text variant="caption">Signaler</Text>
        </Pressable>
      )}
    </Card>
  );
}

function ReviewSheet({
  visible,
  onClose,
  trackId,
  trackName,
  existing,
}: {
  visible: boolean;
  onClose: () => void;
  trackId: string;
  trackName: string;
  existing?: TrackReview;
}) {
  const save = useSaveReview(trackId);
  const [scores, setScores] = useState<ReviewScores>({
    track: existing?.track_score ?? 0,
    karts: existing?.karts_score ?? 0,
    staff: existing?.staff_score ?? 0,
    price: existing?.price_score ?? 0,
  });
  const [comment, setComment] = useState(existing?.comment ?? '');
  const complete = CRITERIA.every((c) => scores[c.key] > 0);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`Noter ${trackName}`} leading={<Icon name={icons.star} color="#FFC83D" />}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {CRITERIA.map((c) => (
          <View key={c.key} style={styles.inputRow}>
            <Text style={styles.inputLabel}>{c.label}</Text>
            <StarInput label={c.label} value={scores[c.key]} onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))} />
          </View>
        ))}
        <Input
          label="Commentaire (facultatif)"
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={600}
          placeholder="Ce qui t’a plu, ce qui pourrait être mieux…"
          style={styles.multiline}
        />
        {save.error ? <Text style={styles.error}>{save.error.message}</Text> : null}
        <Button
          title={existing ? 'Mettre à jour' : 'Publier mon avis'}
          disabled={!complete}
          loading={save.isPending}
          onPress={() => save.mutate({ scores, comment }, { onSuccess: onClose })}
        />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  summary: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  overall: { alignItems: 'center', gap: 4 },
  score: { fontFamily: fonts.display, fontSize: 40, lineHeight: 50, color: '#FFC83D' },
  criteria: { flex: 1, gap: 6 },
  criterion: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  criterionLabel: { width: 60, fontSize: 13, fontWeight: '700' },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#FFC83D' },
  criterionValue: { width: 28, textAlign: 'right', fontSize: 13, fontWeight: '800' },
  item: { gap: 6 },
  itemMine: { borderColor: colors.neon },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  author: { flex: 1, fontWeight: '800' },
  comment: { lineHeight: 21 },
  hidden: { color: colors.orange, fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  report: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  form: { gap: spacing.md, paddingBottom: spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inputLabel: { fontWeight: '800', fontSize: 16 },
  multiline: { minHeight: 90, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
});
