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
import { ActionLine } from '@/features/admin/components/action-line';
import { useAdminRecentActions, useAdminStats } from '@/features/admin/panel';
import { useAuth } from '@/features/auth/auth-provider';
import { useSearchPilots } from '@/features/nearby/api';
import { SectionTitle } from '@/features/social/components/section-title';
import { useTracksMap } from '@/features/tracks/api';
import { confirmAction } from '@/lib/confirm';
import { colors, radius, spacing } from '@/theme';

/** Administration : tableau de bord et gestion (admin appli) ou fiches gérées (admin karting). */
export default function AdminScreen() {
  const roles = useAdminRoles();
  const claim = useClaimAppAdmin();
  const r = roles.data;
  const isAppAdmin = !!r?.is_app_admin;

  const stats = useAdminStats(isAppAdmin);
  const reports = useAdminReports('open', isAppAdmin);
  const requests = useAdminTrackRequests(isAppAdmin);
  const actions = useAdminRecentActions(isAppAdmin, 6);
  const respond = useRespondTrackRequest();
  const tracks = useTracksMap();
  const managed = isAppAdmin ? [] : (tracks.data ?? []).filter((t) => r?.managed_track_ids.includes(t.id));
  const s = stats.data;

  return (
    <Screen
      safeTop={false}
      refreshing={roles.isRefetching || stats.isRefetching}
      onRefresh={() => {
        roles.refetch();
        stats.refetch();
        reports.refetch();
        requests.refetch();
        actions.refetch();
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
        <>
          <View style={styles.tiles}>
            <Tile
              icon={icons.report}
              label="Signalés"
              value={reports.data?.length ?? 0}
              alert={(reports.data?.length ?? 0) > 0}
              onPress={() => router.push('/admin/reports')}
            />
            <Tile icon={icons.recruit} label="Demandes" value={requests.data?.length ?? 0} alert={(requests.data?.length ?? 0) > 0} />
            <Tile
              icon={icons.block}
              label="Sanctions"
              value={s?.restricted ?? 0}
              onPress={() => router.push({ pathname: '/admin/pilots', params: { filter: 'restricted' } })}
            />
          </View>

          {stats.error ? <ErrorState error={stats.error} /> : null}
          {s ? (
            <>
              <SectionTitle title="Cette semaine" detail="7 derniers jours" />
              <View style={styles.grid}>
                <Kpi label="Pilotes inscrits" value={s.pilots_total} delta={s.pilots_new_7d} />
                <Kpi label="Pilotes actifs" value={s.active_7d} />
                <Kpi label="Défis et courses" value={s.matches_7d + s.races_7d} />
                <Kpi label="Time Attack validés" value={s.time_attacks_7d} />
                <Kpi label="Publications" value={s.posts_7d} />
                <Kpi label="Sessions ouvertes" value={s.sessions_7d} />
              </View>
              <SignupsChart weeks={s.signups} />
              {s.top_tracks.length > 0 ? (
                <Card style={styles.card}>
                  <Text variant="label">Circuits les plus actifs · 30 jours</Text>
                  {s.top_tracks.map((t, i) => (
                    <Pressable
                      key={t.id}
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: '/track/[id]', params: { id: t.id } })}
                      style={({ pressed }) => [styles.topRow, pressed && styles.pressed]}>
                      <Text style={styles.topRank}>{i + 1}</Text>
                      <View style={styles.flex}>
                        <Text style={styles.trackName} numberOfLines={1}>{t.name}</Text>
                        <Text variant="caption">{t.city}</Text>
                      </View>
                      <Text style={styles.topCount}>{t.count}</Text>
                    </Pressable>
                  ))}
                </Card>
              ) : null}
            </>
          ) : stats.isPending ? (
            <Loading />
          ) : null}

          <SectionTitle title="Gestion" />
          <MenuRow
            icon={icons.teammates}
            title="Pilotes"
            detail={s ? `${s.pilots_total} inscrits · +${s.pilots_new_30d} ce mois-ci` : 'Rechercher, suspendre, bannir'}
            onPress={() => router.push('/admin/pilots')}
          />
          <MenuRow
            icon={icons.map}
            title="Circuits"
            detail={
              s
                ? `${s.tracks_total} en ligne · ${s.tracks_official} officiels · ${s.tracks_approx} positions à vérifier`
                : 'Créer, masquer, fusionner'
            }
            alert={(s?.tracks_approx ?? 0) > 0}
            onPress={() => router.push('/admin/tracks')}
          />
          <MenuRow
            icon={icons.megaphone}
            title="Annonces"
            detail="Message officiel affiché à tous les pilotes"
            onPress={() => router.push('/admin/announcements')}
          />
        </>
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
          <SectionTitle title="Mes karting" detail={`${managed.length}`} />
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
              <Text style={styles.badge}>Admin karting</Text>
              <Icon name={icons.edit} size={18} color={colors.neon} />
            </Pressable>
          ))}
        </>
      ) : null}

      {isAppAdmin && actions.data && actions.data.length > 0 ? (
        <>
          <SectionTitle title="Dernières actions" />
          <Card style={styles.card}>
            {actions.data.map((a) => (
              <ActionLine key={a.id} action={a} />
            ))}
            <Button title="Tout le journal" variant="ghost" onPress={() => router.push('/admin/journal')} />
          </Card>
        </>
      ) : null}

      {isAppAdmin ? <AppAdmins /> : null}
    </Screen>
  );
}

