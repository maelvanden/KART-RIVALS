import { timingSafeEqual } from 'node:crypto';

type Track = { id: string; name: string; city: string | null };
type Lap = { position: number; username: string; lap_ms: number };
type Pilot = {
  id: string; username: string; elo: number; rank: string;
  wins: number; losses: number; draws: number; matches_played: number;
};
type PersonalRecord = { track_id: string; track_name: string; lap_ms: number; position: number };
const pilotFields = 'id,username,elo,rank,wins,losses,draws,matches_played';
function pilotFilters(extra: Record<string, string>) {
  return new URLSearchParams({ select: pilotFields, is_discoverable: 'eq.true',
    is_demo: 'eq.false', banned_at: 'is.null', ...extra });
}
async function pilot(id: string) {
  const rows = await query<Pilot[]>('profiles', pilotFilters({ id: 'eq.' + id, limit: '1' }));
  return rows[0] ?? null;
}
async function personalRecords(id: string, track?: string) {
  return query<PersonalRecord[]>('rpc/pilot_lap_records', new URLSearchParams({
    select: 'track_id,track_name,lap_ms,position', limit: track ? '1' : '5',
    ...(track ? { track_id: 'eq.' + track } : {}),
  }), { p_profile_id: id });
}
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

async function query<T>(path: string, params?: URLSearchParams, body?: object): Promise<T> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase configuration missing');

  const response = await fetch(new URL('/rest/v1/' + path + (params ? '?' + params : ''), url), {
    method: body ? 'POST' : 'GET',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(1800),
  });
  if (!response.ok) throw new Error('Supabase HTTP ' + response.status);
  return response.json();
}

Deno.serve(async (request) => {
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  const secret = Deno.env.get('KART_RIVALS_BOT_KEY');
  const received = request.headers.get('Authorization');
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode('Bearer ' + secret);
  const receivedBytes = encoder.encode(received ?? '');
  if (!secret || expectedBytes.length !== receivedBytes.length || !timingSafeEqual(expectedBytes, receivedBytes)) {
    return new Response(null, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const trackId = params.get('track');
  try {
    const action = params.get('action');
    if (action === 'mesrecords' || action === 'circuits') {
      const page = Number(params.get('page') ?? '1');
      if (!Number.isInteger(page) || page < 1 || page > 10000) return new Response(null, { status: 400 });
      const pagination = { limit: '11', offset: String((page - 1) * 10) };
      if (action === 'mesrecords') {
        const id = params.get('pilot') ?? '';
        if (!uuid.test(id)) return new Response(null, { status: 400 });
        const profile = await pilot(id);
        if (!profile) return Response.json({ unavailable: true });
        const rows = await query<PersonalRecord[]>('rpc/pilot_lap_records', new URLSearchParams({
          select: 'track_id,track_name,lap_ms,position', order: 'position.asc,track_name.asc,track_id.asc', ...pagination,
        }), { p_profile_id: id });
        return Response.json({ pilot: profile, records: rows.slice(0, 10), page, has_more: rows.length > 10 });
      }
      const city = (params.get('city') ?? '').slice(0, 80).replace(/[^\p{L}\p{M}\p{N} -]/gu, '').trim();
      if (city.length < 2) return new Response(null, { status: 400 });
      const rows = await query<Track[]>('tracks', new URLSearchParams({
        select: 'id,name,city', city: 'ilike.*' + city + '*', order: 'city.asc,name.asc,id.asc', ...pagination,
      }));
      return Response.json({ tracks: rows.slice(0, 10), city, page, has_more: rows.length > 10 });
    }
    if (action === 'dernierschronos') {
      return Response.json({ laps: await query('rpc/discord_recent_laps', undefined, {}) });
    }
    if (action === 'rival') {
      const id = params.get('pilot') ?? '';
      if (!uuid.test(id) || !uuid.test(trackId ?? '')) return new Response(null, { status: 400 });
      return Response.json(await query('rpc/discord_next_rival', undefined, { p_pilot_id: id, p_track_id: trackId }));
    }
    if (action === 'pilots') {
      const term = (params.get('search') ?? '').slice(0, 20).replace(/[^a-z0-9_]/gi, '');
      const filters = pilotFilters({ select: 'id,username', order: 'username.asc,id.asc', limit: '25' });
      // Escape underscore: it is a literal username character, not an ILIKE wildcard.
      if (term) filters.set('username', 'ilike.*' + term.replace(/_/g, '\\_') + '*');
      return Response.json(await query('profiles', filters));
    }
    if (action === 'classement') {
      const rows = await query<Pilot[]>('profiles', pilotFilters({
        matches_played: 'gt.0', order: 'elo.desc,username.asc,id.asc', limit: '10',
      }));
      let position = 0;
      return Response.json({ pilots: rows.map((row, i) => {
        if (i === 0 || row.elo !== rows[i - 1].elo) position = i + 1;
        return { ...row, position };
      }) });
    }
    if (action === 'profil' || action === 'comparaison') {
      const firstId = params.get('pilot') ?? '';
      const secondId = params.get('opponent') ?? '';
      if (!uuid.test(firstId) || (action === 'comparaison' &&
        (!uuid.test(secondId) || !uuid.test(trackId ?? '') || firstId === secondId))) {
        return new Response(null, { status: 400 });
      }
      const first = await pilot(firstId);
      if (!first) return Response.json({ unavailable: true });
      if (action === 'profil') {
        return Response.json({ pilot: first, records: await personalRecords(firstId) });
      }
      const second = await pilot(secondId);
      if (!second) return Response.json({ unavailable: true });
      const [tracks, firstRecords, secondRecords] = await Promise.all([
        query<Track[]>('tracks', new URLSearchParams({ id: 'eq.' + trackId, select: 'id,name,city', limit: '1' })),
        personalRecords(firstId, trackId!), personalRecords(secondId, trackId!),
      ]);
      return Response.json({ track: tracks[0] ?? null,
        first: { pilot: first, lap_ms: firstRecords[0]?.lap_ms ?? null },
        second: { pilot: second, lap_ms: secondRecords[0]?.lap_ms ?? null } });
    }
    if (action && action !== 'circuit') return new Response(null, { status: 400 });
    if (action === 'circuit' && trackId === null) return new Response(null, { status: 400 });
    if (trackId !== null) {
      if (!uuid.test(trackId)) return new Response(null, { status: 400 });
      const [tracks, records] = await Promise.all([
        query<Track[]>('tracks', new URLSearchParams({ id: 'eq.' + trackId, select: action === 'circuit' ? 'id,name,city,region,address,length_m,is_indoor,website,description' : 'id,name,city', limit: '1' })),
        query<Lap[]>('rpc/track_lap_records', undefined, { p_track_id: trackId, p_limit: 10 }),
      ]);
      const laps = records.map(({ position, username, lap_ms }) => ({ position, username, lap_ms }));
      return Response.json({ track: tracks[0] ?? null, laps });
    }

    if (!params.has('search')) return new Response(null, { status: 400 });
    const term = (params.get('search') ?? '').slice(0, 80).replace(/[^\p{L}\p{M}\p{N} -]/gu, '').trim();
    const filters = new URLSearchParams({ select: 'id,name,city', order: 'name.asc,id.asc', limit: '25' });
    if (term) filters.set('or', '(name.ilike.*' + term + '*,city.ilike.*' + term + '*)');
    return Response.json(await query<Track[]>('tracks', filters));
  } catch (error) {
    console.error('Discord data query failed', error instanceof Error ? error.message : '');
    return new Response(null, { status: 502 });
  }
});
