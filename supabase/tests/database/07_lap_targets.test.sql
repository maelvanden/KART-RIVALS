-- Objectifs de chrono (my_lap_targets) et notifications « Ton record est tombé » / « … t'a doublé ».
begin;
select plan(23);

-- Chrono validé en Time Attack : la validation déclenche les notifications, comme en vrai.
create sequence pg_temp.minute_seq;
create function pg_temp.lap(p_pilot text, p_lap_ms int, p_track uuid default tests.track())
returns void language plpgsql as $$
declare
  v_id uuid;
  v_minute int := nextval('pg_temp.minute_seq');
begin
  insert into time_attack_sessions (pilot_id, track_id) values (tests.id(p_pilot), p_track) returning id into v_id;
  update time_attack_sessions
     set status = 'validated', ticket_at = now() + make_interval(mins => v_minute), best_lap_ms = p_lap_ms,
         validated_at = now() + make_interval(mins => v_minute)
   where id = v_id;
end $$;

-- Notifications mises en file pour Expo (une requête peut regrouper plusieurs messages).
create function pg_temp.pushes()
returns table (pilot text, title text, body text) language sql as $$
  select p.username, msg->>'title', msg->>'body'
    from net.http_request_queue q
    cross join jsonb_array_elements(convert_from(q.body, 'utf8')::jsonb) msg
    join push_tokens t on t.token = msg->>'to'
    join profiles p on p.id = t.profile_id;
$$;

create function pg_temp.pilot_with_push(p_username text)
returns void language sql as $$
  select tests.pilot(p_username);
  insert into push_tokens (token, profile_id, platform) values ('ExponentPushToken[' || p_username || ']', tests.id(p_username), 'ios');
$$;

select pg_temp.pilot_with_push(u) from unnest(array['alice', 'bruno', 'chloe', 'diane', 'emile']) u;

-- ========== Classement de départ ==========
select pg_temp.lap('alice', 50000);
select pg_temp.lap('bruno', 51000);
select pg_temp.lap('chloe', 52000);
select pg_temp.lap('diane', 53000);
select is((select count(*)::int from pg_temp.pushes()), 0, 'chacun arrive derrière les autres : personne n''est doublé');

-- ========== Objectifs ==========
select tests.login('chloe');
set local role authenticated;
select results_eq(
  $$ select "position", pilots, lap_ms, target_id, target_lap_ms, target_position, record_id, record_lap_ms
       from my_lap_targets() where track_id = tests.track() $$,
  $$ values (3::bigint, 4::bigint, 52000, tests.id('bruno'), 51000, 2::bigint, tests.id('alice'), 50000) $$,
  '3e sur 4 : objectif le 2e, à 1 s ; record à 2 s');
select is((select target_username from my_lap_targets()), 'bruno', 'le pilote à battre est nommé');

select tests.login('alice');
select results_eq(
  $$ select "position", target_id, record_id from my_lap_targets() $$,
  $$ values (1::bigint, null::uuid, tests.id('alice')) $$,
  'détenteur du record : pas d''objectif devant');

select tests.login('emile');
select is((select count(*)::int from my_lap_targets()), 0, 'pas de chrono : pas d''objectif');
reset role;
select tests.logout();

-- ========== Un nouveau venu double trois pilotes ==========
select pg_temp.lap('emile', 50500);
select set_eq(
  $$ select pilot from pg_temp.pushes() $$,
  $$ values ('bruno'), ('chloe'), ('diane') $$,
  'les trois pilotes doublés sont prévenus, pas le détenteur du record');
select is((select title from pg_temp.pushes() where pilot = 'chloe'), '🏁 emile t’a doublé', 'titre de la notification');
select is((select body from pg_temp.pushes() where pilot = 'chloe'),
  'emile passe devant toi sur ' || track_name(tests.track()) || ' : 50.500, 1,5 s de mieux que toi. Tu es maintenant 4e. À toi de jouer !',
  'texte : chrono, écart et nouvelle place');
select is((select body from pg_temp.pushes() where pilot = 'bruno'),
  'emile passe devant toi sur ' || track_name(tests.track()) || ' : 50.500, 0,50 s de mieux que toi. Tu es maintenant 3e. À toi de jouer !',
  'chaque pilote a son propre écart et sa place');

