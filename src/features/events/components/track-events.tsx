import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useCanManageTrack } from '@/features/admin/api';
import { useManagedEventStats, useMyInterests, useUpcomingEvents } from '@/features/events/api';
import { EventCard } from '@/features/events/components/event-card';
import { colors, spacing } from '@/theme';

/** Fiche circuit : événements à venir et promos du karting ; ses admins publient d'ici. */
export function TrackEvents({ trackId }: { trackId: string }) {
  const events = useUpcomingEvents(trackId);
  const interests = useMyInterests();
  const canManage = useCanManageTrack(trackId);
  const stats = useManagedEventStats(trackId, canManage);
  const list = events.data ?? [];
  if (!canManage && list.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text variant="label" style={styles.title}>
          Agenda & promos
        </Text>
        {list.length > 0 ? <Text variant="label">{list.length}</Text> : null}
      </View>
      {list.map((e) => (
        <EventCard
          key={e.id}
          event={e}
          hideTrack
          interested={interests.data?.has(e.id)}
          stats={canManage ? stats.data?.[e.id] : undefined}
        />
      ))}
      {canManage ? (
        <>
          {list.length === 0 ? (
            <Text variant="caption">Publie ta prochaine soirée ou une promo réservée aux pilotes Kart Rivals.</Text>
          ) : null}
          <Button
            title="Publier"
            variant="secondary"
            icon={<Icon name={icons.plus} size={18} color={colors.text} />}
            onPress={() => router.push({ pathname: '/admin/event', params: { trackId } })}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
});
