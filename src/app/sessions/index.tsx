import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { useApproxLocation } from '@/features/nearby/api';
import { useMySessions, useOpenSessions } from '@/features/sessions/api';
import { SessionCard } from '@/features/sessions/components/session-card';
import { SectionTitle } from '@/features/social/components/section-title';
import { useTracksMap } from '@/features/tracks/api';
import { distanceKm } from '@/lib/geo';
import { colors, spacing } from '@/theme';

type Sort = 'date' | 'near';

/** « Je roule samedi » : sessions ouvertes à rejoindre, et les miennes. */
export default function SessionsScreen() {
  const { userId } = useAuth();
  const sessions = useOpenSessions();
  const mine = useMySessions();
  const tracks = useTracksMap();
  const location = useApproxLocation();
  const [sort, setSort] = useState<Sort>('date');

  const coords = useMemo(() => new Map((tracks.data ?? []).map((t) => [t.id, t])), [tracks.data]);
  const mineIds = new Set((mine.data ?? []).map((s) => s.id));
  const km = (trackId: string) => {
    const t = coords.get(trackId);
    return t && location.data ? distanceKm(location.data, t) : null;
  };
  const others = (sessions.data ?? [])
    .filter((s) => !mineIds.has(s.id))
    .map((s) => ({ s, km: km(s.track_id) }))
    .sort((a, b) => (sort === 'near' ? (a.km ?? 9999) - (b.km ?? 9999) : a.s.starts_at.localeCompare(b.s.starts_at)));

  return (
    <Screen
      safeTop={false}
      refreshing={sessions.isRefetching}
      onRefresh={() => {
        sessions.refetch();
        mine.refetch();
      }}>
      <Text variant="caption">
        Annonce quand tu roules, les pilotes du coin te rejoignent. À l’heure prévue, la course se crée toute seule pour le
        résultat et l’ELO.
      </Text>
      <Button
        title="Proposer une session"
        size="lg"
        icon={<Icon name={icons.challenge} size={20} color={colors.onNeon} />}
        onPress={() => router.push('/sessions/new')}
      />

      {mine.data && mine.data.length > 0 ? (
        <>
          <SectionTitle title="Mes sessions" detail={`${mine.data.length}`} />
          <View style={styles.list}>
            {mine.data.map((s) => (
              <SessionCard key={s.id} session={s} distanceKm={km(s.track_id)} joined={s.host_id !== userId} />
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle title="Sessions ouvertes" detail={others.length ? `${others.length}` : undefined} />
      <Segmented
        options={[
          { value: 'date', label: 'Par date' },
          { value: 'near', label: 'Près de moi' },
        ]}
        value={sort}
        onChange={setSort}
      />
      {sessions.isPending ? <Loading /> : null}
      {sessions.error ? <ErrorState error={sessions.error} /> : null}
      {sessions.data && others.length === 0 ? (
        <EmptyState title="Aucune session pour l’instant" message="Lance la première : annonce ton prochain créneau et invite le paddock." />
      ) : null}
      <View style={styles.list}>
        {others.map(({ s, km: d }) => (
          <SessionCard key={s.id} session={s} distanceKm={d} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
});
