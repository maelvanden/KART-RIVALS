import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Segmented } from '@/components/ui/segmented';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { AgendaBanner } from '@/features/events/components/agenda-banner';
import { useApproxLocation } from '@/features/nearby/api';
import { useMyProfile } from '@/features/profile/api';
import { useTrackRecords, useTracksMap } from '@/features/tracks/api';
import { TrackMap } from '@/features/tracks/components/track-map';
import { TrackRow } from '@/features/tracks/components/track-row';
import { distanceKm } from '@/lib/geo';
import { colors, radius, spacing } from '@/theme';

type Filter = 'all' | 'indoor' | 'outdoor';

/** Numéro de département (« 49 ») tiré du code postal. */
const department = (postalCode: string | null) => postalCode?.slice(0, 2) ?? null;

export default function TracksScreen() {
  const tracks = useTracksMap();
  const location = useApproxLocation();
  const profile = useMyProfile();
  const records = useTrackRecords();
  const [filter, setFilter] = useState<Filter>('all');
  const [dept, setDept] = useState('all');

  // Départements présents (49, 85, 86…) avec leur nom, pour le filtre et le sous-titre. Le nom retenu est la région
  // la plus fréquente du numéro : quelques communes ont le code postal d'un département voisin (Piégut, 04 → 05130).
  const departments = useMemo(() => {
    const counts = new Map<string, Map<string, number>>();
    for (const t of tracks.data ?? []) {
      const code = department(t.postal_code);
      if (!code) continue;
      const names = counts.get(code) ?? new Map<string, number>();
      const name = t.region ?? code;
      names.set(name, (names.get(name) ?? 0) + 1);
      counts.set(code, names);
    }
    return [...counts.entries()]
      .map(([code, names]): [string, string] => [code, [...names.entries()].sort((a, b) => b[1] - a[1])[0][0]])
      .sort(([a], [b]) => a.localeCompare(b));
  }, [tracks.data]);

  const list = useMemo(() => {
    const here = location.data;
    return (tracks.data ?? [])
      .filter((t) => filter === 'all' || (filter === 'indoor') === t.is_indoor)
      .filter((t) => dept === 'all' || department(t.postal_code) === dept)
      .map((t) => ({ track: t, km: here ? distanceKm(here, t) : null }))
      .sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || a.track.name.localeCompare(b.track.name));
  }, [tracks.data, location.data, filter, dept]);
  const subtitle =
    dept === 'all'
      ? departments.length > 3
        ? `${departments.length} départements`
        : departments.map(([, name]) => name).join(' · ')
      : (departments.find(([c]) => c === dept)?.[1] ?? '');

  return (
    <Screen subtitle={subtitle} title="Circuits" refreshing={tracks.isRefetching} onRefresh={tracks.refetch}>
      <AgendaBanner />
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
      {departments.length > 1 ? (
        <DepartmentChips
          options={[{ code: 'all', label: 'Tout' }, ...departments.map(([code, name]) => ({ code, label: `${code} · ${name}` }))]}
          value={dept}
          onChange={setDept}
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
        <TrackRow
          key={track.id}
          track={track}
          distanceKm={km}
          favorite={track.id === profile.data?.home_track_id}
          recordMs={records.data?.[track.id]?.lap_ms}
        />
      ))}
    </Screen>
  );
}

/** Filtre par département : une rangée de puces qui défile, lisible même avec des dizaines de départements. */
function DepartmentChips({
  options,
  value,
  onChange,
}: {
  options: { code: string; label: string }[];
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((o) => {
        const active = o.code === value;
        return (
          <Pressable
            key={o.code}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.code)}
            style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.neon, borderColor: colors.neon },
  chipText: { fontWeight: '800', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted },
  chipTextActive: { color: colors.onNeon },
});
