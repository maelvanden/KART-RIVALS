import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { useResolveTrackCorrection, useSetTrackHidden, useTrackCorrections, type TrackCorrection } from '@/features/admin/panel';
import { CORRECTION_KINDS } from '@/features/tracks/corrections';
import { confirmAction } from '@/lib/confirm';
import { formatMessageTime } from '@/lib/format';
import { distanceKm } from '@/lib/geo';
import { colors, radius, spacing } from '@/theme';

/** Remontées des pilotes sur les fiches circuit (admins appli : toutes ; admins karting : leurs circuits). */
export default function CorrectionsScreen() {
  const roles = useAdminRoles().data;
  const allowed = !!roles && (roles.is_app_admin || roles.managed_track_ids.length > 0);
  const [status, setStatus] = useState<'open' | 'done'>('open');
  const list = useTrackCorrections(status, allowed);

  if (roles && !allowed) return <Screen safeTop={false}><EmptyState title="Réservé aux admins" /></Screen>;

  return (
    <Screen safeTop={false} refreshing={list.isRefetching} onRefresh={list.refetch}>
      <Segmented
        options={[
          { value: 'open', label: 'À traiter' },
          { value: 'done', label: 'Traitées' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <Text variant="caption">
        Les pilotes signalent les erreurs depuis la fiche du circuit. Une remontée appliquée rapporte 20 points à son auteur.
      </Text>
      {list.isPending ? <Loading /> : null}
      {list.error ? <ErrorState error={list.error} /> : null}
      {list.data?.length === 0 ? (
        <EmptyState title={status === 'open' ? 'Rien à traiter' : 'Aucune remontée traitée'} message="Les fiches sont à jour." />
      ) : null}
      {list.data?.map((c) => <CorrectionCard key={c.id} correction={c} isAppAdmin={!!roles?.is_app_admin} />)}
    </Screen>
  );
}

function CorrectionCard({ correction: c, isAppAdmin }: { correction: TrackCorrection; isAppAdmin: boolean }) {
  const resolve = useResolveTrackCorrection();
  const hide = useSetTrackHidden();
  const kind = CORRECTION_KINDS.find((k) => k.value === c.kind)?.label ?? c.kind;
  const hasPosition = c.suggested_lat != null && c.suggested_lng != null;
  const gap =
    hasPosition && c.current_lat != null && c.current_lng != null
      ? distanceKm({ lat: c.current_lat, lng: c.current_lng }, { lat: c.suggested_lat!, lng: c.suggested_lng! })
      : null;
  const open = c.status === 'open';
  const error = resolve.error ?? hide.error;

  return (
    <Card style={[styles.card, open && styles.open]}>
      <View style={styles.head}>
        <Text style={styles.kind}>{kind}</Text>
        <Text variant="caption">{formatMessageTime(c.created_at)}</Text>
      </View>
      <Text
        style={styles.track}
        accessibilityRole="link"
        onPress={() => router.push({ pathname: '/admin/track/[id]', params: { id: c.track_id } })}>
        {c.track_name} <Text variant="caption">· {c.track_city}</Text>
      </Text>
      {c.message ? <Text style={styles.message}>« {c.message} »</Text> : null}
      {hasPosition ? (
        <View style={styles.position}>
          <Text variant="caption">
            Position proposée : {c.suggested_lat!.toFixed(5)}, {c.suggested_lng!.toFixed(5)}
            {gap != null ? ` · à ${gap < 1 ? `${Math.round(gap * 1000)} m` : `${gap.toFixed(1)} km`} de l’actuelle` : ''}
          </Text>
          <Button
            title="Voir sur la carte"
            variant="ghost"
            onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${c.suggested_lat},${c.suggested_lng}`)}
          />
        </View>
      ) : null}
      <Text variant="caption">
        Par {c.author ?? 'pilote supprimé'}
        {c.status !== 'open'
          ? ` · ${c.status === 'applied' ? 'appliquée' : 'rejetée'} par ${c.handled_by ?? '?'}${c.handled_at ? ` ${formatMessageTime(c.handled_at)}` : ''}`
          : ''}
      </Text>

      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      {open ? (
        <>
          {hasPosition ? (
            <Button
              title="Appliquer cette position"
              loading={resolve.isPending}
              onPress={() =>
                confirmAction('Déplacer le circuit ?', 'Le circuit sera placé sur la position proposée par le pilote.', 'Appliquer', () =>
                  resolve.mutate({ id: c.id, status: 'applied', applyPosition: true }),
                )
              }
            />
          ) : null}
          {c.kind === 'closed' && isAppAdmin ? (
            <Button
              title="Masquer le circuit"
              loading={hide.isPending}
              onPress={() =>
                confirmAction('Masquer ce circuit ?', 'Il disparaît pour les pilotes (réversible depuis sa fiche).', 'Masquer', () =>
                  hide.mutate(
                    { trackId: c.track_id, hidden: true },
                    { onSuccess: () => resolve.mutate({ id: c.id, status: 'applied' }) },
                  ),
                )
              }
            />
          ) : null}
          <View style={styles.row}>
            <Button
              title="Modifier"
              variant="secondary"
              style={styles.flex}
              onPress={() => router.push({ pathname: '/admin/track/[id]', params: { id: c.track_id } })}
            />
            <Button
              title="Corrigé ✓"
              variant="secondary"
              style={styles.flex}
              disabled={resolve.isPending}
              onPress={() => resolve.mutate({ id: c.id, status: 'applied' })}
            />
          </View>
          <Button title="Rejeter" variant="quiet" disabled={resolve.isPending} onPress={() => resolve.mutate({ id: c.id, status: 'dismissed' })} />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  open: { borderLeftWidth: 3, borderLeftColor: colors.orange },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kind: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.orange },
  track: { fontWeight: '800', fontSize: 16, color: colors.neon },
  message: { fontStyle: 'italic' },
  position: { gap: 2, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  error: { color: colors.danger },
});
