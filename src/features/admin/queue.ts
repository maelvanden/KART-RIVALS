import type { Href } from 'expo-router';

import { useAdminReports, useAdminTrackRequests, type TrackAdminRequest } from '@/features/admin/api';
import { useAdminDisputes, useAdminTimeAttacks, useTrackCorrections } from '@/features/admin/panel';
import { REPORT_REASONS } from '@/features/social/safety';
import { formatLapTime } from '@/lib/format';

export type QueueKind = 'report' | 'ticket' | 'dispute' | 'suspect' | 'correction' | 'request';

export type QueueItem = {
  key: string;
  kind: QueueKind;
  /** Depuis quand ça attend : sert au tri (le plus ancien d'abord). */
  since: string;
  title: string;
  detail: string;
  /** Écran où traiter l'élément ; absent pour les demandes de gestion (traitées dans la file). */
  href?: Href;
  request?: TrackAdminRequest;
};

export const QUEUE_LABELS: Record<QueueKind, string> = {
  report: 'Signalement',
  ticket: 'Ticket à vérifier',
  dispute: 'Litige',
  suspect: 'Chrono suspect',
  correction: 'Remontée',
  request: 'Demande de karting',
};

/**
 * Tout ce qui attend un admin appli, en une seule liste du plus ancien au plus récent :
 * signalements, tickets Time Attack à vérifier, litiges, chronos suspects, remontées et demandes de gestion.
 */
export function useAdminQueue(enabled: boolean) {
  const reports = useAdminReports('open', enabled);
  const tickets = useAdminTimeAttacks('pending', enabled);
  const disputes = useAdminDisputes(enabled);
  const suspects = useAdminTimeAttacks('suspect', enabled);
  const corrections = useTrackCorrections('open', enabled);
  const requests = useAdminTrackRequests(enabled);
  const sources = [reports, tickets, disputes, suspects, corrections, requests];
  const reason = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r;

  const items: QueueItem[] = [
    ...(reports.data ?? []).map((r) => ({
      key: `report-${r.id}`,
      kind: 'report' as const,
      since: r.created_at,
      title: `${r.target_username ?? 'Pilote'} · ${reason(r.reason)}`,
      detail: `Signalé par ${r.reporter_username ?? '?'}${r.details ? ` : « ${r.details} »` : ''}`,
      href: '/admin/reports' as Href,
    })),
    ...(tickets.data ?? []).map((t) => ({
      key: `ticket-${t.id}`,
      kind: 'ticket' as const,
      since: t.review_requested_at ?? t.check_in_at,
      title: `${t.username} · ${t.track_name}`,
      detail: `${t.best_lap_ms ? `${formatLapTime(t.best_lap_ms)} déclaré` : 'Temps à lire sur la photo'} · ${t.review_auto ? 'envoyé d’office à l’échéance' : 'demandé par le pilote'}`,
      href: '/admin/results' as Href,
    })),
    ...(disputes.data ?? []).map((d) => ({
      key: `dispute-${d.id}`,
      kind: 'dispute' as const,
      since: d.created_at,
      title:
        d.kind === 'match' ? `${d.challenger.username} contre ${d.opponent.username}` : `Course de ${d.organizer} · ${d.entries.length} pilotes`,
      detail: `${d.track} · ${d.status === 'disputed' ? (d.dispute_reason ? `« ${d.dispute_reason} »` : 'résultat contesté') : 'non confirmé depuis plus de 3 jours'}`,
      href: '/admin/results' as Href,
    })),
    ...(suspects.data ?? []).map((t) => ({
      key: `suspect-${t.id}`,
      kind: 'suspect' as const,
      since: t.validated_at ?? t.check_in_at,
      title: `${t.username} · ${t.track_name}`,
      detail: `${t.best_lap_ms ? formatLapTime(t.best_lap_ms) : '—'}${t.gap_pct != null ? `, ${t.gap_pct} % sous le record` : ''}`,
      href: '/admin/results' as Href,
    })),
    ...(corrections.data ?? []).map((c) => ({
      key: `correction-${c.id}`,
      kind: 'correction' as const,
      since: c.created_at,
      title: `${c.track_name} · ${c.track_city}`,
      detail: `${c.author ?? 'Un pilote'} : « ${c.message} »`,
      href: '/admin/corrections' as Href,
    })),
    ...(requests.data ?? []).map((q) => ({
      key: `request-${q.id}`,
      kind: 'request' as const,
      since: q.created_at,
      title: `${q.username} veut gérer ${q.track_name}`,
      detail: q.message ? `« ${q.message} »` : q.track_city,
      request: q,
    })),
  ].sort((a, b) => a.since.localeCompare(b.since));

  return {
    items,
    isPending: sources.some((q) => q.isPending),
    error: sources.find((q) => q.error)?.error ?? null,
    isRefetching: sources.some((q) => q.isRefetching),
    refetch: () => sources.forEach((q) => q.refetch()),
  };
}

/** « 2 h », « 3 j » : depuis combien de temps l'élément attend. */
export function waitingFor(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} j`;
}

/** Au-delà de 2 jours d'attente, l'élément est mis en avant. */
export const isLate = (iso: string) => Date.now() - Date.parse(iso) > 48 * 3600_000;
