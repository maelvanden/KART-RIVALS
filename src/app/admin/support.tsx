import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { useSupportInbox, type SupportThread } from '@/features/social/radio';
import { formatMessageTime } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

/** Support pilotes (admins appli) : conversations « Contacter l'équipe », non lues d'abord. */
export default function SupportInboxScreen() {
  const roles = useAdminRoles().data;
  const isAppAdmin = !!roles?.is_app_admin;
  const inbox = useSupportInbox(isAppAdmin);

  if (roles && !isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  const unread = (inbox.data ?? []).filter((t) => t.unread > 0).length;

  return (
    <Screen safeTop={false} refreshing={inbox.isRefetching} onRefresh={inbox.refetch}>
      <Text variant="caption">
        Les pilotes écrivent depuis « Contacter l’équipe ». Tes réponses sont signées « Équipe Kart Rivals ». Engagement : une
        réponse sous 24 h.
      </Text>
      {inbox.isPending ? <Loading /> : null}
      {inbox.error ? <ErrorState error={inbox.error} /> : null}
      {inbox.data?.length === 0 ? <EmptyState title="Aucun message" message="Les demandes des pilotes arriveront ici." /> : null}
      {unread > 0 ? <Text variant="label">{unread} conversation{unread > 1 ? 's' : ''} en attente de réponse</Text> : null}
      <View style={styles.list}>
        {inbox.data?.map((t) => <ThreadRow key={t.id} thread={t} />)}
      </View>
    </Screen>
  );
}

function ThreadRow({ thread: t }: { thread: SupportThread }) {
  const unread = t.unread > 0;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/radio/[id]', params: { id: t.id, title: t.username } })}
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.pressed]}>
      <Avatar username={t.username} url={t.avatar_url} size={44} borderColor={colors.borderStrong} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="heading" numberOfLines={1} style={styles.title}>
            {t.username}
          </Text>
          {t.restricted ? <Text style={styles.restricted}>Sanctionné</Text> : null}
          <Text variant="caption">{formatMessageTime(t.last_message_at)}</Text>
        </View>
        <View style={styles.titleRow}>
          <Text variant="caption" numberOfLines={1} style={[styles.preview, unread && styles.previewUnread]}>
            {t.last_message ?? '—'}
          </Text>
          {unread ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t.unread > 99 ? '99+' : t.unread}</Text>
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
  rowUnread: { borderLeftWidth: 3, borderLeftColor: colors.orange },
  pressed: { opacity: 0.8 },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: 17, lineHeight: 22 },
  restricted: { fontSize: 11, fontWeight: '800', color: colors.orange, textTransform: 'uppercase' },
  preview: { flex: 1 },
  previewUnread: { color: colors.text },
  badge: { minWidth: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontFamily: fonts.display, fontSize: 13, color: colors.onNeon },
});
