import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { ActivityMap } from '@/features/admin/components/activity-map';
import {
  isShortage,
  useActivityMap,
  useAdminStats,
  useRetention,
  type ActivityDept,
  type AdminStats,
  type Retention,
} from '@/features/admin/panel';
import { SectionTitle } from '@/features/social/components/section-title';
import { shareCsv, toCsv } from '@/lib/csv';
import { DEPARTMENT_NAMES, REGIONS, regionOfDepartment } from '@/lib/regions';
import { colors, radius, spacing } from '@/theme';

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
const duration = (hours: number | null) =>
  hours == null ? '—' : hours < 48 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} j`;
const deptName = (code: string) => DEPARTMENT_NAMES[code] ?? code;

/** Statistiques avancées : où sont les pilotes, où manquent les kartings, fidélité, export tableur. */
export default function InsightsScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const [tab, setTab] = useState<'map' | 'retention'>('map');
  const map = useActivityMap(isAppAdmin);
  const retention = useRetention(isAppAdmin);
  const stats = useAdminStats(isAppAdmin);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  async function exportAll() {
    setExporting(true);
    setExportError(null);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await shareCsv(`kart-rivals-stats-${date}.csv`, buildCsv(stats.data, map.data ?? [], retention.data));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export impossible.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen
      safeTop={false}
      refreshing={map.isRefetching || retention.isRefetching}
      onRefresh={() => {
        map.refetch();
        retention.refetch();
        stats.refetch();
      }}>
      <Button
        title="Exporter en tableur"
        variant="secondary"
        icon={<Icon name={icons.share} size={18} color={colors.text} />}
        loading={exporting}
        disabled={!map.data || !retention.data || !stats.data}
        onPress={exportAll}
      />
      <Text variant="caption">
        Fichier CSV avec les chiffres clés, l’activité par département et la fidélité : il s’ouvre dans Numbers, Excel ou
        Google Sheets.
      </Text>
      {exportError ? <Text style={styles.error}>{exportError}</Text> : null}
      <Segmented
        options={[
          { value: 'map', label: 'Carte d’activité' },
          { value: 'retention', label: 'Fidélité' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'map' ? (
        map.isPending ? <Loading /> : map.error ? <ErrorState error={map.error} /> : <MapTab depts={map.data ?? []} />
      ) : retention.isPending ? (
        <Loading />
      ) : retention.error ? (
        <ErrorState error={retention.error} />
      ) : retention.data ? (
        <RetentionTab data={retention.data} />
      ) : null}
    </Screen>
  );
}

// ---------- Carte d'activité ----------

function MapTab({ depts }: { depts: ActivityDept[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [openRegion, setOpenRegion] = useState<string | null>(null);
  const located = depts.filter((d) => d.dept);
  const unlocated = depts.find((d) => !d.dept)?.pilots ?? 0;
  const current = located.find((d) => d.dept === selected);
  const shortages = located
    .filter(isShortage)
    .sort((a, b) => b.pilots / Math.max(1, b.tracks) - a.pilots / Math.max(1, a.tracks))
    .slice(0, 8);
  // Calcul léger (13 régions) : le React Compiler s'occupe de la mémorisation.
  const regions = REGIONS.map((r) => {
        const list = located.filter((d) => regionOfDepartment(d.dept) === r.name).sort((a, b) => b.pilots - a.pilots);
        const sum = (k: 'pilots' | 'active_30d' | 'tracks' | 'far_pilots') => list.reduce((a, d) => a + d[k], 0);
        return { name: r.name, depts: list, pilots: sum('pilots'), active: sum('active_30d'), tracks: sum('tracks'), far: sum('far_pilots') };
      })
    .filter((r) => r.pilots > 0 || r.tracks > 0)
    .sort((a, b) => b.pilots - a.pilots);

  return (
    <>
      <Text variant="caption">
        Une bulle par département : sa taille suit le nombre de pilotes. En orange, il manque des kartings (plus de 60 pilotes
        par circuit, ou un pilote sur quatre à plus de 40 km d’un circuit). Touche une bulle pour le détail.
      </Text>
      <ActivityMap depts={located} height={330} selected={selected} onSelect={setSelected} />
      {current ? <DeptCard dept={current} /> : null}

      {shortages.length > 0 ? (
        <>
          <SectionTitle title="Où il manque des kartings" accent={colors.orange} />
          {shortages.map((d) => (
            <DeptLine key={d.dept} dept={d} onPress={() => setSelected(d.dept)} />
          ))}
        </>
      ) : null}

      <SectionTitle title="Par région" />
      {regions.map((r) => (
        <Card key={r.name} style={styles.card}>
          <Pressable accessibilityRole="button" onPress={() => setOpenRegion((o) => (o === r.name ? null : r.name))} style={styles.regionHead}>
            <View style={styles.flex}>
              <Text style={styles.bold}>{r.name}</Text>
              <Text variant="caption">
                {r.pilots} pilotes · {r.active} actifs (30 j) · {r.tracks} circuits
                {r.tracks > 0 ? ` · ${Math.round(r.pilots / r.tracks)} pilotes/circuit` : ''}
              </Text>
            </View>
            <Icon name={icons.chevron} size={14} color={colors.textMuted} />
          </Pressable>
          {openRegion === r.name ? r.depts.map((d) => <DeptLine key={d.dept} dept={d} onPress={() => setSelected(d.dept)} />) : null}
        </Card>
      ))}
      {unlocated > 0 ? (
        <Text variant="caption">
          {unlocated} pilote{unlocated > 1 ? 's' : ''} sans circuit favori ni position : non placé{unlocated > 1 ? 's' : ''} sur la carte.
        </Text>
      ) : null}
    </>
  );
}

function DeptCard({ dept: d }: { dept: ActivityDept }) {
  return (
    <Card style={[styles.card, isShortage(d) && styles.shortage]}>
      <Text style={styles.bold}>
        {d.dept} · {deptName(d.dept!)}
      </Text>
      <View style={styles.grid}>
        <Mini value={d.pilots} label="pilotes" />
        <Mini value={d.active_30d} label="actifs 30 j" />
        <Mini value={d.new_30d} label="nouveaux 30 j" />
        <Mini value={d.tracks} label="circuits" />
        <Mini value={d.tracks > 0 ? Math.round(d.pilots / d.tracks) : d.pilots} label="pilotes/circuit" />
        <Mini value={d.far_pilots} label="à + de 40 km" alert={d.far_pilots > 0} />
      </View>
    </Card>
  );
}

function DeptLine({ dept: d, onPress }: { dept: ActivityDept; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={!onPress} onPress={onPress} style={styles.deptLine}>
      <Text style={[styles.deptCode, isShortage(d) && { color: colors.orange }]}>{d.dept}</Text>
      <View style={styles.flex}>
        <Text style={styles.bold} numberOfLines={1}>{deptName(d.dept!)}</Text>
        <Text variant="caption">
          {d.pilots} pilotes · {d.tracks} circuit{d.tracks > 1 ? 's' : ''}
          {d.far_pilots > 0 ? ` · ${d.far_pilots} à + de 40 km` : ''}
        </Text>
      </View>
      <Text style={styles.ratio}>{d.tracks > 0 ? Math.round(d.pilots / d.tracks) : '∞'}</Text>
    </Pressable>
  );
}

function Mini({ value, label, alert }: { value: number; label: string; alert?: boolean }) {
  return (
    <View style={styles.mini}>
      <Text style={[styles.miniValue, alert && { color: colors.orange }]}>{value}</Text>
      <Text variant="caption" numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ---------- Fidélité ----------

function RetentionTab({ data: r }: { data: Retention }) {
  return (
    <>
      <View style={styles.grid}>
        <Kpi value={pct(r.returned_7d, r.eligible_7d)} label="reviennent après 1 semaine" detail={`${r.returned_7d} sur ${r.eligible_7d}`} />
        <Kpi value={pct(r.returned_30d, r.eligible_30d)} label="reviennent après 1 mois" detail={`${r.returned_30d} sur ${r.eligible_30d}`} />
        <Kpi value={pct(r.with_challenge, r.pilots)} label="ont lancé ou reçu un défi" detail={`${r.with_challenge} sur ${r.pilots}`} />
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{duration(r.median_hours_to_challenge)}</Text>
          <Text variant="label">délai avant le 1er défi</Text>
          <Text variant="caption">médiane · moyenne {duration(r.avg_hours_to_challenge)}</Text>
        </View>
      </View>
      <Text variant="caption">
        « Revient » : au moins une action (défi, course, Time Attack, publication, message, session…) 7 ou 30 jours après
        l’inscription. Seuls les pilotes inscrits depuis assez longtemps sont comptés.
      </Text>

      <SectionTitle title="Par mois d’inscription" />
      <Card style={styles.card}>
        <View style={[styles.tr, styles.th]}>
          <Text style={[styles.td, styles.month, styles.thText]}>Mois</Text>
          <Text style={[styles.td, styles.thText]}>Inscrits</Text>
          <Text style={[styles.td, styles.thText]}>J+7</Text>
          <Text style={[styles.td, styles.thText]}>J+30</Text>
          <Text style={[styles.td, styles.thText]}>Défi</Text>
          <Text style={[styles.td, styles.thText]}>Délai</Text>
        </View>
        {r.cohorts.map((c) => (
          <View key={c.month} style={styles.tr}>
            <Text style={[styles.td, styles.month]}>
              {new Date(`${c.month}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
            </Text>
            <Text style={styles.td}>{c.signups}</Text>
            <Text style={styles.td}>{c.eligible_7d ? `${pct(c.returned_7d, c.eligible_7d)} %` : '—'}</Text>
            <Text style={styles.td}>{c.eligible_30d ? `${pct(c.returned_30d, c.eligible_30d)} %` : '—'}</Text>
            <Text style={styles.td}>{`${pct(c.with_challenge, c.signups) ?? 0} %`}</Text>
            <Text style={styles.td}>{duration(c.median_hours_to_challenge)}</Text>
          </View>
        ))}
        {r.cohorts.length === 0 ? <Text variant="caption">Pas encore d’inscriptions.</Text> : null}
      </Card>
    </>
  );
}

