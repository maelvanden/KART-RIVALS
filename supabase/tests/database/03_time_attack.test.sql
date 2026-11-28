-- Time Attack côté serveur : check-in, décision finale sur le ticket (record_time_attack_ticket),
-- abandon après 90 min (expire_time_attack_sessions) et mise en pause.
-- Dans une transaction, now() est figé : le check-in d'une session créée ici vaut now().
begin;
select plan(32);

select tests.pilot('alice');
select tests.pilot('bruno');

-- ========== Check-in ==========
select tests.login('alice');
set local role authenticated;

select throws_ok(
  $$ select start_time_attack(gen_random_uuid()) $$,
  'Unknown track', 'circuit inconnu refusé');

create temp table s on commit drop as select * from start_time_attack(tests.track());
grant select on s to authenticated;
select is((select status from s), 'on_track'::time_attack_status, 'session ouverte');
select is((select check_in_at from s), now(), 'l''heure de check-in est celle du serveur');
select is((select deadline_at - check_in_at from s), interval '90 minutes', '90 minutes pour envoyer le ticket');
select throws_ok(
  $$ select start_time_attack(tests.track()) $$,
  'A Time Attack session is already in progress', 'une seule session à la fois');

-- La décision sur le ticket est réservée à l'Edge Function (clé service).
select throws_ok(
  $$ select record_time_attack_ticket((select id from s), tests.id('alice'), now() + interval '1 minute', 47312,
                                      'x', now(), 'Alice', 'alice', 'sha-a', '') $$,
  '42501', null, 'un pilote ne peut pas valider son ticket lui-même');
select throws_ok(
  $$ update time_attack_sessions set status = 'validated' where id = (select id from s) $$,
  '42501', null, 'un pilote ne peut pas modifier sa session');
reset role;
select tests.logout();

-- ========== Décision sur le ticket ==========
create function pg_temp.ticket(p_pilot text, p_at timestamptz, p_lap int default 47312,
                               p_key text default null, p_sha text default null, p_received timestamptz default now())
returns jsonb language sql as $$
  select record_time_attack_ticket(
    (select id from time_attack_sessions where pilot_id = tests.id(p_pilot) and status = 'on_track'),
    tests.id(p_pilot), p_at, p_lap, p_pilot || '/ticket.jpg', p_received, p_pilot,
    coalesce(p_key, p_pilot), coalesce(p_sha, 'sha-' || p_pilot), 'texte OCR');
$$;

select is(pg_temp.ticket('alice', now()) ->> 'code', 'TICKET_BEFORE_CHECK_IN',
  'règle d''or : un ticket à l''heure exacte du check-in est refusé');
select is(pg_temp.ticket('alice', now() - interval '1 hour') ->> 'code', 'TICKET_BEFORE_CHECK_IN',
  'un ticket antérieur au check-in est refusé');
select is(pg_temp.ticket('alice', now() + interval '11 minutes') ->> 'code', 'TICKET_IN_FUTURE',
  'au-delà de 10 min dans le futur, l''heure a été mal lue');
select results_eq(
  $$ select rejection_count, last_rejection_code from time_attack_sessions where id = (select id from s) $$,
  $$ values (3, 'TICKET_IN_FUTURE') $$,
  'les refus sont comptés et le dernier motif est gardé');
select throws_ok(
  $$ select pg_temp.ticket('alice', now() + interval '1 minute', p_received => now() + interval '1 minute') $$,
  'Invalid received_at', 'heure de réception postérieure à l''horloge du serveur refusée');
select throws_ok(
  $$ select pg_temp.ticket('alice', now() + interval '1 minute', p_received => now() - interval '6 minutes') $$,
  'Invalid received_at', 'heure de réception trop ancienne refusée');
select is(
  record_time_attack_ticket((select id from s), tests.id('bruno'), now() + interval '1 minute', 47312,
                            'x', now(), 'Bruno', 'bruno', 'sha-x', '') ->> 'code',
  'SESSION_NOT_FOUND', 'la session d''un autre pilote est introuvable');

