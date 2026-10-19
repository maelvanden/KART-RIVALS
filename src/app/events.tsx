import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useMyInterests, useUpcomingEvents } from '@/features/events/api';
import { EventCard } from '@/features/events/components/event-card';
import { spacing } from '@/theme';

type Kind = 'all' | 'event' | 'promo';

/** Agenda des kartings : événements à venir et promos réservées aux pilotes, tous circuits. */
export default function EventsScreen() {
  const events = useUpcomingEvents();
  const interests = useMyInterests();
  const [kind, setKind] = useState<Kind>('all');
  const [dept, setDept] = useState('all');

  const departments = useMemo(
    () => [...new Set((events.data ?? []).map((e) => e.track?.postal_code?.slice(0, 2)).filter(Boolean) as string[])].sort(),
    [events.data],
  );
  const list = (events.data ?? []).filter(
    (e) => (kind === 'all' || e.kind === kind) && (dept === 'all' || e.track?.postal_code?.startsWith(dept)),
  );

  return (
    <Screen safeTop={false} refreshing={events.isRefetching} onRefresh={events.refetch}>
      <Text variant="caption">
        Soirées endurance, Grands Prix, nocturnes et codes promo réservés aux pilotes Kart Rivals, publiés par les kartings.
      </Text>
      <Segmented
        options={[
          { value: 'all', label: 'Tout' },
          { value: 'event', label: 'Événements' },
          { value: 'promo', label: 'Promos' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {departments.length > 1 ? (
        <Segmented
          options={[{ value: 'all', label: 'Partout' }, ...departments.map((d) => ({ value: d, label: d }))]}
          value={dept}
          onChange={setDept}
        />
      ) : null}
      {events.isPending ? <Loading /> : null}
      {events.error ? <ErrorState error={events.error} /> : null}
      {events.data && list.length === 0 ? (
        <EmptyState
          title="Rien de prévu pour l’instant"
          message="Les kartings publient ici leurs événements et leurs promos. Reviens bientôt !"
        />
      ) : null}
      <View style={styles.list}>
        {list.map((e) => (
          <EventCard key={e.id} event={e} interested={interests.data?.has(e.id)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
});
