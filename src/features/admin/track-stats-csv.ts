import type { TrackStats } from '@/features/admin/track-stats';
import { formatLapTime } from '@/lib/format';

export type CsvCell = string | number | null | undefined;

/** Une ligne de la série par jour (RPC track_stats_daily). `day` est une date « AAAA-MM-JJ ». */
export type DailyRow = { day: string; views: number; pilots: number; matches: number; races: number; time_attacks: number };

const TZ = 'Europe/Paris';

const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: TZ });
const dateTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
/** « 2026-11-19 » → « 19/11/2026 », sans passer par un fuseau : la date est déjà celle de Paris. */
const isoDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** « +22 % », « −8 % » ; vide sans base de comparaison ou sans changement. */
function change(current: number, previous: number): string {
  if (previous <= 0 || current === previous) return '';
  const pct = Math.round((Math.abs(current - previous) / previous) * 100);
  return `${current > previous ? '+' : '−'}${pct} %`;
}

/** Nom de fichier sûr : sans accents ni caractères spéciaux. */
export function csvFilename(trackName: string, now = new Date()): string {
  const slug = trackName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `kart-rivals-${slug || 'circuit'}-stats-${now.toISOString().slice(0, 10)}.csv`;
}

/**
 * Lignes du CSV d'export d'un circuit : indicateurs des 30 derniers jours comparés aux 30 d'avant, courbe par semaine,
 * habitués, événements et promos en cours, puis la série jour par jour. Les sections sont séparées par une ligne vide.
 */
export function trackStatsRows(trackName: string, s: TrackStats, daily: DailyRow[], now = new Date()): CsvCell[][] {
  const kpi = (label: string, value: CsvCell, previous?: number): CsvCell[] =>
    typeof value === 'number' && previous != null ? [label, value, previous, change(value, previous)] : [label, value, '', ''];

  return [
    ['Kart Rivals · statistiques du circuit', trackName],
    ['Édité le', dateTime(now.toISOString())],
    [],
    ['Indicateurs (30 derniers jours)', 'Valeur', '30 jours précédents', 'Évolution'],
    kpi('Visites de la fiche', s.views_30d, s.views_prev_30d),
    kpi('Pilotes différents ayant visité la fiche', s.viewers_30d),
    kpi('Pilotes venus rouler', s.pilots_30d, s.pilots_prev_30d),
    kpi('Nouveaux pilotes (premier résultat chez vous)', s.new_pilots_30d),
    kpi('Pilotes venus rouler depuis le début', s.pilots_total),
    kpi('Défis validés', s.matches_30d),
    kpi('Courses validées', s.races_30d),
    kpi('Time Attack validés', s.time_attacks_30d),
    kpi('Pilotes dont c’est le circuit favori', s.fans),
    kpi('Note moyenne des avis', s.rating),
    kpi('Avis (total)', s.reviews),
    kpi('Nouveaux avis (30 jours)', s.reviews_30d),
    kpi('Photos des pilotes', s.photos),
    kpi('Sessions ouvertes à venir', s.sessions_upcoming),
    kpi('Tournois ouverts ou en cours', s.tournaments_live),
    kpi('Erreurs signalées à traiter', s.corrections_open),
    kpi('Événements à venir', s.events_upcoming),
    kpi('Promos en cours', s.promos_active),
    kpi('Pilotes intéressés par vos événements (30 jours)', s.interests_30d),
    kpi('Codes promo affichés (30 jours)', s.reveals_30d),
    ['Record du tour', s.record ? formatLapTime(s.record.lap_ms) : '', s.record?.username ?? '', s.record ? date(s.record.at) : ''],
    [],
    ['Par semaine (8 semaines)', 'Pilotes venus rouler', 'Visites de la fiche'],
    ...s.weeks.map((w): CsvCell[] => [`Semaine du ${date(w.week)}`, w.pilots, w.views]),
    [],
    ['Habitués (90 jours)', 'Résultats validés'],
    ...s.regulars.map((p): CsvCell[] => [p.username, p.count]),
    [],
    ['Événements et promos en cours', 'Type', 'Date', 'Intéressés', 'Codes promo affichés'],
    ...s.live.map((e): CsvCell[] => [
      e.title,
      e.kind === 'promo' ? 'Promo' : 'Événement',
      e.kind === 'promo' ? (e.ends_at ? `jusqu’au ${date(e.ends_at)}` : '') : e.starts_at ? dateTime(e.starts_at) : '',
      e.kind === 'promo' ? '' : e.interests,
      e.kind === 'promo' ? e.reveals : '',
    ]),
    [],
    [`Par jour (${daily.length} jours)`, 'Visites de la fiche', 'Pilotes venus rouler', 'Défis validés', 'Courses validées', 'Time Attack validés'],
    ...daily.map((d): CsvCell[] => [isoDay(d.day), d.views, d.pilots, d.matches, d.races, d.time_attacks]),
  ];
}
