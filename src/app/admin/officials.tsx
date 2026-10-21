import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { useOfficialTracks, type OfficialTrack } from '@/features/admin/panel';
import { colors, radius, spacing } from '@/theme';

const DAY = 86_400_000;
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / DAY) : null);
const ago = (days: number | null) =>
  days == null ? 'jamais' : days === 0 ? 'aujourd’hui' : days === 1 ? 'hier' : days < 60 ? `il y a ${days} jours` : `il y a ${Math.round(days / 30)} mois`;
/** Vert : actif depuis moins d'un mois ; orange : 1 à 3 mois ; rouge : plus de 3 mois ou jamais. */
const freshness = (days: number | null) => (days == null || days > 90 ? colors.danger : days > 30 ? colors.orange : colors.neon);

/** Kartings officiels (fiche gérée par un exploitant) : activité, événements, promos, remontées. */
export default function OfficialsScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const list = useOfficialTracks(isAppAdmin);
  const [sort, setSort] = useState<'stale' | 'name'>('stale');

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  const tracks = [...(list.data ?? [])].sort((a, b) =>
    sort === 'name'
      ? a.name.localeCompare(b.name)
      : (a.last_activity ? Date.parse(a.last_activity) : 0) - (b.last_activity ? Date.parse(b.last_activity) : 0),
  );
  const stale = tracks.filter((t) => (daysSince(t.last_activity) ?? 999) > 30).length;

  return (
    <Screen safeTop={false} refreshing={list.isRefetching} onRefresh={list.refetch}>
      {list.data ? (
        <Text variant="caption">
          {list.data.length} karting{list.data.length > 1 ? 's' : ''} officiel{list.data.length > 1 ? 's' : ''}
          {stale > 0 ? ` · ${stale} sans activité depuis plus d’un mois` : ''}
        </Text>
      ) : null}
      <Segmented
        options={[
          { value: 'stale', label: 'À relancer d’abord' },
          { value: 'name', label: 'A → Z' },
        ]}
        value={sort}
        onChange={setSort}
      />
      {list.isPending ? <Loading /> : null}
      {list.error ? <ErrorState error={list.error} /> : null}
      {list.data?.length === 0 ? (
        <EmptyState title="Aucun karting officiel" message="Une fiche devient officielle dès qu’un admin karting est validé." />
      ) : null}
      {tracks.map((t) => (
        <OfficialCard key={t.id} track={t} />
      ))}
    </Screen>
  );
}

function OfficialCard({ track: t }: { track: OfficialTrack }) {
  const updated = daysSince(t.page_updated_at);
  const activity = daysSince(t.last_activity);
  return (
    <Card style={[styles.card, { borderLeftColor: freshness(activity) }]}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.name}>{t.name}</Text>
          <Text variant="caption">
            {[t.postal_code, t.city].filter(Boolean).join(' ')} · géré par {(t.admins ?? []).join(', ') || '—'}
          </Text>
        </View>
        <Text style={[styles.badge, { color: freshness(activity), borderColor: freshness(activity) }]}>
          {activity == null ? 'Inactif' : activity <= 30 ? 'Actif' : 'À relancer'}
        </Text>
      </View>
      <Text variant="caption">
        Fiche mise à jour {ago(updated)}
        {t.page_updated_by && updated != null ? ` par ${t.page_updated_by}` : ''}
        {' · '}dernier événement publié {ago(daysSince(t.last_event_at))}
      </Text>
      <View style={styles.stats}>
        <Stat value={`${t.events_upcoming}/${t.events_total}`} label="événements à venir" />
        <Stat value={`${t.promos_active}`} label="promos en cours" />
        <Stat value={`${t.promo_reveals}`} label="codes promo affichés" />
        <Stat value={`${t.interests}`} label="pilotes intéressés" />
        <Stat value={`${t.photos}`} label="photos" />
        <Stat value={`${t.corrections_open}`} label="remontées ouvertes" alert={t.corrections_open > 0} />
      </View>
      <View style={styles.row}>
        <Button
          title="Gérer la fiche"
          variant="secondary"
          style={styles.flex}
          onPress={() => router.push({ pathname: '/admin/track/[id]', params: { id: t.id } })}
        />
        <Button title="Voir" variant="quiet" onPress={() => router.push({ pathname: '/track/[id]', params: { id: t.id } })} />
      </View>
    </Card>
  );
}

function Stat({ value, label, alert }: { value: string; label: string; alert?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, alert && { color: colors.orange }]}>{value}</Text>
      <Text variant="caption" numberOfLines={2}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, borderLeftWidth: 3 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  name: { fontWeight: '800', fontSize: 16 },
  badge: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stat: { width: '32%', flexGrow: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  statValue: { fontWeight: '900', fontSize: 18 },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
});
