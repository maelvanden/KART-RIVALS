import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { useAdminTracks, type AdminTrackRow } from '@/features/admin/panel';
import { normalize } from '@/lib/regions';
import { colors, radius, spacing } from '@/theme';

type Filter = 'all' | 'check' | 'hidden';
const PAGE = 40;

/** Ce qui manque ou cloche sur une fiche, du plus important au moins important. */
function issues(t: AdminTrackRow): { label: string; color: string }[] {
  const list: { label: string; color: string }[] = [];
  if (t.hidden) list.push({ label: 'Masqué', color: colors.danger });
  if (t.location_approx) list.push({ label: 'Position approx.', color: colors.orange });
  if (!t.has_contact) list.push({ label: 'Sans contact', color: colors.textMuted });
  if (!t.has_length) list.push({ label: 'Sans longueur', color: colors.textMuted });
  if (!t.has_description) list.push({ label: 'Sans description', color: colors.textMuted });
  return list;
}
const needsCheck = (t: AdminTrackRow) => t.location_approx || !t.has_contact || !t.has_description;

/** Circuits : recherche, fiches à vérifier, circuits masqués, création. */
export default function AdminTracksScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const tracks = useAdminTracks(isAppAdmin);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);

  const all = useMemo(() => tracks.data ?? [], [tracks.data]);
  const counts = { check: all.filter((t) => !t.hidden && needsCheck(t)).length, hidden: all.filter((t) => t.hidden).length };
  const list = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return all
      .filter((t) => (filter === 'hidden' ? t.hidden : filter === 'check' ? !t.hidden && needsCheck(t) : true))
      .filter((t) => {
        const hay = normalize([t.name, t.city, t.region, t.postal_code].filter(Boolean).join(' '));
        return words.every((w) => (/^\d{2}$/.test(w) ? t.postal_code?.startsWith(w) : hay.includes(w)));
      })
      .sort((a, b) =>
        filter === 'check' ? Number(b.location_approx) - Number(a.location_approx) || a.name.localeCompare(b.name) : 0,
      );
  }, [all, query, filter]);

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  return (
    <Screen safeTop={false} refreshing={tracks.isRefetching} onRefresh={tracks.refetch}>
      <Button title="Créer un circuit" icon={<Icon name={icons.plus} size={18} color={colors.onNeon} />} onPress={() => router.push('/admin/track/new')} />
      <Input
        label="Rechercher"
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          setShown(PAGE);
        }}
        placeholder="Nom, ville, département (44)…"
        autoCorrect={false}
      />
      <Segmented
        options={[
          { value: 'all', label: `Tous ${all.length || ''}`.trim() },
          { value: 'check', label: `À vérifier ${counts.check || ''}`.trim() },
          { value: 'hidden', label: `Masqués ${counts.hidden || ''}`.trim() },
        ]}
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setShown(PAGE);
        }}
      />
      {filter === 'check' ? (
        <Text variant="caption">
          Positions placées approximativement à l’import, fiches sans téléphone ni site, ou sans description. Ouvre une
          fiche pour la compléter : une position corrigée n’est plus marquée approximative.
        </Text>
      ) : null}
      {tracks.isPending ? <Loading /> : null}
      {tracks.error ? <ErrorState error={tracks.error} /> : null}
      {tracks.data && list.length === 0 ? <EmptyState title="Aucun circuit" /> : null}
      {list.slice(0, shown).map((t) => (
        <TrackLine key={t.id} track={t} />
      ))}
      {list.length > shown ? (
        <Button title={`Afficher plus (${list.length - shown})`} variant="secondary" onPress={() => setShown((n) => n + PAGE)} />
      ) : null}
    </Screen>
  );
}

function TrackLine({ track: t }: { track: AdminTrackRow }) {
  const tags = issues(t);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/admin/track/[id]', params: { id: t.id } })}
      style={({ pressed }) => [styles.row, t.hidden && styles.hiddenRow, pressed && styles.pressed]}>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {t.name}
          {t.is_official ? <Text style={styles.official}>  · officiel</Text> : null}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {[t.postal_code?.slice(0, 2), t.city, t.is_indoor ? 'Indoor' : 'Outdoor'].filter(Boolean).join(' · ')}
        </Text>
        {tags.length > 0 ? (
          <View style={styles.tags}>
            {tags.map((g) => (
              <Text key={g.label} style={[styles.tag, { color: g.color, borderColor: g.color }]}>
                {g.label}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      <Icon name={icons.edit} size={16} color={colors.neon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  hiddenRow: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
  body: { flex: 1, gap: 3 },
  name: { fontWeight: '800' },
  official: { fontSize: 12, fontWeight: '700', color: colors.neon },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  tag: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
});
