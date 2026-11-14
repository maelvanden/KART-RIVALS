type Interaction = {
  type: number;
  application_id: string;
  guild_id?: string;
  channel_id?: string;
  token: string;
  data?: { name: string; options?: { name: string; value: string; focused?: boolean }[] };
};

type Track = { id: string; name: string; city: string | null };
type Lap = { position: number; username: string; lap_ms: number };

const ephemeral = 64;
const encoder = new TextEncoder();
const snowflake = /^\d{17,20}$/;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function fromHex(value: string, bytes: number) {
  if (value.length !== bytes * 2 || !/^[a-f0-9]+$/i.test(value)) return null;
  return Uint8Array.from(value.match(/../g)!, (pair) => Number.parseInt(pair, 16));
}

let verificationKey: Promise<CryptoKey> | undefined;

async function verify(request: Request, body: string) {
  const signature = fromHex(request.headers.get('x-signature-ed25519') ?? '', 64);
  const timestamp = request.headers.get('x-signature-timestamp') ?? '';
  const publicKey = fromHex(Deno.env.get('DISCORD_PUBLIC_KEY') ?? '', 32);
  if (!signature || !publicKey || !/^\d{10,11}$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  verificationKey ??= crypto.subtle.importKey('raw', publicKey, 'Ed25519', false, ['verify']);
  return crypto.subtle.verify('Ed25519', await verificationKey, signature, encoder.encode(timestamp + body));
}

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

function displayText(value: string, limit: number) {
  return value.replace(/[\r\n\t]/g, ' ').slice(0, limit).replace(/[\\`*_~|<>\[\]]/g, '\\$&');
}

function formatLap(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  const seconds = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return minutes + ':' + seconds + '.' + String(ms % 1000).padStart(3, '0');
}

function reply(content: string) {
  return Response.json({ type: 4, data: { content, flags: ephemeral, allowed_mentions: { parse: [] } } });
}

async function completeRecords(interaction: Interaction, trackId: string) {
  let content: string;
  try {
    const [tracks, laps] = await Promise.all([
      query<Track[]>('tracks', new URLSearchParams({ id: 'eq.' + trackId, select: 'id,name,city', limit: '1' })),
      query<Lap[]>('rpc/track_lap_records', undefined, { p_track_id: trackId, p_limit: 10 }),
    ]);
    const track = tracks[0];
    if (!track) {
      content = 'Circuit introuvable. Choisis un circuit dans les suggestions.';
    } else {
      const heading = '**Records · ' + displayText(track.name, 100) + '**';
      const rows = laps.map((lap) =>
        lap.position + '. `' + formatLap(lap.lap_ms) + '` · ' + displayText(lap.username, 50));
      content = [heading, ...(rows.length ? rows : ['Aucun chrono de match validé sur ce circuit.'])].join('\n');
    }
  } catch {
    content = 'Le classement Kart Rivals est momentanément indisponible. Réessaie dans un instant.';
  }

  try {
    const response = await fetch(
      'https://discord.com/api/v10/webhooks/' + interaction.application_id + '/' +
        encodeURIComponent(interaction.token) + '/messages/@original',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) console.error('Discord reply HTTP', response.status);
  } catch {
    console.error('Discord reply request failed');
  }
}

async function autocomplete(search: string) {
  // Strip wildcard and filter syntax before constructing a PostgREST pattern.
  const term = search.replace(/[^\p{L}\p{M}\p{N} -]/gu, '').trim().slice(0, 80);
  const params = new URLSearchParams({ select: 'id,name,city', order: 'name.asc,id.asc', limit: '25' });
  if (term) params.set('or', '(name.ilike.*' + term + '*,city.ilike.*' + term + '*)');
  try {
    const tracks = await query<Track[]>('tracks', params);
    return tracks.map((track) => ({
      name: [track.name, track.city].filter(Boolean).join(' · ').slice(0, 100),
      value: track.id,
    }));
  } catch {
    return [];
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const body = await request.text();
  if (!(await verify(request, body))) return new Response(null, { status: 401 });

  let interaction: Interaction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (interaction.type === 1) return Response.json({ type: 1 });
  if (interaction.data?.name !== 'records' || ![2, 4].includes(interaction.type)) {
    return new Response(null, { status: 400 });
  }

  const guild = Deno.env.get('DISCORD_GUILD_ID');
  const channel = Deno.env.get('DISCORD_TEST_CHANNEL_ID');
  const allowed = Boolean(guild && channel && interaction.guild_id === guild && interaction.channel_id === channel);
  const option = interaction.data.options?.find(({ name }) => name === 'circuit');
  if (interaction.type === 4) {
    const choices = allowed && option?.focused ? await autocomplete(option.value) : [];
    return Response.json({ type: 8, data: { choices } });
  }
  if (!allowed) return reply('Utilise cette commande dans le salon de test Kart Rivals.');
  if (!option || !uuid.test(option.value)) return reply('Choisis un circuit dans les suggestions.');
  if (!snowflake.test(interaction.application_id) || !interaction.token) {
    return new Response(null, { status: 400 });
  }

  EdgeRuntime.waitUntil(completeRecords(interaction, option.value));
  return Response.json({ type: 5, data: { flags: ephemeral } });
});
