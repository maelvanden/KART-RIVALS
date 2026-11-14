import { timingSafeEqual } from 'node:crypto';

type Track = { id: string; name: string; city: string | null };
type Lap = { position: number; username: string; lap_ms: number };
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
    if (trackId !== null) {
      if (!uuid.test(trackId)) return new Response(null, { status: 400 });
      const [tracks, records] = await Promise.all([
        query<Track[]>('tracks', new URLSearchParams({ id: 'eq.' + trackId, select: 'id,name,city', limit: '1' })),
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
