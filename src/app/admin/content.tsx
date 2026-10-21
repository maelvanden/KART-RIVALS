import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { trackPhotoUrl, useAdminRoles } from '@/features/admin/api';
import { useAdminContent, useSetContentHidden, type AdminContent, type ContentFilter } from '@/features/admin/panel';
import { mediaUrl } from '@/features/feed/api';
import { RatingStars } from '@/features/tracks/components/rating-stars';
import { formatLapTime, formatMessageTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

const FILTERS: { value: ContentFilter; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'posts', label: 'Publications' },
  { value: 'comments', label: 'Commentaires' },
  { value: 'photos', label: 'Photos' },
  { value: 'reviews', label: 'Avis' },
  { value: 'reported', label: 'Signalés' },
  { value: 'hidden', label: 'Masqués' },
];

const KIND_LABEL: Record<AdminContent['kind'], string> = {
  post: 'Publication',
  comment: 'Commentaire',
  photo: 'Photo de circuit',
  review: 'Avis',
};

/** Modération de l'Actu : les derniers contenus des pilotes, masquables en un geste. */
export default function AdminContentScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const [filter, setFilter] = useState<ContentFilter>('all');
  const content = useAdminContent(filter, isAppAdmin);
  const toggle = useSetContentHidden();
  const items = content.data?.pages.flat() ?? [];

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  return (
    <Screen safeTop={false} refreshing={content.isRefetching} onRefresh={content.refetch}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTERS.map((f) => {
          const active = f.value === filter;
          return (
            <Pressable
              key={f.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(f.value)}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text variant="caption">
        Masquer retire le contenu pour tous les pilotes (son auteur le voit encore). C’est réversible et noté dans le journal.
      </Text>
      {toggle.error ? <Text style={styles.error}>{toggle.error.message}</Text> : null}
      {content.isPending ? <Loading /> : null}
      {content.error ? <ErrorState error={content.error} /> : null}
      {content.data && items.length === 0 ? <EmptyState title="Rien ici" message="Aucun contenu pour ce filtre." /> : null}
      {items.map((c) => (
        <ContentCard
          key={`${c.kind}-${c.id}`}
          item={c}
          busy={toggle.isPending && toggle.variables?.id === c.id}
          onToggle={() => toggle.mutate({ kind: c.kind, id: c.id, hidden: !c.hidden })}
        />
      ))}
      {content.hasNextPage ? (
        <Button title="Charger plus" variant="secondary" loading={content.isFetchingNextPage} onPress={() => content.fetchNextPage()} />
      ) : null}
    </Screen>
  );
}

function ContentCard({ item: c, busy, onToggle }: { item: AdminContent; busy: boolean; onToggle: () => void }) {
  const image =
    c.media_path && c.media_type === 'image' ? (c.kind === 'photo' ? trackPhotoUrl(c.media_path) : mediaUrl(c)) : null;
  const open = () =>
    c.post_id
      ? router.push({ pathname: '/feed/[id]', params: { id: c.post_id } })
      : c.track_id
        ? router.push({ pathname: '/track/[id]', params: { id: c.track_id } })
        : undefined;

  return (
    <Card style={[styles.card, c.hidden && styles.hiddenCard, c.report_count > 0 && !c.hidden && styles.reported]}>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/admin/pilot/[id]', params: { id: c.author_id } })}
          style={styles.author}>
          <Avatar username={c.author_username ?? '?'} url={c.author_avatar} size={32} borderColor={colors.border} />
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>{c.author_username ?? 'pilote supprimé'}</Text>
            <Text variant="caption" numberOfLines={1}>
              {KIND_LABEL[c.kind]} · {formatMessageTime(c.created_at)}
            </Text>
          </View>
        </Pressable>
        {c.report_count > 0 ? (
          <View style={styles.reports}>
            <Icon name={icons.report} size={12} color={colors.danger} />
            <Text style={styles.reportsText}>{c.report_count}</Text>
          </View>
        ) : null}
      </View>

      {c.track_name ? (
        <View style={styles.trackRow}>
          <Icon name={icons.pin} size={13} color={colors.textMuted} />
          <Text variant="caption" numberOfLines={1}>{c.track_name}</Text>
        </View>
      ) : null}
      {c.rating != null ? <RatingStars value={c.rating} /> : null}
      {c.lap_ms ? <Text style={styles.lap}>{formatLapTime(c.lap_ms)}</Text> : null}
      {c.body ? <Text style={c.kind === 'comment' ? styles.quote : undefined}>{c.body}</Text> : null}
      {image ? <Image source={{ uri: image }} style={styles.media} contentFit="cover" /> : null}
      {c.media_type === 'video' ? (
        <Pressable accessibilityRole="button" onPress={open} style={styles.video}>
          <Icon name={icons.play} size={22} color={colors.text} />
          <Text variant="caption">Vidéo : ouvrir la publication</Text>
        </Pressable>
      ) : null}

      {c.hidden ? (
        <View style={styles.hiddenTag}>
          <Icon name={icons.hidden} size={14} color={colors.textMuted} />
          <Text variant="caption">Masqué pour tous</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          title={c.hidden ? 'Rétablir' : 'Masquer'}
          variant={c.hidden ? 'ghost' : 'secondary'}
          icon={c.hidden ? undefined : <Icon name={icons.hidden} size={16} color={colors.text} />}
          loading={busy}
          style={styles.flex}
          onPress={onToggle}
        />
        {c.post_id || c.track_id ? <Button title="Voir" variant="quiet" onPress={open} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.neon, borderColor: colors.neon },
  chipText: { fontWeight: '800', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted },
  chipTextActive: { color: colors.onNeon },
  error: { color: colors.danger },
  card: { gap: spacing.sm },
  hiddenCard: { opacity: 0.6 },
  reported: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  name: { fontWeight: '800' },
  reports: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  reportsText: { fontSize: 12, fontWeight: '800', color: colors.danger },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lap: { fontSize: 22, fontWeight: '900', color: colors.neon },
  quote: { fontStyle: 'italic' },
  media: { width: '100%', height: 200, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  video: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  hiddenTag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
