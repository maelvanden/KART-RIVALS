import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { socialError } from '@/features/social/errors';
import { demoProfile, demoTrackDetails, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { TrackDetails } from '@/types/models';

export type EventKind = 'event' | 'promo';
export type EventCategory = 'endurance' | 'grand_prix' | 'nocturne' | 'course' | 'autre';

export type TrackEvent = {
  id: string;
  track_id: string;
  kind: EventKind;
  category: EventCategory | null;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  price: string | null;
  booking_url: string | null;
  promo_conditions: string | null;
  featured: boolean;
  created_at: string;
  track: Pick<TrackDetails, 'id' | 'name' | 'city' | 'postal_code' | 'region' | 'booking_url' | 'phone'> | null;
  interested: number;
};

export type EventInput = {
  kind: EventKind;
  category: EventCategory | null;
  title: string;
  description: string;
  starts_at: string | null;
  ends_at: string | null;
  price: string;
  booking_url: string;
  promo_code: string;
  promo_conditions: string;
};

export type ManagedEventStats = { id: string; promo_code: string | null; interested: number; reveals: number };

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  endurance: 'Endurance',
  grand_prix: 'Grand Prix',
  nocturne: 'Nocturne',
  course: 'Course',
  autre: 'Événement',
};

const COLUMNS = `id, track_id, kind, category, title, description, starts_at, ends_at, price, booking_url, promo_conditions,
  featured, created_at, track:tracks (id, name, city, postal_code, region, booking_url, phone), interests:event_interests (count)`;

/** Fin d'un événement (ou d'une promo) : sa date de fin, sinon son début. */
export const eventEnd = (e: Pick<TrackEvent, 'starts_at' | 'ends_at'>) => e.ends_at ?? e.starts_at ?? '';

// ---------- Mode démo ----------
const inDays = (days: number, hour = 20) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const demoTrack = (id: string) => {
  const t = demoTrackDetails.find((x) => x.id === id);
  return t
    ? { id: t.id, name: t.name, city: t.city, postal_code: t.postal_code, region: t.region, booking_url: t.booking_url ?? null, phone: t.phone ?? null }
    : null;
};
let demoSeq = 0;
const demoEvents: (Omit<TrackEvent, 'track' | 'interested'> & { promo_code: string | null; reveals: number })[] = [
  {
    id: 'ev-1', track_id: 't3', kind: 'event', category: 'endurance', title: 'Endurance 2 h par équipes de 3',
    description: 'Relais libres, stands obligatoires toutes les 20 minutes, trophées pour le podium et pot d’après-course au bar.',
    starts_at: inDays(6, 19), ends_at: inDays(6, 22), price: '45 € par pilote', booking_url: 'https://www.inwallkart.com/reservations-en-ligne/',
    promo_conditions: null, featured: true, created_at: inDays(-2), promo_code: null, reveals: 0,
  },
  {
    id: 'ev-2', track_id: 't1', kind: 'event', category: 'nocturne', title: 'Nocturne fluo',
    description: 'Piste plongée dans le noir, lumières UV et DJ : 3 sessions de 10 minutes.',
    starts_at: inDays(3, 21), ends_at: null, price: '29,90 €', booking_url: null,
    promo_conditions: null, featured: false, created_at: inDays(-1), promo_code: null, reveals: 0,
  },
  {
    id: 'ev-3', track_id: 't2', kind: 'event', category: 'grand_prix', title: 'Grand Prix d’automne',
    description: 'Essais chronométrés, qualifications puis finale sur le grand tracé. Ouvert à tous dès 16 ans.',
    starts_at: inDays(13, 14), ends_at: inDays(13, 18), price: '60 €', booking_url: null,
    promo_conditions: null, featured: false, created_at: inDays(-3), promo_code: null, reveals: 0,
  },
  {
    id: 'ev-4', track_id: 't1', kind: 'promo', category: null, title: '−20 % sur la 2e session le mardi',
    description: 'Pour les pilotes Kart Rivals, tous les mardis soir.',
    starts_at: null, ends_at: inDays(40, 23), price: null, booking_url: null,
    promo_conditions: 'Code à donner à l’accueil, une utilisation par pilote et par jour.', featured: false,
    created_at: inDays(-5), promo_code: 'RIVALS20', reveals: 12,
  },
];
const demoInterests: Record<string, Set<string>> = { 'ev-1': new Set(['p1', 'p3']), 'ev-2': new Set(['p2']) };

function demoList(trackId?: string): TrackEvent[] {
  const now = new Date().toISOString();
  return demoEvents
    .filter((e) => eventEnd(e) >= now && (!trackId || e.track_id === trackId))
    .map(({ promo_code: _code, reveals: _reveals, ...e }) => ({ ...e, track: demoTrack(e.track_id), interested: demoInterests[e.id]?.size ?? 0 }));
}

// ---------- Lecture ----------
type Row = Omit<TrackEvent, 'interested'> & { interests: { count: number }[] };
const fromRow = ({ interests, ...e }: Row): TrackEvent => ({ ...e, interested: interests[0]?.count ?? 0 });

function sortEvents(list: TrackEvent[]) {
  // À la une d'abord, puis les plus proches dans le temps (promos : par date de fin).
  return list.sort((a, b) => Number(b.featured) - Number(a.featured) || (a.starts_at ?? eventEnd(a)).localeCompare(b.starts_at ?? eventEnd(b)));
}

