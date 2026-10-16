import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { TeamCrest } from '@/features/social/components/team-crest';
import { TeamTag } from '@/features/social/components/team-tag';
import { useConversations } from '@/features/social/radio';
import { formatMessageTime } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import type { Conversation } from '@/types/models';

/** Radio Paddock : canal de l'écurie et conversations 1v1 avec les coéquipiers. */
export default function RadioListScreen() {
  const conversations = useConversations();

  return (
    <Screen safeTop={false} refreshing={conversations.isRefetching} onRefresh={conversations.refetch}>
      {conversations.isPending ? <Loading /> : null}
      {conversations.error ? <ErrorState error={conversations.error} /> : null}
      {conversations.data?.length === 0 ? (
        <>
          <EmptyState
            title="Radio silencieuse"
            message="Rejoins une écurie ou ouvre la radio depuis la liste de tes coéquipiers pour commencer à échanger."
          />
          <Button title="Mes coéquipiers" variant="secondary" onPress={() => router.push('/friends')} />
        </>
      ) : null}
      <View style={styles.list}>
        {conversations.data?.map((c) => (
          <ConversationRow key={c.id} conversation={c} />
        ))}
      </View>
    </Screen>
  );
}

function ConversationRow({ conversation: c }: { conversation: Conversation }) {
  const unread = c.unread > 0;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/radio/[id]', params: { id: c.id } })}
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.pressed]}>
      {c.kind === 'team' ? (
        <TeamCrest tag={c.tag ?? '?'} logoUrl={c.avatar_url} size={42} />
      ) : (
        <Avatar username={c.title} url={c.avatar_url} size={44} borderColor={colors.borderStrong} />
      )}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          {c.kind === 'direct' ? <TeamTag pilotId={c.other_id} /> : null}
          <Text variant="heading" numberOfLines={1} style={styles.title}>
            {c.kind === 'team' ? `[${c.tag}] ${c.title}` : c.title}
          </Text>
          {c.last_message_at ? <Text variant="caption">{formatMessageTime(c.last_message_at)}</Text> : null}
        </View>
        <View style={styles.titleRow}>
          <Text variant="caption" numberOfLines={1} style={[styles.preview, unread && styles.previewUnread]}>
            {c.last_message ?? (c.kind === 'team' ? 'Canal de l’écurie ouvert' : 'Lance la conversation')}
          </Text>
          {unread ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{c.unread > 99 ? '99+' : c.unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowUnread: { borderLeftWidth: 3, borderLeftColor: colors.neon },
  pressed: { opacity: 0.8 },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: 17, lineHeight: 22 },
  preview: { flex: 1 },
  previewUnread: { color: colors.text },
  badge: { minWidth: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontFamily: fonts.display, fontSize: 13, color: colors.onNeon },
});
