import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons, type IconName } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import {
  useAdminReports,
  useAdminRoles,
  useAdminTrackRequests,
  useAppAdmins,
  useClaimAppAdmin,
  useRespondTrackRequest,
  useSetAppAdmin,
} from '@/features/admin/api';
import { useAuth } from '@/features/auth/auth-provider';
import { useSearchPilots } from '@/features/nearby/api';
import { SectionTitle } from '@/features/social/components/section-title';
import { useTracksMap } from '@/features/tracks/api';
import { confirmAction } from '@/lib/confirm';
import { colors, radius, spacing } from '@/theme';

/** Administration : admin appli (signalements, demandes, fiches, admins) ou admin karting (ses fiches). */
export default function AdminScreen() {
  const roles = useAdminRoles();
  const claim = useClaimAppAdmin();
  const r = roles.data;
  const isAppAdmin = !!r?.is_app_admin;

  const reports = useAdminReports('open', isAppAdmin);
  const requests = useAdminTrackRequests(isAppAdmin);
  const respond = useRespondTrackRequest();
  const tracks = useTracksMap();
  const managed = (tracks.data ?? []).filter((t) => isAppAdmin || r?.managed_track_ids.includes(t.id));

  return (
    <Screen
      safeTop={false}
      refreshing={roles.isRefetching}
      onRefresh={() => {
        roles.refetch();
        reports.refetch();
        requests.refetch();
      }}>
      {roles.isPending ? <Loading /> : null}
      {roles.error ? <ErrorState error={roles.error} /> : null}

      {r && !r.admin_exists ? (
        <Card style={styles.claim}>
          <Icon name={icons.admin} size={28} color={colors.neon} />
          <Text variant="heading">Aucun admin pour l’instant</Text>
          <Text variant="caption">
            Le premier pilote qui se déclare devient admin de l’application : il gère toutes les fiches circuit, nomme
            les admins karting et traite les signalements.
          </Text>
          {claim.error ? <Text style={styles.error}>{claim.error.message}</Text> : null}
          <Button title="Devenir admin de l’appli" loading={claim.isPending} onPress={() => claim.mutate()} />
        </Card>
      ) : null}

      {r && r.admin_exists && !isAppAdmin && r.managed_track_ids.length === 0 ? (
        <EmptyState
          title="Accès réservé"
          message="Tu gères un karting ? Ouvre sa fiche et touche « Vous gérez ce karting ? » pour demander l’accès."
        />
      ) : null}

      {isAppAdmin ? (
        <View style={styles.tiles}>
          <Tile
            icon={icons.report}
            label="Signalements"
            value={reports.data?.length ?? 0}
            alert={(reports.data?.length ?? 0) > 0}
            onPress={() => router.push('/admin/reports')}
          />
          <Tile icon={icons.recruit} label="Demandes" value={requests.data?.length ?? 0} alert={(requests.data?.length ?? 0) > 0} />
        </View>
      ) : null}

      {isAppAdmin && requests.data && requests.data.length > 0 ? (
        <>
          <SectionTitle title="Demandes de gestion" detail={`${requests.data.length}`} accent={colors.orange} />
          {requests.data.map((q) => (
            <Card key={q.id} style={styles.request}>
              <PilotRow
                pilotId={q.profile_id}
                username={q.username}
                avatarUrl={q.avatar_url}
                rank={q.rank}
                elo={q.elo}
                subtitle={`Veut gérer ${q.track_name}`}
              />
              {q.message ? <Text variant="caption">« {q.message} »</Text> : null}
              <View style={styles.row}>
                <Button
                  title="Refuser"
                  variant="secondary"
                  style={styles.flex}
                  disabled={respond.isPending}
                  onPress={() => respond.mutate({ request: q, accept: false })}
                />
                <Button
                  title="Valider"
                  style={styles.flex}
                  loading={respond.isPending}
                  onPress={() => respond.mutate({ request: q, accept: true })}
                />
              </View>
            </Card>
          ))}
          {respond.error ? <Text style={styles.error}>{respond.error.message}</Text> : null}
        </>
      ) : null}

      {managed.length > 0 ? (
        <>
          <SectionTitle title={isAppAdmin ? 'Fiches circuit' : 'Mes karting'} detail={`${managed.length}`} />
          {managed.map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/admin/track/[id]', params: { id: t.id } })}
              style={({ pressed }) => [styles.trackRow, pressed && styles.pressed]}>
              <View style={styles.flex}>
                <Text style={styles.trackName}>{t.name}</Text>
                <Text variant="caption">{t.city}</Text>
              </View>
              {r?.managed_track_ids.includes(t.id) ? <Text style={styles.badge}>Admin karting</Text> : null}
              <Icon name={icons.edit} size={18} color={colors.neon} />
            </Pressable>
          ))}
        </>
      ) : null}

      {isAppAdmin ? <AppAdmins /> : null}
    </Screen>
  );
}