select is((pg_temp.ticket('alice', now() + interval '1 minute') ->> 'ok')::boolean, true,
  'ticket postérieur au check-in accepté');
select results_eq(
  $$ select status::text, best_lap_ms, ticket_name_key from time_attack_sessions where id = (select id from s) $$,
  $$ values ('validated', 47312, 'alice') $$,
  'session validée avec le meilleur tour déclaré');
select is((select points from profiles where id = tests.id('alice')), 230, 'Time Attack validé : +30 points');
select is(
  record_time_attack_ticket((select id from s), tests.id('alice'), now() + interval '2 minutes', 47000,
                            'x', now(), 'Alice', 'alice', 'sha-b', '') ->> 'code',
  'SESSION_CLOSED', 'une session validée ne se revalide pas');
select is((select count(*)::int from point_transactions where time_attack_id = (select id from s)), 1,
  'les points du Time Attack ne sont versés qu''une fois');

-- ========== Un ticket ne valide qu'une session, tous pilotes confondus ==========
insert into time_attack_sessions (pilot_id, track_id) values (tests.id('bruno'), tests.track());
select is(pg_temp.ticket('bruno', now() + interval '1 minute', 47312, 'alice', 'sha-bruno') ->> 'code',
  'TICKET_ALREADY_USED', 'même heure, même nom, même temps : ticket déjà utilisé par un autre pilote');
select is(pg_temp.ticket('bruno', now() + interval '3 minutes', 46000, 'bruno', 'sha-alice') ->> 'code',
  'TICKET_ALREADY_USED', 'même photo : ticket déjà utilisé');
select is((pg_temp.ticket('bruno', now() + interval '3 minutes', 46000) ->> 'ok')::boolean, true,
  'son propre ticket est accepté');

-- ========== Échéance et abandon ==========
select tests.pilot('chloe');
select tests.pilot('diane');
insert into time_attack_sessions (pilot_id, track_id, check_in_at, deadline_at)
select tests.id(u), tests.track(), now() - interval '2 hours', now() - interval '30 minutes'
  from unnest(array['chloe', 'diane']) u;

select is(pg_temp.ticket('chloe', now() - interval '1 hour') ->> 'code', 'DEADLINE_PASSED',
  'ticket reçu après les 90 minutes refusé');

-- Diane a envoyé sa photo avant l'échéance (lecture ratée) : vérification manuelle plutôt qu'abandon.
insert into storage.objects (bucket_id, name, created_at)
select 'time-attack-tickets', tests.id('diane') || '/' || id || '/ticket.jpg', now() - interval '45 minutes'
  from time_attack_sessions where pilot_id = tests.id('diane');

select is(expire_time_attack_sessions(), 2, 'les deux sessions échues sont traitées');
select results_eq(
  $$ select status::text, elo_penalty from time_attack_sessions where pilot_id = tests.id('chloe') $$,
  $$ values ('dnf', 15) $$,
  'sans ticket : abandon');
select is((select elo from profiles where id = tests.id('chloe')), 985, 'abandon : −15 ELO');
select results_eq(
  $$ select elo_before, elo_after, k_factor::int from elo_history where profile_id = tests.id('chloe') $$,
  $$ values (1000, 985, 0) $$,
  'la pénalité est inscrite dans l''historique ELO');
select is((select points from profiles where id = tests.id('chloe')), 200, 'un abandon ne rapporte pas de points');
select is((select status from time_attack_sessions where pilot_id = tests.id('diane')), 'pending_review'::time_attack_status,
  'photo envoyée à temps : vérification manuelle');
select is((select elo from profiles where id = tests.id('diane')), 1000, 'pas de pénalité en attendant la vérification');
select is(expire_time_attack_sessions(), 0, 'une session n''est traitée qu''une fois');

-- ========== Pause du mode ==========
update app_settings set time_attack_enabled = false;
select tests.login('chloe');
set local role authenticated;
select throws_ok(
  $$ select start_time_attack(tests.track()) $$,
  'Time Attack is paused', 'check-in refusé quand le Time Attack est en pause');
reset role;

select * from finish();
rollback;
