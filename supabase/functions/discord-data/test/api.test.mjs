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
test('record pagination is bounded and hidden profiles stay hidden', async () => {
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    const u = new URL(url);
    if (u.pathname.endsWith('/profiles')) return Response.json([{ id, username: 'Pilot' }]);
    assert.equal(u.searchParams.get('offset'), '10');
    assert.equal(u.searchParams.get('limit'), '11');
    assert.match(u.searchParams.get('order'), /track_id.asc/);
    return Response.json(Array.from({ length: 11 }, () => ({ track_name: 'Track', lap_ms: 30000 })));
  };
  const data = await (await call('action=mesrecords&pilot=' + id + '&page=2')).json();
  assert.equal(data.records.length, 10);
  assert.equal(data.has_more, true);
  assert.equal(calls, 2);
  for (const page of ['0', '-1', '1.2', '10001', 'abc']) assert.equal((await call('action=mesrecords&pilot=' + id + '&page=' + page)).status, 400);
  global.fetch = async () => Response.json([]);
  assert.deepEqual(await (await call('action=mesrecords&pilot=' + id)).json(), { unavailable: true });
});
test('city search filters city only and recent/rival use restricted RPCs', async () => {
  global.fetch = async (url) => {
    const q = new URL(url).searchParams;
    assert.equal(q.get('city'), 'ilike.*Saint-Étienne*');
    assert.equal(q.get('or'), null);
    assert.equal(q.get('offset'), '20');
    return Response.json([]);
  };
  const data = await (await call('action=circuits&city=Saint-Étienne&page=3')).json();
  assert.deepEqual(data.tracks, []);
  assert.equal(data.has_more, false);
  assert.equal((await call('action=circuits&city=*')).status, 400);
  global.fetch = async (url, init) => {
    assert.ok(new URL(url).pathname.endsWith('/rpc/discord_recent_laps'));
    assert.equal(init.method, 'POST');
    return Response.json([]);
  };
  assert.deepEqual(await (await call('action=dernierschronos')).json(), { laps: [] });
  global.fetch = async (url, init) => {
    assert.ok(new URL(url).pathname.endsWith('/rpc/discord_next_rival'));
    assert.deepEqual(JSON.parse(init.body), { p_pilot_id: id, p_track_id: track });
    return Response.json({ unavailable: true });
  };
  assert.deepEqual(await (await call('action=rival&pilot=' + id + '&track=' + track)).json(), { unavailable: true });
  assert.equal((await call('action=rival&pilot=bad&track=' + track)).status, 400);
});

test('association RPCs require bot authentication and receive identities only in POST bodies', async()=>{
 const post=(input,auth='Bearer bot-test')=>handler(new Request('https://api.example',{method:'POST',headers:{Authorization:auth},body:JSON.stringify(input)}));
 let calls=0;
 global.fetch=async(url,init)=>{
  calls++;assert.equal(new URL(url).pathname,'/rest/v1/rpc/redeem_discord_link');
  assert.deepEqual(JSON.parse(init.body),{p_discord_id:'111111111111111111',p_code:'A'.repeat(32)});
  return Response.json({status:'linked'});
 };
 assert.equal((await post({action:'link',discord_id:'111111111111111111',code:'A'.repeat(32)},'bad')).status,401);
 for(const invalid of [null,{}, {action:'link',discord_id:'not-id'}, {action:'link',discord_id:'111111111111111111',code:3},{action:'delete-account',discord_id:'111111111111111111'}])assert.equal((await post(invalid)).status,400);
 assert.equal(calls,0);
 const result=await post({action:'link',discord_id:'111111111111111111',code:'A'.repeat(32)});
 assert.deepEqual(await result.json(),{status:'linked'});assert.equal(result.headers.get('cache-control'),'no-store');
 assert.equal(calls,1);
 for(const [action,rpc] of [['linked','discord_linked_profile'],['unlink','unlink_discord_account']]){
  global.fetch=async(url,init)=>{assert.equal(new URL(url).pathname,'/rest/v1/rpc/'+rpc);assert.deepEqual(JSON.parse(init.body),{p_discord_id:'111111111111111111'});return Response.json({});};
  assert.equal((await post({action,discord_id:'111111111111111111'})).status,200);
 }
 assert.equal((await call('action=link&discord_id=111111111111111111&code=secret')).status,400);
});