function Kpi({ value, label, detail }: { value: number | null; label: string; detail: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiValue}>{value == null ? '—' : `${value} %`}</Text>
      <Text variant="label">{label}</Text>
      <Text variant="caption">{detail}</Text>
    </View>
  );
}

// ---------- Export ----------

function buildCsv(stats: AdminStats | undefined, depts: ActivityDept[], retention: Retention | undefined): string {
  const rows: (string | number | null)[][] = [];
  rows.push(['Kart Rivals : statistiques', new Date().toLocaleString('fr-FR')], []);
  if (stats) {
    rows.push(['CHIFFRES CLÉS'], ['Indicateur', 'Valeur']);
    rows.push(
      ['Pilotes inscrits', stats.pilots_total],
      ['Nouveaux pilotes (7 j)', stats.pilots_new_7d],
      ['Nouveaux pilotes (30 j)', stats.pilots_new_30d],
      ['Pilotes actifs (7 j)', stats.active_7d],
      ['Défis validés (7 j)', stats.matches_7d],
      ['Courses validées (7 j)', stats.races_7d],
      ['Time Attack validés (7 j)', stats.time_attacks_7d],
      ['Publications (7 j)', stats.posts_7d],
      ['Sessions ouvertes (7 j)', stats.sessions_7d],
      ['Avis (7 j)', stats.reviews_7d],
      ['Signalements ouverts', stats.reports_open],
      ['Pilotes sanctionnés', stats.restricted],
      ['Circuits en ligne', stats.tracks_total],
      ['Kartings officiels', stats.tracks_official],
      ['Circuits masqués', stats.tracks_hidden],
      ['Positions à vérifier', stats.tracks_approx],
      [],
      ['INSCRIPTIONS PAR SEMAINE'],
      ['Semaine du', 'Inscriptions'],
      ...stats.signups.map((w) => [new Date(w.week).toLocaleDateString('fr-FR'), w.count]),
      [],
      ['CIRCUITS LES PLUS ACTIFS (30 J)'],
      ['Circuit', 'Ville', 'Activités'],
      ...stats.top_tracks.map((t) => [t.name, t.city, t.count]),
      [],
    );
  }
  rows.push(
    ['ACTIVITÉ PAR DÉPARTEMENT'],
    ['N°', 'Département', 'Région', 'Pilotes', 'Actifs 30 j', 'Nouveaux 30 j', 'Circuits', 'Pilotes par circuit', 'Pilotes à + de 40 km', 'Manque de kartings'],
    ...depts.map((d) => [
      d.dept ?? '—',
      d.dept ? deptName(d.dept) : 'Non localisés',
      regionOfDepartment(d.dept) ?? '',
      d.pilots,
      d.active_30d,
      d.new_30d,
      d.tracks,
      d.tracks > 0 ? Math.round((d.pilots / d.tracks) * 10) / 10 : null,
      d.far_pilots,
      d.dept && isShortage(d) ? 'oui' : 'non',
    ]),
    [],
  );
  if (retention) {
    rows.push(
      ['FIDÉLITÉ'],
      ['Indicateur', 'Valeur', 'Détail'],
      ['Reviennent après 1 semaine (%)', pct(retention.returned_7d, retention.eligible_7d), `${retention.returned_7d} sur ${retention.eligible_7d}`],
      ['Reviennent après 1 mois (%)', pct(retention.returned_30d, retention.eligible_30d), `${retention.returned_30d} sur ${retention.eligible_30d}`],
      ['Ont fait un défi (%)', pct(retention.with_challenge, retention.pilots), `${retention.with_challenge} sur ${retention.pilots}`],
      ['Délai médian avant le 1er défi (heures)', retention.median_hours_to_challenge],
      ['Délai moyen avant le 1er défi (heures)', retention.avg_hours_to_challenge],
      [],
      ['FIDÉLITÉ PAR MOIS D’INSCRIPTION'],
      ['Mois', 'Inscrits', 'Revenus J+7 (%)', 'Revenus J+30 (%)', 'Ont fait un défi (%)', 'Délai médian 1er défi (heures)'],
      ...retention.cohorts.map((c) => [
        c.month,
        c.signups,
        c.eligible_7d ? pct(c.returned_7d, c.eligible_7d) : null,
        c.eligible_30d ? pct(c.returned_30d, c.eligible_30d) : null,
        pct(c.with_challenge, c.signups),
        c.median_hours_to_challenge,
      ]),
    );
  }
  return toCsv(rows);
}

const styles = StyleSheet.create({
  error: { color: colors.danger },
  card: { gap: spacing.sm },
  shortage: { borderLeftWidth: 3, borderLeftColor: colors.orange },
  flex: { flex: 1 },
  bold: { fontWeight: '800' },
  regionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  deptLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    marginBottom: 4,
  },
  deptCode: { width: 26, fontWeight: '900', color: colors.neon },
  ratio: { fontWeight: '900', fontSize: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mini: { width: '31%', flexGrow: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  miniValue: { fontWeight: '900', fontSize: 18 },
  kpi: {
    width: '48%',
    flexGrow: 1,
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  kpiValue: { fontSize: 26, fontWeight: '900', color: colors.neon },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  th: { borderBottomColor: colors.borderStrong },
  td: { flex: 1, fontSize: 13, textAlign: 'right' },
  month: { flex: 1.2, textAlign: 'left' },
  thText: { fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
});