function Kpi({ label, value, delta }: { label: string; value: number; delta?: number }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiValue}>{value.toLocaleString('fr-FR')}</Text>
      <Text variant="label" numberOfLines={1}>{label}</Text>
      {delta ? <Text style={styles.kpiDelta}>+{delta} cette semaine</Text> : null}
    </View>
  );
}

/** Inscriptions par semaine (8 dernières), en barres. */
function SignupsChart({ weeks }: { weeks: { week: string; count: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <Card style={styles.card}>
      <Text variant="label">Inscriptions · 8 semaines</Text>
      <View style={styles.chart}>
        {weeks.map((w, i) => (
          <View key={w.week} style={styles.barCol}>
            <Text style={styles.barValue}>{w.count}</Text>
            <View
              style={[
                styles.bar,
                { height: 6 + (w.count / max) * 84 },
                i === weeks.length - 1 && styles.barCurrent,
              ]}
            />
            <Text style={styles.barLabel}>
              {new Date(w.week).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' })}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function MenuRow({ icon, title, detail, alert, onPress }: { icon: IconName; title: string; detail: string; alert?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.trackRow, pressed && styles.pressed]}>
      <Icon name={icon} size={22} color={alert ? colors.orange : colors.neon} />
      <View style={styles.flex}>
        <Text style={styles.trackName}>{title}</Text>
        <Text variant="caption">{detail}</Text>
      </View>
      <Icon name={icons.chevron} size={16} color={colors.textMuted} />
    </Pressable>
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
      <Text variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {label}
      </Text>
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
  tiles: { flexDirection: 'row', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kpi: {
    width: '48.5%',
    flexGrow: 1,
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  kpiValue: { fontSize: 26, fontWeight: '900', color: colors.text },
  kpiDelta: { fontSize: 12, fontWeight: '700', color: colors.neon },
  card: { gap: spacing.sm },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 130, paddingTop: spacing.sm },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '100%', borderRadius: 3, backgroundColor: colors.borderStrong },
  barCurrent: { backgroundColor: colors.neon },
  barValue: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  barLabel: { fontSize: 9, color: colors.textMuted },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  topRank: { width: 18, fontWeight: '900', color: colors.neon },
  topCount: { fontWeight: '800', color: colors.text },
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
  tileValue: { fontSize: 24, fontWeight: '900' },
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
