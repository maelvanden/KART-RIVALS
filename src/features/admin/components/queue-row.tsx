import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, icons, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useRespondTrackRequest } from '@/features/admin/api';
import { QUEUE_LABELS, isLate, waitingFor, type QueueItem, type QueueKind } from '@/features/admin/queue';
import { colors, radius, spacing } from '@/theme';

const QUEUE_ICONS: Record<QueueKind, IconName> = {
  report: icons.report,
  ticket: icons.ticket,
  dispute: icons.challenge,
  suspect: icons.timer,
  correction: icons.edit,
  request: icons.recruit,
};

/** Une ligne de la file ; aussi utilisée en aperçu sur le tableau de bord. */
export function QueueRow({ item }: { item: QueueItem }) {
  const respond = useRespondTrackRequest();
  const late = isLate(item.since);
  const body = (
    <>
      <View style={styles.top}>
        <Icon name={QUEUE_ICONS[item.kind]} size={16} color={late ? colors.orange : colors.neon} />
        <Text style={[styles.kind, late && { color: colors.orange }]}>{QUEUE_LABELS[item.kind]}</Text>
        <View style={styles.flex} />
        <Text style={[styles.age, late && { color: colors.orange }]}>depuis {waitingFor(item.since)}</Text>
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {item.title}
      </Text>
      <Text variant="caption" numberOfLines={2}>
        {item.detail}
      </Text>
    </>
  );

  if (item.request) {
    const q = item.request;
    return (
      <View style={[styles.row, late && styles.late]}>
        {body}
        <View style={styles.actions}>
          <Button
            title="Profil"
            variant="quiet"
            style={styles.flex}
            onPress={() => router.push({ pathname: '/admin/pilot/[id]', params: { id: q.profile_id } })}
          />
          <Button
            title="Refuser"
            variant="secondary"
            style={styles.flex}
            disabled={respond.isPending}
            onPress={() => respond.mutate({ request: q, accept: false })}
          />
          <Button title="Valider" style={styles.flex} loading={respond.isPending} onPress={() => respond.mutate({ request: q, accept: true })} />
        </View>
        {respond.error ? <Text style={styles.error}>{respond.error.message}</Text> : null}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => item.href && router.push(item.href)}
      style={({ pressed }) => [styles.row, late && styles.late, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 4,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  late: { borderLeftWidth: 3, borderLeftColor: colors.orange },
  pressed: { opacity: 0.7 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  kind: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.neon },
  age: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  title: { fontWeight: '800' },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  error: { color: colors.danger },
});
