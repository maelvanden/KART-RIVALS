import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { CarbonBackdrop } from '@/components/ui/carbon-backdrop';
import { Icon, icons } from '@/components/ui/icon';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { useAddComment, useComments, useDeleteComment, usePost, type PostComment } from '@/features/feed/api';
import { PostCard } from '@/features/feed/components/post-card';
import { timeAgo } from '@/features/feed/format';
import { ReportSheet } from '@/features/social/components/report-sheet';
import { confirmAction } from '@/lib/confirm';
import { colors, fonts, radius, spacing } from '@/theme';

/** Une publication et ses commentaires. */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const post = usePost(id);
  const comments = useComments(id);
  const add = useAddComment(id);
  const remove = useDeleteComment(id);
  const [draft, setDraft] = useState('');
  const [reporting, setReporting] = useState<PostComment | null>(null);
  const p = post.data;

  function send() {
    const body = draft.trim();
    if (!body) return;
    add.mutate(body, { onSuccess: () => setDraft('') });
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <CarbonBackdrop />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {post.isPending ? <Loading /> : null}
        {post.error ? <ErrorState error={post.error} /> : null}
        {post.data === null ? <EmptyState title="Publication introuvable" message="Elle a peut-être été supprimée." /> : null}
        {p ? <PostCard post={p} detail /> : null}

        {p ? (
          <>
            <Text variant="label">Commentaires</Text>
            {comments.data?.length === 0 ? <Text variant="caption">Sois le premier à commenter.</Text> : null}
            {comments.data?.map((c) => {
              const canDelete = c.author_id === userId || p.author_id === userId;
              return (
                <View key={c.id} style={styles.comment}>
                  <Pressable onPress={() => router.push({ pathname: '/pilot/[id]', params: { id: c.author_id } })}>
                    <Avatar username={c.author?.username ?? '?'} url={c.author?.avatar_url ?? null} size={34} borderColor={colors.border} />
                  </Pressable>
                  <View style={styles.commentBody}>
                    <View style={styles.commentHead}>
                      <Text style={styles.commentAuthor}>{c.author?.username ?? 'Pilote'}</Text>
                      <Text variant="caption">{timeAgo(c.created_at)}</Text>
                    </View>
                    <Text style={styles.commentText}>{c.body}</Text>
                    <View style={styles.commentActions}>
                      {canDelete ? (
                        <Text
                          variant="caption"
                          onPress={() => confirmAction('Supprimer le commentaire ?', '', 'Supprimer', () => remove.mutate(c.id))}>
                          Supprimer
                        </Text>
                      ) : null}
                      {c.author_id !== userId ? (
                        <Text variant="caption" onPress={() => setReporting(c)}>
                          Signaler
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>

      {p ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ajouter un commentaire…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            maxLength={500}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Envoyer"
            disabled={!draft.trim() || add.isPending}
            onPress={send}
            style={[styles.send, (!draft.trim() || add.isPending) && styles.sendDisabled]}>
            <Icon name={icons.send} size={20} color={colors.onNeon} />
          </Pressable>
        </View>
      ) : null}
      {add.error ? <Text style={styles.error}>{add.error.message}</Text> : null}

      <ReportSheet
        target={
          reporting && p
            ? { pilotId: reporting.author_id, username: reporting.author?.username ?? 'ce pilote', postId: p.id, commentId: reporting.id, preview: reporting.body }
            : null
        }
        onClose={() => setReporting(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  comment: { flexDirection: 'row', gap: spacing.md },
  commentBody: { flex: 1, gap: 3, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  commentAuthor: { fontWeight: '800', flex: 1 },
  commentText: { lineHeight: 21 },
  commentActions: { flexDirection: 'row', gap: spacing.md, justifyContent: 'flex-end' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    fontFamily: fonts.medium,
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : {}),
  },
  send: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
  error: { color: colors.danger, paddingHorizontal: spacing.lg },
});
