import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useApproxLocation } from '@/features/nearby/api';
import { TrackTypeBadge } from '@/features/tracks/components/track-row';
import { distanceKm } from '@/lib/geo';
import { DEPARTMENT_NAMES, normalize, regionOfDepartment } from '@/lib/regions';
import { colors, fonts, radius, spacing } from '@/theme';
import type { TrackDetails } from '@/types/models';

/** Rayon des circuits proposés sans recherche. */
const NEARBY_KM = 50;
/** À défaut de circuit dans le rayon : les plus proches. */
const CLOSEST = 5;
/** Résultats affichés pour une recherche. */
const RESULTS = 20;

type Props = {
  tracks: TrackDetails[];
  value: string | null;
  onChange: (trackId: string | null) => void;
  /** Libellé de l'option « aucun circuit ». */
  noneLabel?: string;
};

const department = (postalCode: string | null) => postalCode?.slice(0, 2) ?? null;

/**
 * Choix d'un circuit (ou d'aucun) : le circuit choisi en tête, puis les circuits à moins de 50 km du plus proche au plus
 * loin, ou ceux de la recherche (nom, ville, département ou son numéro).
 */
export function TrackPicker({ tracks, value, onChange, noneLabel = 'Aucun' }: Props) {
  const location = useApproxLocation();
  const [query, setQuery] = useState('');
  const here = location.data ?? null;
  const selected = tracks.find((t) => t.id === value) ?? null;

  const { list, more } = useMemo(() => {
    const withKm = tracks.map((t) => ({ track: t, km: here ? distanceKm(here, t) : null }));
    const byDistance = (a: { track: TrackDetails; km: number | null }, b: { track: TrackDetails; km: number | null }) =>
      (a.km ?? 0) - (b.km ?? 0) || a.track.name.localeCompare(b.track.name);
    const words = normalize(query).split(/\s+/).filter(Boolean);

    if (words.length > 0) {
      const found = withKm
        .filter(({ track: t }) => {
          const code = department(t.postal_code) ?? '';
          const haystack = normalize(
            [t.name, t.city, t.region, DEPARTMENT_NAMES[code], regionOfDepartment(code), t.postal_code].filter(Boolean).join(' '),
          );
          // Un numéro seul (« 44 ») vise le département ; sinon chaque mot doit apparaître quelque part.
          return words.every((w) => (/^\d{2}$/.test(w) ? code === w : haystack.includes(w)));
        })
        .sort(byDistance);
      return { list: found.slice(0, RESULTS), more: Math.max(0, found.length - RESULTS) };
    }
    if (!here) return { list: [], more: 0 };
    const sorted = withKm.sort(byDistance);
    const near = sorted.filter((x) => (x.km ?? Infinity) <= NEARBY_KM);
    return { list: near.length > 0 ? near : sorted.slice(0, CLOSEST), more: 0 };
  }, [tracks, here, query]);

  // Le circuit choisi reste en tête, même s'il n'est ni proche ni dans la recherche.
  const rest = list.filter((x) => x.track.id !== value);
  const selectedKm = selected && here ? distanceKm(here, selected) : null;
  const searching = query.trim().length > 0;

  return (
    <View style={styles.list}>
      <View style={styles.search}>
        <Icon name={icons.search} size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Circuit, ville, département (44)…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Rechercher un circuit"
        />
        {searching ? (
          <Pressable accessibilityLabel="Effacer la recherche" hitSlop={10} onPress={() => setQuery('')}>
            <Icon name={icons.close} size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.list} accessibilityRole="radiogroup">
        {selected ? <TrackOption track={selected} km={selectedKm} selected onPress={() => onChange(selected.id)} /> : null}

        {!searching ? (
          <Text variant="caption">
            {here
              ? list.some((x) => (x.km ?? Infinity) <= NEARBY_KM)
                ? `Circuits à moins de ${NEARBY_KM} km`
                : `Aucun circuit à moins de ${NEARBY_KM} km : les plus proches`
              : location.isPending
                ? 'Recherche des circuits autour de toi…'
                : 'Active la localisation pour voir les circuits autour de toi, ou cherche le tien.'}
          </Text>
        ) : list.length === 0 ? (
          <Text variant="caption">Aucun circuit trouvé. Essaie le nom de la ville ou le numéro du département.</Text>
        ) : null}

        {rest.map(({ track, km }) => (
          <TrackOption key={track.id} track={track} km={km} selected={false} onPress={() => onChange(track.id)} />
        ))}
        {more > 0 ? (
          <Text variant="caption">
            Et {more} autre{more > 1 ? 's' : ''} : précise ta recherche.
          </Text>
        ) : null}

        <Option selected={value === null} onPress={() => onChange(null)} label={noneLabel}>
          <Text style={[styles.name, styles.none]}>{noneLabel}</Text>
        </Option>
      </View>
    </View>
  );
}

function TrackOption({ track: t, km, selected, onPress }: { track: TrackDetails; km: number | null; selected: boolean; onPress: () => void }) {
  return (
    <Option selected={selected} onPress={onPress} label={`${t.name}, ${t.city}`}>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {t.name}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {t.city}
          {km != null ? ` · à ${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km` : ''}
          {t.length_m ? ` · ${t.length_m.toLocaleString('fr-FR')} m` : ''}
        </Text>
      </View>
      <TrackTypeBadge indoor={t.is_indoor} />
    </Option>
  );
}

function Option({
  selected,
  onPress,
  label,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.option, selected && styles.selected]}>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
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
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.neon, backgroundColor: colors.selected },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.neon },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.neon },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '800' },
  none: { flex: 1, color: colors.textMuted },
});