function Tile({ icon, label, value, alert, onPress }: { icon: IconName; label: string; value: number; alert?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, alert && styles.tileAlert, pressed && styles.pressed]}>
      <Icon name={icon} size={20} color={alert ? colors.orange : colors.neon} />
      <Text style={styles.tileValue}>{value}</Text>
      <Text variant="label">{label}</Text>
    </Pressable>
  );
}

/** Admins appli : liste, ajout par @pseudo, retrait. */
function AppAdmins() {
  const { userId } = useAuth();
  const admins = useAppAdmins(true);
  const setAdmin = useSetAppAdmin();
  const [query, setQuery] = useState('');
  const q = query.replace(/^@/, '').trim();
  const search = useSearchPilots(q);
  const ids = new Set((admins.data ?? []).map((a) => a.id));

  return (
    <>
      <SectionTitle title="Admins appli" detail={`${admins.data?.length ?? ''}`} />
      {admins.data?.map((a) => (
        <PilotRow
          key={a.id}
          pilotId={a.id}
          username={a.username}
          avatarUrl={a.avatar_url}
          rank={a.rank}
          elo={a.elo}
          subtitle={a.id === userId ? 'Toi' : 'Admin appli'}
          trailing={
            a.id !== userId ? (
              <Button
                title="Retirer"
                variant="quiet"
                onPress={() =>
                  confirmAction(`Retirer ${a.username} ?`, 'Il ne sera plus admin de l’application.', 'Retirer', () =>
                    setAdmin.mutate({ pilotId: a.id, admin: false }),
                  )
                }
              />
            ) : null
          }
        />
      ))}
      <Input label="Nommer un admin appli" value={query} onChangeText={setQuery} placeholder="@pseudo" autoCapitalize="none" autoCorrect={false} />
      {q.length >= 2
        ? search.data
            ?.filter((p) => !ids.has(p.id))
            .map((p) => (
              <PilotRow
                key={p.id}
                pilotId={p.id}
                username={p.username}
                avatarUrl={p.avatar_url}
                rank={p.rank}
                elo={p.elo}
                subtitle={`@${p.username}`}
                trailing={
                  <Button
                    title="Nommer"
                    variant="ghost"
                    onPress={() =>
                      confirmAction(
                        `Nommer ${p.username} admin ?`,
                        'Il aura tous les droits : fiches, admins karting, signalements et autres admins.',
                        'Nommer',
                        () => {
                          setAdmin.mutate({ pilotId: p.id, admin: true });
                          setQuery('');
                        },
                      )
                    }
                  />
                }
              />
            ))
        : null}
      {setAdmin.error ? <Text style={styles.error}>{setAdmin.error.message}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  claim: { gap: spacing.md, alignItems: 'flex-start', borderLeftWidth: 3, borderLeftColor: colors.neon },
  error: { color: colors.danger },
  tiles: { flexDirection: 'row', gap: spacing.md },
  tile: {
    flex: 1,
    gap: 4,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileAlert: { borderLeftWidth: 3, borderLeftColor: colors.orange },
  tileValue: { fontSize: 28, fontWeight: '900' },
  request: { gap: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.orange },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  trackName: { fontWeight: '800' },
  badge: { fontSize: 11, fontWeight: '800', color: colors.neon, textTransform: 'uppercase' },
  pressed: { opacity: 0.8 },
});
