-- Courses de groupe : invitations, saisie du classement, confirmation à la majorité et ELO multi-pilotes.
begin;
select plan(25);

select tests.pilot(u) from unnest(array['alice', 'bruno', 'chloe', 'diane', 'emile']) u;

-- ========== Création ==========
select tests.login('alice');
set local role authenticated;

select throws_ok(
  $$ select create_race(tests.track(), array[tests.id('bruno')], null, 'position', null) $$,
  'Invite between 2 and 7 other pilots', 'il faut inviter au moins 2 pilotes');
select throws_ok(
  $$ select create_race(tests.track(), array[tests.id('bruno'), gen_random_uuid()], null, 'position', null) $$,
  'Unknown pilot in invitations', 'pilote inconnu refusé');

create temp table r on commit drop as
  select create_race(tests.track(), array[tests.id('bruno'), tests.id('chloe'), tests.id('diane'), tests.id('emile')],
                     null, 'position', 'Course du dimanche') as id;
grant select on r to authenticated;
reset role;
select results_eq(
  $$ select pilot_id, status::text from race_entries where race_id = (select id from r) and pilot_id = tests.id('alice') $$,
  $$ values (tests.id('alice'), 'accepted') $$,
  'l''organisateur participe d''office');
select is((select count(*)::int from race_entries where race_id = (select id from r) and status = 'invited'), 4,
  'les invités attendent leur réponse');

-- ========== Réponses ==========
select tests.login('bruno');
set local role authenticated;
select respond_race((select id from r), true);
select tests.login('chloe');
select respond_race((select id from r), true);
select tests.login('diane');
select respond_race((select id from r), true);
select tests.login('alice');
select throws_ok(
  $$ select respond_race((select id from r), false) $$,
  'No invitation to answer', 'l''organisateur ne peut pas se désister');

-- ========== Saisie du classement (Émile n'a pas répondu : il ne court pas) ==========
select tests.login('bruno');
select throws_ok(
  $$ select submit_race_result((select id from r), '[]'::jsonb) $$,
  'Only the organizer can submit the result', 'seul l''organisateur saisit le résultat');

select tests.login('alice');
select throws_ok(
  format($$ select submit_race_result(%L, %L::jsonb) $$, (select id from r), json_build_array(
    json_build_object('pilot_id', tests.id('alice'), 'position', 1),
    json_build_object('pilot_id', tests.id('bruno'), 'position', 2),
    json_build_object('pilot_id', tests.id('chloe'), 'position', 3))),
  'Give exactly one result per participant', 'un résultat par participant, pas un de moins');
select throws_ok(
  format($$ select submit_race_result(%L, %L::jsonb) $$, (select id from r), json_build_array(
    json_build_object('pilot_id', tests.id('alice'), 'position', 1),
    json_build_object('pilot_id', tests.id('bruno'), 'position', 1),
    json_build_object('pilot_id', tests.id('chloe'), 'position', 3),
    json_build_object('pilot_id', tests.id('diane'), 'position', 4))),
  'Positions must be 1 to 4 without duplicates', 'pas deux pilotes à la même place');

select lives_ok(
  format($$ select submit_race_result(%L, %L::jsonb) $$, (select id from r), json_build_array(
    json_build_object('pilot_id', tests.id('alice'), 'position', 1),
    json_build_object('pilot_id', tests.id('bruno'), 'position', 2),
    json_build_object('pilot_id', tests.id('chloe'), 'position', 3),
    json_build_object('pilot_id', tests.id('diane'), 'position', 4))),
  'classement complet accepté');
reset role;
select is((select status from race_entries where race_id = (select id from r) and pilot_id = tests.id('emile')),
  'declined'::race_entry_status, 'l''invité sans réponse est retiré de la course');
select is((select status from races where id = (select id from r)), 'awaiting_confirmation'::race_status,
  'course en attente de confirmation');

-- ========== Confirmation à la majorité (4 pilotes : il en faut 3) ==========
select tests.login('emile');
set local role authenticated;
select throws_ok($$ select confirm_race((select id from r)) $$, 'Not a participant', 'un non-partant ne confirme pas');
select tests.login('bruno');
select confirm_race((select id from r));
reset role;
select is((select status from races where id = (select id from r)), 'awaiting_confirmation'::race_status,
  '2 confirmations sur 4 : pas encore la majorité');

select tests.login('chloe');
set local role authenticated;
select confirm_race((select id from r));
reset role;
select tests.logout();
select is((select status from races where id = (select id from r)), 'confirmed'::race_status, '3 sur 4 : course validée');

-- 4 débutants à 1000 (K = 40) : chaque duel virtuel vaut 0,5 attendu ; delta = 40 × somme / 3.
select results_eq(
  $$ select h.profile_id, h.elo_after from elo_history h where h.race_id = (select id from r) order by h.elo_after desc $$,
  $$ values (tests.id('alice'), 1020), (tests.id('bruno'), 1007), (tests.id('chloe'), 993), (tests.id('diane'), 980) $$,
  'ELO : 1er +20, 2e +7, 3e −7, 4e −20');
select is((select elo from profiles where id = tests.id('alice')), 1020, 'l''ELO du profil suit l''historique');
select results_eq(
  $$ select race_count, race_wins, race_podiums from profiles where id = tests.id('alice') $$,
  $$ values (1, 1, 1) $$,
  'vainqueur : une course, une victoire, un podium');
select results_eq(
  $$ select race_count, race_wins, race_podiums from profiles where id = tests.id('diane') $$,
  $$ values (1, 0, 0) $$,
  '4e : ni victoire ni podium');
select is((select points from profiles where id = tests.id('bruno')), 250, 'course validée avec ELO gagné : +20 +30');
select is((select points from profiles where id = tests.id('chloe')), 220, 'course validée sans ELO gagné : +20');
select is((select elo from profiles where id = tests.id('emile')), 1000, 'le non-partant ne bouge pas');

-- ========== Contestation, puis format chrono avec égalité ==========
select tests.pilot(u) from unnest(array['fanny', 'gael', 'hugo']) u;
select tests.login('fanny');
set local role authenticated;
create temp table r2 on commit drop as
  select create_race(tests.track(), array[tests.id('gael'), tests.id('hugo')], null, 'lap_time', null) as id;
grant select on r2 to authenticated;
select tests.login('gael');
select respond_race((select id from r2), true);
select tests.login('hugo');
select respond_race((select id from r2), true);
select tests.login('fanny');
select submit_race_result((select id from r2), json_build_array(
  json_build_object('pilot_id', tests.id('fanny'), 'best_lap_ms', 47000),
  json_build_object('pilot_id', tests.id('gael'), 'best_lap_ms', 47000),
  json_build_object('pilot_id', tests.id('hugo'), 'best_lap_ms', 48000))::jsonb);
reset role;
select results_eq(
  $$ select position::int from race_entries where race_id = (select id from r2) order by position, pilot_id $$,
  $$ values (1), (1), (3) $$,
  'le classement découle des chronos, égalité comprise');

select tests.login('hugo');
set local role authenticated;
select dispute_race((select id from r2), 'Mauvais chrono');
reset role;
select is((select status from races where id = (select id from r2)), 'disputed'::race_status, 'course contestée');
select is((select count(confirmed_at)::int from race_entries where race_id = (select id from r2)), 0,
  'la contestation efface les confirmations, organisateur compris');
select is((select count(*)::int from elo_history where race_id = (select id from r2)), 0, 'pas d''ELO sur une course contestée');

select * from finish();
rollback;