/** Événements et promos à venir (ou en cours), tous circuits ou un seul. */
export function useUpcomingEvents(trackId?: string) {
  return useQuery({
    queryKey: ['track-events', trackId ?? 'all'],
    queryFn: async (): Promise<TrackEvent[]> => {
      if (isDemoMode) return sortEvents(demoList(trackId));
      const now = new Date().toISOString();
      let query = supabase
        .from('track_events')
        .select(COLUMNS)
        .or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`)
        .limit(100);
      if (trackId) query = query.eq('track_id', trackId);
      const { data, error } = await query;
      if (error) throw error;
      return sortEvents((data as unknown as Row[]).map(fromRow));
    },
  });
}

export function useTrackEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['track-events', 'one', id],
    enabled: !!id,
    queryFn: async (): Promise<TrackEvent | null> => {
      if (isDemoMode) {
        const e = demoEvents.find((x) => x.id === id);
        if (!e) return null;
        const { promo_code: _code, reveals: _reveals, ...rest } = e;
        return { ...rest, track: demoTrack(e.track_id), interested: demoInterests[e.id]?.size ?? 0 };
      }
      const { data, error } = await supabase.from('track_events').select(COLUMNS).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data ? fromRow(data as unknown as Row) : null;
    },
  });
}

/** Événements qui m'intéressent (ids). */
export function useMyInterests() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['event-interests', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Set<string>> => {
      if (isDemoMode) {
        return new Set(Object.entries(demoInterests).filter(([, s]) => s.has(demoProfile.id)).map(([id]) => id));
      }
      const { data, error } = await supabase.from('event_interests').select('event_id').eq('profile_id', userId!);
      if (error) throw error;
      return new Set(data.map((r) => r.event_id as string));
    },
  });
}

// ---------- Actions des pilotes ----------
function useInvalidateEvents() {
  const queryClient = useQueryClient();
  return () =>
    ['track-events', 'event-interests', 'managed-events'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
}

export function useToggleInterest() {
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: async (eventId: string): Promise<boolean> => {
      if (isDemoMode) {
        const set = (demoInterests[eventId] ??= new Set());
        if (set.has(demoProfile.id)) set.delete(demoProfile.id);
        else set.add(demoProfile.id);
        return set.has(demoProfile.id);
      }
      const { data, error } = await supabase.rpc('toggle_event_interest', { p_id: eventId });
      if (error) throw socialError(error);
      return data as boolean;
    },
    onSuccess: invalidate,
  });
}

/** Affiche le code d'une promo (le karting voit combien de pilotes l'ont affiché). */
export function useRevealPromo() {
  return useMutation({
    mutationFn: async (eventId: string): Promise<string> => {
      if (isDemoMode) {
        const e = demoEvents.find((x) => x.id === eventId);
        if (!e?.promo_code) throw new Error('Promo introuvable.');
        e.reveals += 1;
        return e.promo_code;
      }
      const { data, error } = await supabase.rpc('reveal_promo', { p_id: eventId });
      if (error) throw socialError(error);
      return data as string;
    },
  });
}

// ---------- Gestion (admins du karting) ----------
export function useManagedEventStats(trackId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['managed-events', trackId],
    enabled: !!trackId && enabled,
    queryFn: async (): Promise<Record<string, ManagedEventStats>> => {
      const rows: ManagedEventStats[] = isDemoMode
        ? demoEvents
            .filter((e) => e.track_id === trackId)
            .map((e) => ({ id: e.id, promo_code: e.promo_code, interested: demoInterests[e.id]?.size ?? 0, reveals: e.reveals }))
        : await supabase.rpc('manage_track_events', { p_track_id: trackId }).then(({ data, error }) => {
            if (error) throw socialError(error);
            return data as ManagedEventStats[];
          });
      return Object.fromEntries(rows.map((r) => [r.id, r]));
    },
  });
}

export function useSaveEvent(trackId: string) {
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: EventInput }): Promise<string> => {
      if (isDemoMode) {
        const fields = {
          kind: input.kind,
          category: input.kind === 'event' ? input.category : null,
          title: input.title.trim(),
          description: input.description.trim() || null,
          starts_at: input.starts_at,
          ends_at: input.ends_at,
          price: input.price.trim() || null,
          booking_url: input.booking_url.trim() || null,
          promo_conditions: input.promo_conditions.trim() || null,
          promo_code: input.promo_code.trim().toUpperCase() || null,
        };
        const existing = demoEvents.find((e) => e.id === id);
        if (existing) {
          Object.assign(existing, fields);
          return existing.id;
        }
        const newId = `ev-new-${++demoSeq}`;
        demoEvents.push({ id: newId, track_id: trackId, featured: false, created_at: new Date().toISOString(), reveals: 0, ...fields });
        return newId;
      }
      const { data, error } = await supabase.rpc('save_track_event', { p_track_id: trackId, p_data: input, p_id: id ?? null });
      if (error) throw socialError(error);
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) {
        const i = demoEvents.findIndex((e) => e.id === id);
        if (i >= 0) demoEvents.splice(i, 1);
        return;
      }
      const { error } = await supabase.rpc('delete_track_event', { p_id: id });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useSetFeatured() {
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: async ({ id, featured }: { id: string; featured: boolean }) => {
      if (isDemoMode) {
        const e = demoEvents.find((x) => x.id === id);
        if (e) e.featured = featured;
        return;
      }
      const { error } = await supabase.rpc('set_event_featured', { p_id: id, p_featured: featured });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}
