import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { mediaUrl, REACTIONS, useDeletePost, useToggleReaction, type FeedPost } from '@/features/feed/api';
import { ChronoBlock } from '@/features/feed/components/chrono-block';
import { FeedVideo } from '@/features/feed/components/feed-video';
import { splitLap, timeAgo } from '@/features/feed/format';
import { VerifiedBadge } from '@/features/profile/components/verified-badge';
import { ReportSheet } from '@/features/social/components/report-sheet';
import { TeamTag } from '@/features/social/components/team-tag';
import { confirmAction } from '@/lib/confirm';
import { colors, radius, rankMeta, spacing } from '@/theme';

const GOLD = '#FFC83D';

type Props = { post: FeedPost; detail?: boolean };

/** Publication du fil : auteur, circuit, chrono, média, texte, j'aime / réactions / commentaires / partage. */
export function PostCard({ post: p, detail }: Props) {
  const { userId } = useAuth();
  const react = useToggleReaction();
  const remove = useDeletePost();
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const mine = p.author_id === userId;
  const liked = p.my_reactions.includes('like');
  const url = mediaUrl(p);
  const ratio = p.media_width && p.media_height ? Math.min(Math.max(p.media_width / p.media_height, 0.8), 1.9) : 16 / 9;
  const open = () => !detail && router.push({ pathname: '/feed/[id]', params: { id: p.id } });

  function share() {
    const lap = p.lap_ms ? splitLap(p.lap_ms) : null;
    const parts = [
      `${p.author_username} sur Kart Rivals`,
      lap ? `⏱ ${lap.main}${lap.ms}${p.track_name ? ` à ${p.track_name}` : ''}${p.is_record ? ' (record du circuit)' : ''}` : p.track_name,
      p.caption,
    ].filter(Boolean);
    Share.share({ message: parts.join('\n') });
  }

  return (
    <View style={[styles.card, p.is_record && styles.record]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push({ pathname: '/pilot/[id]', params: { id: p.author_id } })}>
          <Avatar username={p.author_username} url={p.author_avatar} size={46} borderColor={rankMeta[p.author_rank].color} />
        </Pressable>
        <View style={styles.headText}>
          <View style={styles.nameRow}>
            <TeamTag pilotId={p.author_id} />
            <Text style={styles.name} numberOfLines={1} onPress={() => router.push({ pathname: '/pilot/[id]', params: { id: p.author_id } })}>
              {p.author_username}
            </Text>
            <VerifiedBadge pilotId={p.author_id} />
            {p.is_record ? <Text style={styles.recordTag}>Record</Text> : null}
          </View>
          <Text variant="caption" numberOfLines={1}>
            {p.track_name ? (
              <Text variant="caption" onPress={() => p.track_id && router.push({ pathname: '/track/[id]', params: { id: p.track_id } })}>
                📍 {p.track_name} ·{' '}
              </Text>
            ) : null}
            {timeAgo(p.created_at)}
          </Text>
        </View>
        <Pressable accessibilityLabel="Options" hitSlop={12} onPress={() => setMenu(true)}>
          <Icon name={icons.more} size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      <Pressable onPress={open} disabled={detail} style={styles.body}>
        <ChronoBlock post={p} />
        {url && p.media_type === 'image' ? (
          <Image source={{ uri: url }} style={[styles.media, { aspectRatio: ratio }]} contentFit="cover" transition={150} />
        ) : null}
      </Pressable>
      {url && p.media_type === 'video' ? <FeedVideo url={url} ratio={ratio} /> : null}
      {p.caption ? (
        <Text style={styles.caption} numberOfLines={detail ? undefined : 6} onPress={open}>
          {p.caption}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="J’aime" hitSlop={6} onPress={() => react.mutate({ post: p, kind: 'like' })} style={styles.action}>
          <Icon name={liked ? icons.heartFill : icons.heart} size={22} color={liked ? colors.danger : colors.textMuted} />
          <Text style={styles.count}>{p.reactions.like ?? 0}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Commentaires" hitSlop={6} onPress={open} style={styles.action}>
          <Icon name={icons.comment} size={20} color={colors.textMuted} />
          <Text style={styles.count}>{p.comments}</Text>
        </Pressable>
        {REACTIONS.map((r) => {
          const on = p.my_reactions.includes(r.kind);
          const n = p.reactions[r.kind] ?? 0;
          return (
            <Pressable
              key={r.kind}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              onPress={() => react.mutate({ post: p, kind: r.kind })}
              style={[styles.reaction, on && styles.reactionOn]}>
              <Text style={styles.emoji}>{r.emoji}</Text>
              {n > 0 ? <Text style={[styles.reactionCount, on && styles.reactionCountOn]}>{n}</Text> : null}
            </Pressable>
          );
        })}
        <View style={styles.flex} />
        <Pressable accessibilityRole="button" accessibilityLabel="Partager" hitSlop={8} onPress={share}>
          <Icon name={icons.share} size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <BottomSheet visible={menu} onClose={() => setMenu(false)} title="Publication">
        <View style={styles.menu}>
          {mine ? (
            <MenuRow
              icon={icons.trash}
              label="Supprimer la publication"
              onPress={() => {
                setMenu(false);
                confirmAction('Supprimer ?', 'La publication disparaîtra du fil.', 'Supprimer', () =>
                  remove.mutate(p, { onSuccess: () => detail && router.back() }),
                );
              }}
            />
          ) : (
            <MenuRow
              icon={icons.report}
              label="Signaler la publication"
              onPress={() => {
                setMenu(false);
                setReporting(true);
              }}
            />
          )}
          <MenuRow
            icon={icons.share}
            label="Partager"
            neutral
            onPress={() => {
              setMenu(false);
              share();
            }}
          />
        </View>
      </BottomSheet>
      <ReportSheet
        target={reporting ? { pilotId: p.author_id, username: p.author_username, postId: p.id, preview: p.caption ?? undefined } : null}
        onClose={() => setReporting(false)}
      />
    </View>
  );
}

function MenuRow({ icon, label, onPress, neutral }: { icon: (typeof icons)[keyof typeof icons]; label: string; onPress: () => void; neutral?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}>
      <Icon name={icon} size={18} color={neutral ? colors.text : colors.danger} />
      <Text style={[styles.menuLabel, !neutral && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  record: { borderColor: 'rgba(255,200,61,0.5)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headText: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontWeight: '800', fontSize: 16, flexShrink: 1 },
  recordTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: GOLD,
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  body: { gap: spacing.md },
  media: { width: '100%', borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  caption: { fontSize: 15, lineHeight: 22 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  count: { color: colors.textMuted, fontWeight: '700' },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
  },
  reactionOn: { backgroundColor: 'rgba(255,107,26,0.18)', borderWidth: 1, borderColor: colors.orange },
  emoji: { fontSize: 15 },
  reactionCount: { fontSize: 12, fontWeight: '800', color: colors.textMuted },
  reactionCountOn: { color: colors.orange },
  flex: { flex: 1 },
  menu: { gap: spacing.sm, paddingBottom: spacing.sm },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  menuLabel: { fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
