import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { useAdminPilots, type AdminPilotRow, type PilotFilter } from '@/features/admin/panel';
import { colors, radius, rankMeta, spacing } from '@/theme';

const FILTERS: { value: PilotFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'reported', label: 'Signalés' },
  { value: 'restricted', label: 'Sanctionnés' },
  { value: 'recent', label: 'Nouveaux' },
];

/** Pilotes : recherche par pseudo et filtres (signalés, sanctionnés, inscrits depuis 7 jours). */
export default function AdminPilotsScreen() {
  const params = useLocalSearchParams<{ filter?: PilotFilter }>();
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PilotFilter>(params.filter ?? 'all');
  const pilots = useAdminPilots(query.replace(/^@/, ''), filter);

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  return (
    <Screen safeTop={false} refreshing={pilots.isRefetching} onRefresh={pilots.refetch}>
      <Input label="Rechercher un pilote" value={query} onChangeText={setQuery} placeholder="@pseudo" autoCapitalize="none" autoCorrect={false} />
      <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      {pilots.isPending ? <Loading /> : null}
      {pilots.error ? <ErrorState error={pilots.error} /> : null}
      {pilots.data?.length === 0 ? <EmptyState title="Aucun pilote" message="Essaie un autre pseudo ou un autre filtre." /> : null}
      {pilots.data?.map((p) => <PilotLine key={p.id} pilot={p} />)}
      {pilots.data?.length === 60 ? <Text variant="caption">60 premiers résultats : affine la recherche.</Text> : null}
    </Screen>
  );
}

function PilotLine({ pilot: p }: { pilot: AdminPilotRow }) {
  const status = p.banned_at
    ? { label: 'Banni', color: colors.danger }
    : p.suspended_until
      ? { label: 'Suspendu', color: colors.orange }
      : p.is_admin
        ? { label: 'Admin', color: colors.neon }
        : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/admin/pilot/[id]', params: { id: p.id } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Avatar username={p.username} url={p.avatar_url} size={40} borderColor={rankMeta[p.rank].color} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{p.username}</Text>
        <Text variant="caption" numberOfLines={1}>
          {p.elo} ELO · inscrit le {new Date(p.created_at).toLocaleDateString('fr-FR')}
          {p.open_reports > 0 ? ` · ${p.open_reports} signalement${p.open_reports > 1 ? 's' : ''} ouvert${p.open_reports > 1 ? 's' : ''}` : ''}
        </Text>
      </View>
      {status ? <Text style={[styles.status, { color: status.color, borderColor: status.color }]}>{status.label}</Text> : null}
      {p.open_reports > 0 && !status ? <Icon name={icons.report} size={16} color={colors.danger} /> : null}
      <Icon name={icons.chevron} size={14} color={colors.textMuted} />
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
  pressed: { opacity: 0.8 },
  body: { flex: 1, gap: 2 },
  name: { fontWeight: '800' },
  status: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
