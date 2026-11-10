import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { TeamCrest } from '@/features/social/components/team-crest';
import { TeamTag } from '@/features/social/components/team-tag';
import { useConversations, useOpenSupport } from '@/features/social/radio';
import { useMyTeam } from '@/features/social/teams';
import { formatMessageTime } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import type { Conversation } from '@/types/models';

/** Radio Paddock : canal de l'écurie, conversations 1v1 avec les coéquipiers et conversation avec l'équipe. */
export default function RadioListScreen() {
  const conversations = useConversations();
  const openSupport = useOpenSupport();
  const hasSupport = conversations.data?.some((c) => c.kind === 'support');

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
      {conversations.data && !hasSupport ? (
        <Button
          title="Contacter l’équipe Kart Rivals"
          variant="ghost"
          loading={openSupport.isPending}
          onPress={() =>
            openSupport.mutate(undefined, { onSuccess: (id) => router.push({ pathname: '/radio/[id]', params: { id } }) })
          }
        />
      ) : null}
      {openSupport.error ? <Text style={styles.error}>{openSupport.error.message}</Text> : null}
    </Screen>
  );
}

function ConversationRow({ conversation: c }: { conversation: Conversation }) {
  // Le seul canal d'écurie de la liste est celui de mon écurie : on reprend sa couleur.
  const team = useMyTeam().data;
  const unread = c.unread > 0;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/radio/[id]', params: { id: c.id } })}
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.pressed]}>
      {c.kind === 'team' ? (
        <TeamCrest tag={c.tag ?? '?'} logoUrl={c.avatar_url} color={team?.id === c.team_id ? team.color : null} size={42} />
      ) : c.kind === 'support' ? (
        <View style={styles.supportBadge}>
          <Icon name={icons.support} size={22} color={colors.onNeon} />
        </View>
      ) : c.kind === 'tournament' ? (
        <View style={[styles.supportBadge, styles.tournamentBadge]}>
          <Icon name={icons.trophy} size={22} color={colors.neon} />
        </View>
      ) : (
        <Avatar username={c.title} url={c.avatar_url} size={44} borderColor={colors.borderStrong} />
      )}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          {c.kind === 'direct' ? <TeamTag pilotId={c.other_id} /> : null}
          <Text variant="heading" numberOfLines={1} style={styles.title}>
            {c.title}
          </Text>
          {c.last_message_at ? <Text variant="caption">{formatMessageTime(c.last_message_at)}</Text> : null}
        </View>
        <View style={styles.titleRow}>
          <Text variant="caption" numberOfLines={1} style={[styles.preview, unread && styles.previewUnread]}>
            {c.last_message ??
              (c.kind === 'team' ? 'Canal de l’écurie ouvert' : c.kind === 'support' ? 'Une question ? Écris-nous' : c.kind === 'tournament' ? 'Discussion du tournoi ouverte' : 'Lance la conversation')}
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
  tournamentBadge: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.neon },
  supportBadge: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger },
});
