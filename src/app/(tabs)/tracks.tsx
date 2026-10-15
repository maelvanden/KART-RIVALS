import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { Segmented } from '@/components/ui/segmented';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { useApproxLocation } from '@/features/nearby/api';
import { useMyProfile } from '@/features/profile/api';
import { useTracksMap } from '@/features/tracks/api';
import { TrackMap } from '@/features/tracks/components/track-map';
import { TrackRow } from '@/features/tracks/components/track-row';
import { distanceKm } from '@/lib/geo';

type Filter = 'all' | 'indoor' | 'outdoor';

export default function TracksScreen() {
  const tracks = useTracksMap();
  const location = useApproxLocation();
  const profile = useMyProfile();
  const [filter, setFilter] = useState<Filter>('all');

  const list = useMemo(() => {
    const here = location.data;
    return (tracks.data ?? [])
      .filter((t) => filter === 'all' || (filter === 'indoor') === t.is_indoor)
      .map((t) => ({ track: t, km: here ? distanceKm(here, t) : null }))
      .sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || a.track.name.localeCompare(b.track.name));
  }, [tracks.data, location.data, filter]);

  return (
    <Screen subtitle="Maine-et-Loire" title="Circuits" refreshing={tracks.isRefetching} onRefresh={tracks.refetch}>
      {tracks.isPending ? <Loading /> : null}
      {tracks.error ? <ErrorState error={tracks.error} /> : null}
      {tracks.data ? (
        <TrackMap
          tracks={list.map((x) => x.track)}
          height={260}
          selectedId={profile.data?.home_track_id ?? undefined}
          onSelect={(t) => router.push({ pathname: '/track/[id]', params: { id: t.id } })}
        />
      ) : null}
      <Segmented
        options={[
          { value: 'all', label: 'Tous' },
          { value: 'indoor', label: 'Indoor' },
          { value: 'outdoor', label: 'Outdoor' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {tracks.data && list.length === 0 ? <EmptyState title="Aucun circuit de ce type" /> : null}
      {list.map(({ track, km }) => (
        <TrackRow key={track.id} track={track} distanceKm={km} favorite={track.id === profile.data?.home_track_id} />
      ))}
    </Screen>
  );
}
