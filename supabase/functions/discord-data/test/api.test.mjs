import test from 'node:test';
import assert from 'node:assert/strict';
let handler;
global.Deno = { env: { get: (key) => ({ SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'service-test', KART_RIVALS_BOT_KEY: 'bot-test' })[key] }, serve: (fn) => { handler = fn; } };
await import('../index.ts');
const id = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const track = '00000000-0000-0000-0000-000000000003';
const call = (query, auth = 'Bearer bot-test') => handler(new Request('https://api.example?' + query, { headers: { Authorization: auth } }));
test('auth and invalid inputs never query database', async () => {
  global.fetch = async () => { throw new Error('Unexpected database call'); };
  assert.equal((await call('action=classement', 'wrong')).status, 401);
  for (const query of ['action=profil&pilot=invalid', 'action=comparaison&pilot=' + id + '&opponent=' + id + '&track=' + track, 'action=other', 'action=circuit']) {
    assert.equal((await call(query)).status, 400);
  }
});
test('public profile filters and explicit non-sensitive projections', async () => {
  global.fetch = async (url) => {
    const q = new URL(url).searchParams;
    assert.equal(q.get('is_discoverable'), 'eq.true');
    assert.equal(q.get('is_demo'), 'eq.false');
    assert.equal(q.get('banned_at'), 'is.null');
    assert.equal(q.get('select'), 'id,username');
    assert.equal(q.get('username'), 'ilike.*ma\\_el*');
    return Response.json([{ id, username: 'ma_el' }]);
  };
  assert.equal((await call('action=pilots&search=ma_el')).status, 200);
  let calls = 0;
  global.fetch = async () => { calls++; return Response.json([]); };
  assert.deepEqual(await (await call('action=profil&pilot=' + id)).json(), { unavailable: true });
  assert.equal(calls, 1, 'invisible profiles never load personal laps');
});
test('rank ties are preserved', async () => {
  global.fetch = async (url) => {
    const q = new URL(url).searchParams;
    assert.equal(q.get('matches_played'), 'gt.0');
    assert.equal(q.get('limit'), '10');
    return Response.json([{ elo: 1200 }, { elo: 1200 }, { elo: 1100 }]);
  };
  const result = await (await call('action=classement')).json();
  assert.deepEqual(result.pilots.map((p) => p.position), [1, 1, 3]);
});
test('comparison queries personal record on requested track, not top ten', async () => {
  let records = 0;
  global.fetch = async (url, init) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/profiles')) return Response.json([{ id: u.searchParams.get('id').slice(3), username: 'Pilot', elo: 1000 }]);
    if (u.pathname.endsWith('/tracks')) return Response.json([{ id: track, name: 'Track', city: 'City' }]);
    assert.ok(u.pathname.endsWith('/rpc/pilot_lap_records'));
    assert.equal(u.searchParams.get('track_id'), 'eq.' + track);
    assert.equal(u.searchParams.get('limit'), '1');
    assert.equal(u.searchParams.get('select'), 'track_id,track_name,lap_ms,position');
    records++;
    return Response.json(JSON.parse(init.body).p_profile_id === id ? [{ lap_ms: 45000, position: 42 }] : []);
  };
  const result = await (await call('action=comparaison&pilot=' + id + '&opponent=' + other + '&track=' + track)).json();
  assert.equal(result.first.lap_ms, 45000);
  assert.equal(result.second.lap_ms, null);
  assert.equal(records, 2);
});
test('circuit includes public information and API failures are sanitized', async () => {
  global.fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/tracks')) {
      assert.match(u.searchParams.get('select'), /length_m,is_indoor,website,description/);
      return Response.json([{ id: track, name: 'Track' }]);
    }
    return Response.json([{ position: 1, username: 'Pilot', lap_ms: 45000, avatar_url: 'omitted' }]);
  };
  const result = await (await call('action=circuit&track=' + track)).json();
  assert.deepEqual(result.laps, [{ position: 1, username: 'Pilot', lap_ms: 45000 }]);
  global.fetch = async () => new Response(null, { status: 503 });
  const failure = await call('action=classement');
  assert.equal(failure.status, 502);
  assert.equal(await failure.text(), '');
});
