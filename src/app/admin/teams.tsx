import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { daysSince, isAbsent, useAdminTeams, type AdminTeamRow, type TeamFilter } from '@/features/admin/teams';
import { TeamCrest } from '@/features/social/components/team-crest';
import { colors, radius, spacing } from '@/theme';

const FILTERS: { value: TeamFilter; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'recent', label: 'Nouvelles' },
  { value: 'inactive', label: 'À l’abandon' },
];

const HINTS: Record<TeamFilter, string | null> = {
  all: null,
  recent: 'Écuries créées ces 14 derniers jours : noms, tags et blasons à relire.',
  inactive: 'Team Principal suspendu, banni, ou sans activité depuis plus de 60 jours.',
};

/** Écuries : recherche par nom ou tag, nouvelles écuries à relire et écuries dont le Team Principal a disparu. */
export default function AdminTeamsScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TeamFilter>('all');
  const teams = useAdminTeams(query, filter, isAppAdmin);

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  return (
    <Screen safeTop={false} refreshing={teams.isRefetching} onRefresh={teams.refetch}>
      <Input label="Rechercher une écurie" value={query} onChangeText={setQuery} placeholder="Nom ou tag" autoCorrect={false} />
      <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      {HINTS[filter] ? <Text variant="caption">{HINTS[filter]}</Text> : null}
      {teams.isPending ? <Loading /> : null}
      {teams.error ? <ErrorState error={teams.error} /> : null}
      {teams.data?.length === 0 ? <EmptyState title="Aucune écurie" message="Essaie un autre nom ou un autre filtre." /> : null}
      {teams.data?.map((t) => <TeamLine key={t.id} team={t} />)}
      {teams.data?.length === 100 ? <Text variant="caption">100 premières écuries : affine la recherche.</Text> : null}
    </Screen>
  );
}

function TeamLine({ team: t }: { team: AdminTeamRow }) {
  const seen = daysSince(t.principal_last_activity);
  const problem = !t.principal
    ? 'Sans Team Principal'
    : t.principal_restricted
      ? `${t.principal} est sanctionné`
      : isAbsent(t.principal_last_activity)
        ? `${t.principal} ${seen == null ? 'n’a jamais été actif' : `absent depuis ${seen} j`}`
        : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/admin/team/[id]', params: { id: t.id } })}
      style={({ pressed }) => [styles.row, problem && styles.alert, pressed && styles.pressed]}>
      <TeamCrest tag={t.tag} logoUrl={t.logo_url} color={t.color} size={40} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {t.name} <Text style={styles.tag}>[{t.tag}]</Text>
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {t.members} pilote{t.members > 1 ? 's' : ''} · {t.elo} ELO · créée le {new Date(t.created_at).toLocaleDateString('fr-FR')}
        </Text>
        {problem ? (
          <Text style={styles.problem}>{problem}</Text>
        ) : (
          <Text variant="caption" numberOfLines={1}>Team Principal : {t.principal}</Text>
        )}
      </View>
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
  alert: { borderLeftWidth: 3, borderLeftColor: colors.orange },
  pressed: { opacity: 0.8 },
  body: { flex: 1, gap: 2 },
  name: { fontWeight: '800' },
  tag: { fontWeight: '700', color: colors.textMuted },
  problem: { fontSize: 12, fontWeight: '800', color: colors.orange },
});
