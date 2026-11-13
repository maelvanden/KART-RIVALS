import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles, useCanManageTrack } from '@/features/admin/api';
import { trend, useTrackStats, type TrackStats } from '@/features/admin/track-stats';
import { eventWhen } from '@/features/events/format';
import { SectionTitle } from '@/features/social/components/section-title';
import { useTrack } from '@/features/tracks/api';
import { formatLapTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;

/** Statistiques d'une fiche circuit, pour ses admins karting et les admins appli. */
export default function TrackStatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const track = useTrack(id);
  const roles = useAdminRoles();
  const canManage = useCanManageTrack(id);
  const stats = useTrackStats(id, canManage);
  const s = stats.data;

  return (
    <Screen safeTop={false} refreshing={stats.isRefetching} onRefresh={stats.refetch}>
      <Stack.Screen options={{ title: track.data ? `Stats · ${track.data.name}` : 'Statistiques' }} />
      {roles.isPending || (canManage && stats.isPending) ? <Loading /> : null}
      {roles.data && !canManage ? (
        <EmptyState title="Accès réservé" message="Seuls les admins de ce karting et les admins appli voient ces statistiques." />
      ) : null}
      {stats.error ? <ErrorState error={stats.error} /> : null}
      {s ? (
        <>
          <Text variant="caption">
            30 derniers jours, comparés aux 30 jours d’avant. Un pilote est compté quand un de ses résultats sur ton
            circuit est validé : défi, course ou Time Attack.
          </Text>

          <View style={styles.grid}>
            <Kpi
              label="Visites de la fiche"
              value={s.views_30d}
              delta={trend(s.views_30d, s.views_prev_30d)}
              detail={plural(s.viewers_30d, 'pilote différent', 'pilotes différents')}
            />
            <Kpi
              label="Pilotes sur piste"
              value={s.pilots_30d}
              delta={trend(s.pilots_30d, s.pilots_prev_30d)}
              detail={`${plural(s.pilots_total, 'pilote')} depuis le début`}
            />
            <Kpi label="Nouveaux pilotes" value={s.new_pilots_30d} detail="Premier résultat chez toi" />
            <Kpi label="Circuit favori" value={s.fans} detail="Pilotes qui t’ont choisi" />
            <Kpi
              label="Note moyenne"
              value={s.rating != null ? s.rating.toLocaleString('fr-FR', { minimumFractionDigits: 1 }) : '–'}
              detail={
                s.reviews === 0
                  ? 'Aucun avis pour l’instant'
                  : `${plural(s.reviews, 'avis', 'avis')}${s.reviews_30d > 0 ? ` · +${s.reviews_30d} ce mois-ci` : ''}`
              }
            />
            <Kpi
              label="Résultats validés"
              value={s.matches_30d + s.races_30d + s.time_attacks_30d}
              detail={`${plural(s.matches_30d, 'défi')} · ${plural(s.races_30d, 'course')} · ${s.time_attacks_30d} Time Attack`}
            />
          </View>

          <WeeksChart weeks={s.weeks} />

          <SectionTitle title="Record du tour" />
          {s.record ? (
            <Card style={styles.record}>
              <Icon name={icons.trophy} size={24} color={colors.neon} />
              <View style={styles.flex}>
                <Text style={styles.recordTime}>{formatLapTime(s.record.lap_ms)}</Text>
                <Text variant="caption">
                  {s.record.username} · {new Date(s.record.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            </Card>
          ) : (
            <Text variant="caption">Aucun chrono validé sur ton circuit pour l’instant.</Text>
          )}

          <SectionTitle title="Tes habitués" detail="90 jours" />
          {s.regulars.length === 0 ? <Text variant="caption">Aucun résultat validé ces 90 derniers jours.</Text> : null}
          {s.regulars.map((p) => (
            <PilotRow
              key={p.id}
              pilotId={p.id}
              username={p.username}
              avatarUrl={p.avatar_url}
              rank={p.rank}
              elo={p.elo}
              subtitle={plural(p.count, 'résultat validé', 'résultats validés')}
            />
          ))}

          <SectionTitle title="Événements et promos" detail={`${s.events_upcoming + s.promos_active} en cours`} />
          <Text variant="caption">
            Ce mois-ci : {plural(s.interests_30d, 'pilote intéressé', 'pilotes intéressés')} par tes événements,{' '}
            {plural(s.reveals_30d, 'code promo affiché', 'codes promo affichés')}.
          </Text>
          {s.live.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.flex}>
                <Text style={styles.bold} numberOfLines={1}>{e.title}</Text>
                <Text variant="caption">{eventWhen(e)}</Text>
              </View>
              <Text style={styles.count}>
                {e.kind === 'promo' ? plural(e.reveals, 'code affiché', 'codes affichés') : plural(e.interests, 'intéressé')}
              </Text>
            </Pressable>
          ))}
          <Button
            title={s.live.length === 0 ? 'Publier un événement ou une promo' : 'Publier autre chose'}
            variant="secondary"
            icon={<Icon name={icons.megaphone} size={18} color={colors.text} />}
            onPress={() => router.push({ pathname: '/admin/event', params: { trackId: id } })}
          />

          <SectionTitle title="Sur ta fiche" />
          <Card style={styles.card}>
            <Line label="Photos des pilotes" value={s.photos} />
            <Line label="Sessions ouvertes à venir" value={s.sessions_upcoming} />
            <Line label="Tournois en cours ou ouverts" value={s.tournaments_live} />
            <Line label="Erreurs signalées à traiter" value={s.corrections_open} alert={s.corrections_open > 0} />
          </Card>
          {s.corrections_open > 0 ? (
            <Button title="Voir les remontées des pilotes" variant="ghost" onPress={() => router.push('/admin/corrections')} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function Kpi({ label, value, delta, detail }: { label: string; value: number | string; delta?: number | null; detail?: string }) {
  return (
    <View style={styles.kpi}>
      <View style={styles.kpiHead}>
        <Text style={styles.kpiValue}>{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}</Text>
        {delta != null && delta !== 0 ? (
          <Text style={[styles.kpiDelta, delta < 0 && styles.kpiDown]}>
            {delta > 0 ? '+' : '−'}
            {Math.abs(delta)} %
          </Text>
        ) : null}
      </View>
      <Text variant="label" numberOfLines={1}>{label}</Text>
      {detail ? <Text variant="caption" style={styles.kpiDetail}>{detail}</Text> : null}
    </View>
  );
}

/** Pilotes venus rouler ou visites de la fiche, par semaine (8 dernières), en barres. */
function WeeksChart({ weeks }: { weeks: TrackStats['weeks'] }) {
  const [metric, setMetric] = useState<'pilots' | 'views'>('pilots');
  const max = Math.max(1, ...weeks.map((w) => w[metric]));
  return (
    <Card style={styles.card}>
      <Text variant="label">Par semaine · 8 semaines</Text>
      <Segmented
        options={[
          { value: 'pilots', label: 'Pilotes' },
          { value: 'views', label: 'Visites' },
        ]}
        value={metric}
        onChange={setMetric}
      />
      <View style={styles.chart}>
        {weeks.map((w, i) => (
          <View key={w.week} style={styles.barCol}>
            <Text style={styles.barValue}>{w[metric]}</Text>
            <View style={[styles.bar, { height: 6 + (w[metric] / max) * 84 }, i === weeks.length - 1 && styles.barCurrent]} />
            <Text style={styles.barLabel}>
              {new Date(w.week).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' })}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption">La dernière barre est la semaine en cours.</Text>
    </Card>
  );
}

function Line({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={styles.flex}>{label}</Text>
      <Text style={[styles.bold, alert && styles.alert]}>{value.toLocaleString('fr-FR')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '800' },
  alert: { color: colors.orange },
  pressed: { opacity: 0.8 },
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
  kpiHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  kpiValue: { fontSize: 26, fontWeight: '900', color: colors.text },
  kpiDelta: { fontSize: 12, fontWeight: '700', color: colors.neon },
  kpiDown: { color: colors.orange },
  kpiDetail: { fontSize: 12 },
  card: { gap: spacing.sm },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 130, paddingTop: spacing.sm },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '100%', borderRadius: 3, backgroundColor: colors.borderStrong },
  barCurrent: { backgroundColor: colors.neon },
  barValue: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  barLabel: { fontSize: 9, color: colors.textMuted },
  record: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recordTime: { fontSize: 24, fontWeight: '900', color: colors.text },
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
  count: { fontSize: 12, fontWeight: '800', color: colors.neon },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
