import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { ActionLine } from '@/features/admin/components/action-line';
import {
  EMPTY_FILTERS,
  EXPORT_LIMIT,
  JOURNAL_CATEGORIES,
  PERIODS,
  buildJournalCsv,
  hasFilters,
  roleLabel,
  useAdminJournal,
  useJournalActors,
  type JournalFilters,
} from '@/features/admin/journal';
import { shareCsv } from '@/lib/csv';
import { colors, spacing } from '@/theme';

/** Journal : toutes les décisions de l'équipe, filtrables par auteur, type, pilote, circuit et période. */
export default function AdminJournalScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const [filters, setFilters] = useState<JournalFilters>(EMPTY_FILTERS);
  const journal = useAdminJournal(filters, isAppAdmin);
  const actors = useJournalActors(isAppAdmin);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  const set = (patch: Partial<JournalFilters>) => {
    setNotice(null);
    setFilters((f) => ({ ...f, ...patch }));
  };
  const entries = journal.data?.pages.flat() ?? [];

  async function exportCsv() {
    setExporting(true);
    setNotice(null);
    setExportError(null);
    try {
      const { csv, rows } = await buildJournalCsv(filters);
      await shareCsv(`kart-rivals-journal-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      setNotice(rows >= EXPORT_LIMIT ? `Export limité aux ${EXPORT_LIMIT} actions les plus récentes : affine les filtres.` : `${rows} action${rows > 1 ? 's' : ''} exportée${rows > 1 ? 's' : ''} ✓`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export impossible.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen safeTop={false} refreshing={journal.isRefetching} onRefresh={() => { journal.refetch(); actors.refetch(); }}>
      <Text variant="label">Type d’action</Text>
      <Chips
        options={[{ value: null as string | null, label: 'Toutes' }, ...JOURNAL_CATEGORIES.map((c) => ({ value: c.value as string | null, label: c.label }))]}
        value={filters.category}
        onChange={(category) => set({ category })}
      />
      <Text variant="label">Période</Text>
      <Chips options={PERIODS} value={filters.period} onChange={(period) => set({ period })} />
      {actors.data && actors.data.length > 1 ? (
        <>
          <Text variant="label">Auteur</Text>
          <Chips
            options={[
              { value: null as string | null, label: 'Tous' },
              ...actors.data.map((a) => ({ value: a.id as string | null, label: `${a.username} · ${roleLabel(a.role)}` })),
            ]}
            value={filters.adminId}
            onChange={(adminId) => set({ adminId })}
          />
        </>
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Input label="Pilote visé" value={filters.pilot} onChangeText={(pilot) => set({ pilot })} placeholder="@pseudo" autoCapitalize="none" autoCorrect={false} />
        </View>
        <View style={styles.flex}>
          <Input label="Circuit" value={filters.track} onChangeText={(track) => set({ track })} placeholder="Nom" autoCorrect={false} />
        </View>
      </View>
      <View style={styles.row}>
        {hasFilters(filters) ? <Button title="Réinitialiser" variant="quiet" style={styles.flex} onPress={() => set(EMPTY_FILTERS)} /> : null}
        <Button title="Exporter en CSV" variant="secondary" style={styles.flex} loading={exporting} disabled={entries.length === 0} onPress={exportCsv} />
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {exportError ? <Text style={styles.error}>{exportError}</Text> : null}

      {journal.isPending ? <Loading /> : null}
      {journal.error ? <ErrorState error={journal.error} /> : null}
      {journal.data && entries.length === 0 ? (
        <EmptyState title={hasFilters(filters) ? 'Aucune action ne correspond' : 'Aucune action pour l’instant'} message={hasFilters(filters) ? 'Essaie d’élargir les filtres.' : undefined} />
      ) : null}
      {entries.map((a) => <ActionLine key={a.id} action={a} />)}
      {journal.hasNextPage ? (
        <Button title="Voir plus" variant="secondary" loading={journal.isFetchingNextPage} onPress={() => journal.fetchNextPage()} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md },
  notice: { color: colors.neon, fontWeight: '700' },
  error: { color: colors.danger },
});
