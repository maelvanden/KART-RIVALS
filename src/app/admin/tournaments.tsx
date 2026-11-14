import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { waitingFor } from '@/features/admin/queue';
import { useAdminTournaments, type AdminTournamentRow, type TournamentFilter } from '@/features/admin/tournaments';
import { colors, radius, spacing } from '@/theme';

const FILTERS: { value: TournamentFilter; label: string }[] = [
  { value: 'watch', label: 'À surveiller' },
  { value: 'registration', label: 'Inscriptions' },
  { value: 'running', label: 'En cours' },
  { value: 'done', label: 'Terminés' },
];

const EMPTY: Record<TournamentFilter, { title: string; message?: string }> = {
  watch: { title: 'Rien à surveiller', message: 'Aucun tournoi en cours n’a de duel bloqué ou contesté. 🏁' },
  registration: { title: 'Aucun tournoi en inscription' },
  running: { title: 'Aucun tournoi en cours' },
  done: { title: 'Aucun tournoi terminé ou annulé' },
};

const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/** Tournois : tous les tournois de l'appli, privés compris, avec ceux qui ont besoin d'un arbitrage en premier. */
export default function AdminTournamentsScreen() {
  const params = useLocalSearchParams<{ filter?: TournamentFilter }>();
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const [filter, setFilter] = useState<TournamentFilter>(params.filter ?? 'watch');
  const list = useAdminTournaments(filter, isAppAdmin);

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  return (
    <Screen safeTop={false} refreshing={list.isRefetching} onRefresh={list.refetch}>
      <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      {filter === 'watch' ? (
        <Text variant="caption">
          Tournois en cours avec un duel contesté, ou bloqué : délai dépassé de plus de 3 jours, ou sans délai et en
          attente depuis plus de 21 jours.
        </Text>
      ) : null}
      {list.isPending ? <Loading /> : null}
      {list.error ? <ErrorState error={list.error} /> : null}
      {list.data?.length === 0 ? <EmptyState {...EMPTY[filter]} /> : null}
      {list.data?.map((t) => <TournamentLine key={t.id} tournament={t} />)}
      {list.data?.length === 100 ? <Text variant="caption">100 tournois les plus récents affichés.</Text> : null}
    </Screen>
  );
}

function TournamentLine({ tournament: t }: { tournament: AdminTournamentRow }) {
  const alert = t.stuck + t.disputed > 0;
  const state =
    t.status === 'registration'
      ? `${t.entries}/${t.size} inscrits${t.waitlist > 0 ? ` · ${t.waitlist} en attente` : ''}`
      : t.status === 'running'
        ? `${t.playing} duel${t.playing > 1 ? 's' : ''} à jouer`
        : t.status === 'completed'
          ? `Vainqueur : ${t.champion ?? '—'}${t.completed_at ? ` · ${day(t.completed_at)}` : ''}`
          : 'Annulé';
  const problems = [
    t.stuck > 0 ? `${t.stuck} duel${t.stuck > 1 ? 's' : ''} bloqué${t.stuck > 1 ? 's' : ''}${t.stuck_since ? ` depuis ${waitingFor(t.stuck_since)}` : ''}` : null,
    t.disputed > 0 ? `${t.disputed} contesté${t.disputed > 1 ? 's' : ''}` : null,
  ].filter(Boolean);
  const tags = [t.is_official ? 'Officiel' : null, t.is_private ? 'Privé' : null, t.on_site ? 'Sur place' : null].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/admin/tournament/[id]', params: { id: t.id } })}
      style={({ pressed }) => [styles.row, alert && styles.alert, pressed && styles.pressed]}>
      <Icon name={icons.trophy} size={22} color={alert ? colors.orange : t.status === 'cancelled' ? colors.textMuted : colors.neon} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{t.name}</Text>
        <Text variant="caption" numberOfLines={1}>
          {t.track_name} · par {t.organizer ?? 'compte supprimé'}
          {tags.length > 0 ? ` · ${tags.join(', ')}` : ''}
        </Text>
        <Text variant="caption" numberOfLines={1}>{state}</Text>
        {problems.length > 0 ? <Text style={styles.problem}>{problems.join(' · ')}</Text> : null}
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
  problem: { fontSize: 12, fontWeight: '800', color: colors.orange },
});
