import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { trackPhotoUrl, useAdminReports, useAdminRoles, useResolveReport, type AdminReport, type ReportStatus } from '@/features/admin/api';
import { REPORT_REASONS } from '@/features/social/safety';
import { formatMessageTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

const TABS: { value: ReportStatus; label: string }[] = [
  { value: 'open', label: 'À traiter' },
  { value: 'reviewed', label: 'Traités' },
  { value: 'dismissed', label: 'Rejetés' },
];

/** Signalements des pilotes : contenu visé, motif, et décision (masquer, rétablir, rejeter). */
export default function ReportsScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const [tab, setTab] = useState<ReportStatus>('open');
  const reports = useAdminReports(tab, isAppAdmin);
  const resolve = useResolveReport();

  return (
    <Screen safeTop={false} refreshing={reports.isRefetching} onRefresh={reports.refetch}>
      <Segmented options={TABS} value={tab} onChange={setTab} />
      {reports.isPending ? <Loading /> : null}
      {reports.error ? <ErrorState error={reports.error} /> : null}
      {reports.data?.length === 0 ? (
        <EmptyState title={tab === 'open' ? 'Rien à traiter' : 'Aucun signalement'} message="Le paddock est calme." />
      ) : null}
      {resolve.error ? <Text style={styles.error}>{resolve.error.message}</Text> : null}
      {reports.data?.map((r) => (
        <ReportCard
          key={r.id}
          report={r}
          busy={resolve.isPending}
          onResolve={(status, hide) => resolve.mutate({ reportId: r.id, status, hide })}
        />
      ))}
    </Screen>
  );
}

function ReportCard({
  report: r,
  busy,
  onResolve,
}: {
  report: AdminReport;
  busy: boolean;
  onResolve: (status: 'reviewed' | 'dismissed', hide?: boolean) => void;
}) {
  const reason = REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason;
  const hasContent = !!r.message_id || !!r.photo_id;
  const hidden = r.message_hidden || r.photo_hidden;
  const target = r.photo_id ? 'Photo de circuit' : r.message_id ? 'Message Radio' : 'Pilote';

  return (
    <Card style={[styles.card, r.status === 'open' && styles.cardOpen]}>
      <View style={styles.head}>
        <Icon name={icons.report} size={16} color={colors.danger} />
        <Text style={styles.reason}>{reason}</Text>
        <Text variant="caption">{formatMessageTime(r.created_at)}</Text>
      </View>
      <Text variant="caption">
        {target} de{' '}
        <Text style={styles.link} onPress={() => router.push({ pathname: '/pilot/[id]', params: { id: r.target_id } })}>
          {r.target_username ?? 'pilote supprimé'}
        </Text>
        {r.target_report_count > 1 ? ` · ${r.target_report_count} signalements au total` : ''} · signalé par{' '}
        {r.reporter_username ?? 'pilote supprimé'}
      </Text>

      {r.message_id ? (
        <View style={styles.quote}>
          <Text style={styles.quoteText}>{r.message_body ?? (r.message_kind === 'image' ? '📷 Photo' : 'Message sans texte')}</Text>
        </View>
      ) : null}
      {r.photo_path ? <Image source={{ uri: trackPhotoUrl(r.photo_path) }} style={styles.photo} contentFit="cover" /> : null}
      {hasContent && hidden ? (
        <View style={styles.hiddenRow}>
          <Icon name={icons.hidden} size={14} color={colors.textMuted} />
          <Text variant="caption">Contenu masqué pour tous</Text>
        </View>
      ) : null}
      {r.details ? <Text style={styles.details}>« {r.details} »</Text> : null}

      {r.status === 'open' ? (
        <View style={styles.actions}>
          {hasContent ? (
            <Button title="Masquer et clore" loading={busy} onPress={() => onResolve('reviewed', true)} />
          ) : (
            <Button title="Marquer comme traité" loading={busy} onPress={() => onResolve('reviewed')} />
          )}
          <Button
            title={hasContent && hidden ? 'Rejeter et rétablir' : 'Rejeter'}
            variant="secondary"
            disabled={busy}
            onPress={() => onResolve('dismissed', hasContent && hidden ? false : undefined)}
          />
        </View>
      ) : hasContent ? (
        <Button
          title={hidden ? 'Rétablir le contenu' : 'Masquer le contenu'}
          variant="quiet"
          disabled={busy}
          onPress={() => onResolve(r.status as 'reviewed' | 'dismissed', !hidden)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger },
  card: { gap: spacing.sm },
  cardOpen: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reason: { flex: 1, fontWeight: '800' },
  link: { color: colors.neon, fontWeight: '700' },
  quote: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderLeftWidth: 3, borderLeftColor: colors.borderStrong },
  quoteText: { fontStyle: 'italic' },
  photo: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  hiddenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  details: { color: colors.textMuted },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
});