select tests.login('chloe');
set local role authenticated;
select results_eq(
  $$ select "position", target_id, target_lap_ms from my_lap_targets() $$,
  $$ values (4::bigint, tests.id('bruno'), 51000) $$,
  'l''objectif suit le classement');
reset role;
select tests.logout();
delete from net.http_request_queue;

-- ========== Améliorer son temps sans doubler personne ==========
select pg_temp.lap('chloe', 51500);
select is((select count(*)::int from pg_temp.pushes()), 0, 'Chloé progresse mais reste derrière Bruno : aucune notification');
select pg_temp.lap('alice', 49800);
select is((select count(*)::int from pg_temp.pushes()), 0, 'le détenteur améliore son propre record : aucune notification');
select pg_temp.lap('bruno', 53500);
select is((select count(*)::int from pg_temp.pushes()), 0, 'un chrono moins bon que son record ne double personne');

-- ========== Nouveau record : le détenteur n'est prévenu qu'une fois ==========
select pg_temp.lap('diane', 49000);
select results_eq(
  $$ select title from pg_temp.pushes() where pilot = 'alice' $$,
  $$ values ('👑 Ton record est tombé') $$,
  'l''ancien détenteur reçoit « record tombé », pas « doublé » en plus');
select set_eq(
  $$ select pilot from pg_temp.pushes() where title like '🏁%' $$,
  $$ values ('bruno'), ('chloe'), ('emile') $$,
  'les autres pilotes doublés reçoivent « doublé »');
select is((select body from pg_temp.pushes() where pilot = 'emile'),
  'diane passe devant toi sur ' || track_name(tests.track()) || ' : 49.000, 1,5 s de mieux que toi. Tu es maintenant 3e. À toi de jouer !',
  'Émile passe 3e derrière Diane et Alice');
select pg_temp.lap('alice', 48500);
select is((select title from pg_temp.pushes() where pilot = 'diane' and title like '👑%'), '👑 Ton record est tombé',
  'reprendre le record prévient la détentrice');
select is((select count(*)::int from pg_temp.pushes() where pilot = 'diane' and title like '🏁%'), 0,
  'et seulement « record tombé »');
delete from net.http_request_queue;

-- ========== Seul le top 10 est prévenu ==========
create temp table other as select id from tracks where hidden_at is null and id <> tests.track() order by name limit 1;
select pg_temp.pilot_with_push('pilote' || lpad(i::text, 2, '0')) from generate_series(1, 11) i;
select pg_temp.lap('pilote' || lpad(i::text, 2, '0'), 60000 + i * 100, (select id from other)) from generate_series(1, 10) i;
delete from net.http_request_queue;
select pg_temp.lap('pilote11', 59000, (select id from other));
select is((select count(*)::int from pg_temp.pushes()), 9, '10 pilotes doublés, 9 prévenus : le 10e passe 11e');
select is((select count(*)::int from pg_temp.pushes() where pilot = 'pilote10'), 0, 'hors du top 10 : pas de notification');
select is((select body from pg_temp.pushes() where pilot = 'pilote09'),
  'pilote11 passe devant toi sur ' || track_name((select id from other)) || ' : 59.000, 1,9 s de mieux que toi. Tu es maintenant 10e. À toi de jouer !',
  'le dernier prévenu est 10e');
delete from net.http_request_queue;

-- ========== Course de groupe : plusieurs pilotes doublent d'un coup ==========
-- pilote01 (60 100) et pilote02 (60 200) sont doublés par deux pilotes de la même course : une seule notification
-- chacun, pour le plus rapide.
select pg_temp.pilot_with_push(u) from unnest(array['gael', 'hugo']) u;
insert into races (organizer_id, track_id, status) values (tests.id('gael'), (select id from other), 'awaiting_confirmation');
insert into race_entries (race_id, pilot_id, status, position, best_lap_ms)
select r.id, tests.id(x.u), 'accepted', x.pos, x.lap
  from races r, (values ('gael', 1, 59500), ('hugo', 2, 59800), ('pilote05', 3, 61000)) x (u, pos, lap)
 where r.organizer_id = tests.id('gael');
update races set status = 'confirmed', confirmed_at = now() where organizer_id = tests.id('gael');
select is((select count(*)::int from pg_temp.pushes() where pilot = 'pilote01'), 1, 'doublé par deux pilotes : une seule notification');
select ok((select body from pg_temp.pushes() where pilot = 'pilote01') like 'gael passe devant toi%', 'au nom du plus rapide');

select * from finish();
rollback;
