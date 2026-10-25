import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CarbonBackdrop } from '@/components/ui/carbon-backdrop';
import { Icon, icons, type IconName } from '@/components/ui/icon';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { AnnouncementBanner } from '@/features/admin/components/announcement-banner';
import { useFeed, type FeedFilter } from '@/features/feed/api';
import { PostCard } from '@/features/feed/components/post-card';
import { colors, radius, spacing } from '@/theme';

const FILTERS: { value: FeedFilter; label: string; icon: IconName }[] = [
  { value: 'all', label: 'Tout', icon: icons.explore },
  { value: 'friends', label: 'Coéquipiers', icon: icons.teammates },
  { value: 'records', label: 'Records', icon: icons.medal },
  { value: 'certified', label: 'Certifiés', icon: icons.verified },
];

/** Actualité : chronos, records, photos et vidéos des pilotes. */
export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const feed = useFeed(filter);
  const posts = feed.data?.pages.flat() ?? [];

  return (
    <View style={styles.screen}>
      <CarbonBackdrop />
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, { paddingTop: insets.top + spacing.md }]}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} tintColor={colors.neon} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.kicker}>
              <View style={styles.kickerBar} />
              <Text variant="label" style={styles.kickerText}>
                Le paddock en direct
              </Text>
            </View>
            <Text variant="display">Actualité</Text>
            <AnnouncementBanner />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {FILTERS.map((f) => {
                const active = f.value === filter;
                return (
                  <Pressable
                    key={f.value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => setFilter(f.value)}
                    style={[styles.filter, active && styles.filterActive]}>
                    <Icon name={f.icon} size={16} color={active ? colors.neon : colors.textMuted} />
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {feed.isPending ? <Loading /> : null}
            {feed.error ? <ErrorState error={feed.error} /> : null}
            {feed.data && posts.length === 0 ? (
              <EmptyState
                title={filter === 'all' ? 'Rien pour l’instant' : 'Aucune publication ici'}
                message="Partage ton dernier chrono, une photo ou une vidéo de ta session."
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => <PostCard post={item} />}
        ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator color={colors.neon} /> : <View style={{ height: 90 }} />}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Publier"
        onPress={() => router.push('/feed/new')}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
        <Icon name={icons.plus} size={22} color={colors.onNeon} />
        <Text style={styles.fabText}>Publier</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  header: { gap: spacing.md },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kickerBar: { width: 18, height: 3, backgroundColor: colors.neon },
  kickerText: { color: colors.neon },
  filters: { gap: spacing.sm, paddingVertical: spacing.xs },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterActive: { borderColor: colors.neon },
  filterText: { fontWeight: '700', color: colors.textMuted },
  filterTextActive: { color: colors.text },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.neon,
  },
  fabText: { fontWeight: '900', fontSize: 16, color: colors.onNeon },
  pressed: { opacity: 0.85 },
});
