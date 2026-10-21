import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
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
import { normalize, REGIONS, regionOfDepartment } from '@/lib/regions';
import { colors, fonts, radius, spacing } from '@/theme';

type Filter = 'all' | 'indoor' | 'outdoor';

/** Numéro de département (« 49 ») tiré du code postal. */
const department = (postalCode: string | null) => postalCode?.slice(0, 2) ?? null;

/** Circuits affichés d'un coup dans la liste (la carte, elle, les montre tous). */
const PAGE = 30;

export default function TracksScreen() {
  const tracks = useTracksMap();
  const location = useApproxLocation();
  const profile = useMyProfile();
  const records = useTrackRecords();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('all');
  const [dept, setDept] = useState('all');
  const [shown, setShown] = useState(PAGE);

  // Départements présents (49, 85, 86…) avec leur nom et leur nombre de circuits. Le nom retenu est le plus fréquent du
  // numéro : quelques communes ont le code postal d'un département voisin (Piégut, 04 → 05130).
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
      .map(([code, names]) => ({
        code,
        name: [...names.entries()].sort((a, b) => b[1] - a[1])[0][0],
        count: [...names.values()].reduce((a, b) => a + b, 0),
        region: regionOfDepartment(code),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [tracks.data]);

  // Régions qui ont au moins un circuit, avec leur total.
  const regions = useMemo(
    () =>
      REGIONS.map((r) => ({
        name: r.name,
        count: departments.filter((d) => d.region === r.name).reduce((a, d) => a + d.count, 0),
      })).filter((r) => r.count > 0),
    [departments],
  );
  const regionDepartments = departments.filter((d) => d.region === region);

  const list = useMemo(() => {
    const here = location.data;
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const deptName = new Map(departments.map((d) => [d.code, d.name]));
    return (tracks.data ?? [])
      .filter((t) => filter === 'all' || (filter === 'indoor') === t.is_indoor)
      .filter((t) => {
        const code = department(t.postal_code);
        if (region !== 'all' && regionOfDepartment(code) !== region) return false;
        return dept === 'all' || code === dept;
      })
      .filter((t) => {
        if (words.length === 0) return true;
        const code = department(t.postal_code) ?? '';
        const haystack = normalize(
          [t.name, t.city, t.region, code && deptName.get(code), regionOfDepartment(code), t.postal_code].filter(Boolean).join(' '),
        );
        // Un numéro seul (« 44 ») vise le département ; sinon chaque mot doit apparaître quelque part.
        return words.every((w) => (/^\d{2}$/.test(w) ? code === w : haystack.includes(w)));
      })
      .map((t) => ({ track: t, km: here ? distanceKm(here, t) : null }))
      .sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || a.track.name.localeCompare(b.track.name));
  }, [tracks.data, location.data, filter, region, dept, query, departments]);
  const mapTracks = useMemo(() => list.map((x) => x.track), [list]);

  const pickRegion = (name: string) => {
    setRegion(name);
    setDept('all');
    setShown(PAGE);
  };
  const pickDept = (code: string) => {
    setDept(code);
    setShown(PAGE);
  };

  const place =
    dept !== 'all'
      ? (departments.find((d) => d.code === dept)?.name ?? '')
      : region !== 'all'
        ? region
        : `${regions.length} régions · ${departments.length} départements`;
  const filtered = query.trim() !== '' || filter !== 'all' || region !== 'all';

  return (
    <Screen subtitle={place} title="Circuits" refreshing={tracks.isRefetching} onRefresh={tracks.refetch}>
      <AgendaBanner />
      {tracks.isPending ? <Loading /> : null}
      {tracks.error ? <ErrorState error={tracks.error} /> : null}

      <View style={styles.search}>
        <Icon name={icons.search} size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setShown(PAGE);
          }}
          placeholder="Circuit, ville, département (44)…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="never"
        />
        {query ? (
          <Pressable accessibilityLabel="Effacer la recherche" hitSlop={10} onPress={() => setQuery('')}>
            <Icon name={icons.close} size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {regions.length > 1 ? (
        <Chips
          options={[
            { value: 'all', label: 'Toute la France' },
            ...regions.map((r) => ({ value: r.name, label: r.name, count: r.count })),
          ]}
          value={region}
          onChange={pickRegion}
        />
      ) : null}
      {region !== 'all' && regionDepartments.length > 1 ? (
        <Chips
          options={[
            { value: 'all', label: 'Tous les départements' },
            ...regionDepartments.map((d) => ({ value: d.code, label: `${d.code} · ${d.name}`, count: d.count })),
          ]}
          value={dept}
          onChange={pickDept}
          small
        />
      ) : null}

      {tracks.data ? (
        <TrackMap
          tracks={mapTracks}
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
        onChange={(v) => {
          setFilter(v);
          setShown(PAGE);
        }}
      />

      {tracks.data ? (
        <View style={styles.countRow}>
          <Text variant="label">
            {list.length} circuit{list.length > 1 ? 's' : ''}
            {location.data ? ' · du plus proche au plus loin' : ''}
          </Text>
          {filtered ? (
            <Pressable
              hitSlop={8}
              onPress={() => {
                setQuery('');
                setFilter('all');
                pickRegion('all');
              }}>
              <Text style={styles.reset}>Tout effacer</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {tracks.data && list.length === 0 ? (
        <EmptyState title="Aucun circuit trouvé" message="Essaie un autre nom, une ville ou un numéro de département." />
      ) : null}
      {list.slice(0, shown).map(({ track, km }) => (
        <TrackRow
          key={track.id}
          track={track}
          distanceKm={km}
          favorite={track.id === profile.data?.home_track_id}
          recordMs={records.data?.[track.id]?.lap_ms}
        />
      ))}
      {list.length > shown ? (
        <Button
          title={`Afficher plus (${list.length - shown})`}
          variant="secondary"
          onPress={() => setShown((n) => n + PAGE)}
        />
      ) : null}
    </Screen>
  );
}

/** Rangée de puces qui défile (régions, départements), avec le nombre de circuits. */
function Chips({
  options,
  value,
  onChange,
  small,
}: {
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  small?: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, small && styles.chipSmall, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
            {o.count !== undefined ? (
              <Text style={[styles.chipCount, active && styles.chipTextActive]}>{o.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 16,
    paddingVertical: spacing.sm,
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : {}),
  },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reset: { color: colors.neon, fontWeight: '700', fontSize: 13 },
  chips: { gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSmall: { paddingVertical: spacing.xs + 2 },
  chipActive: { backgroundColor: colors.neon, borderColor: colors.neon },
  chipText: { fontWeight: '800', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted },
  chipCount: { fontWeight: '700', fontSize: 11, color: colors.textMuted, opacity: 0.8 },
  chipTextActive: { color: colors.onNeon },
});
