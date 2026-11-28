-- Tournois : inscriptions, tirage par ELO, avancement du tableau, forfait, qualification d'office, récompenses.
begin;
select plan(29);

-- Têtes de série par ELO : pilote1 (1 400) > pilote2 (1 300) > pilote3 (1 200) > pilote4 (1 100).
select tests.pilot('pilote1', 1400);
select tests.pilot('pilote2', 1300);
select tests.pilot('pilote3', 1200);
select tests.pilot('pilote4', 1100);
select tests.pilot('pilote5', 1000);

create function pg_temp.duel(p_tournament uuid, p_round int, p_slot int)
returns tournament_matches language sql as $$
  select * from tournament_matches where tournament_id = p_tournament and round = p_round and slot = p_slot;
$$;

-- ========== Création ==========
select tests.login('pilote1');
set local role authenticated;
select throws_ok(
  $$ select create_tournament(p_track_id => tests.track(), p_name => 'Coupe', p_size => 6, p_format => 'position',
                              p_starts_at => null, p_message => null, p_is_private => false, p_prize => null,
                              p_is_official => false, p_participate => true, p_auto_start => true,
                              p_min_elo => null, p_max_elo => null, p_options => null) $$,
  'A tournament has 4, 8, 16 or 32 pilots', 'taille de tableau invalide');
select throws_ok(
  $$ select create_tournament(p_track_id => tests.track(), p_name => 'Co', p_size => 4, p_format => 'position',
                              p_starts_at => null, p_message => null, p_is_private => false, p_prize => null,
                              p_is_official => false, p_participate => true, p_auto_start => true,
                              p_min_elo => null, p_max_elo => null, p_options => null) $$,
  'Tournament name must be 3 to 60 characters', 'nom trop court');

create temp table t on commit drop as
  select create_tournament(p_track_id => tests.track(), p_name => 'Coupe d''hiver', p_size => 4, p_format => 'position',
                           p_starts_at => null, p_message => null, p_is_private => false, p_prize => null,
                           p_is_official => false, p_participate => true, p_auto_start => true,
                           p_min_elo => 1050, p_max_elo => null, p_options => null) as id;
grant select on t to authenticated;

-- ========== Inscriptions ==========
select tests.login('pilote5');
select throws_ok($$ select join_tournament((select id from t)) $$, 'Entry conditions not met', 'ELO minimum non atteint');
select tests.login('pilote1');
select throws_ok($$ select join_tournament((select id from t)) $$, 'Already registered', 'l''organisateur est inscrit d''office');
select tests.login('pilote2');
select is(join_tournament((select id from t)), 'registered', 'inscription');
select tests.login('pilote3');
select join_tournament((select id from t));
reset role;
select is((select status from tournaments where id = (select id from t)), 'registration'::tournament_status,
  '3 inscrits sur 4 : le tableau attend');

-- Le 4e inscrit complète le tableau : tirage automatique.
select tests.login('pilote4');
set local role authenticated;
select join_tournament((select id from t));
reset role;
select is((select status from tournaments where id = (select id from t)), 'running'::tournament_status,
  'tableau complet : le tournoi démarre tout seul');
select results_eq(
  $$ select pilot_id, seed::int from tournament_entries where tournament_id = (select id from t) order by seed $$,
  $$ values (tests.id('pilote1'), 1), (tests.id('pilote2'), 2), (tests.id('pilote3'), 3), (tests.id('pilote4'), 4) $$,
  'têtes de série dans l''ordre de l''ELO');
select results_eq(
  $$ select round::int, slot::int, pilot_a, pilot_b from tournament_matches where tournament_id = (select id from t) order by round, slot $$,
  $$ values (1, 0, tests.id('pilote1'), tests.id('pilote4')), (1, 1, tests.id('pilote2'), tests.id('pilote3')), (2, 0, null::uuid, null::uuid) $$,
  'demi-finales 1 contre 4 et 2 contre 3, finale à remplir');
select is((select status from challenges where id = (pg_temp.duel((select id from t), 1, 0)).challenge_id),
  'accepted'::challenge_status, 'chaque demi-finale crée un défi déjà accepté');

select tests.login('pilote5');
set local role authenticated;
select throws_ok($$ select join_tournament((select id from t)) $$, 'Registrations are closed', 'plus d''inscription une fois lancé');
reset role;
select tests.logout();

-- ========== Garde-fous ==========
select throws_ok(
  format($$ update challenges set status = 'cancelled' where id = %L $$, (pg_temp.duel((select id from t), 1, 0)).challenge_id),
  'Tournament duels cannot be cancelled: forfeit instead', 'un duel de tournoi ne s''annule pas : on déclare forfait');

select tests.login('pilote4');
set local role authenticated;
select throws_ok(
  format($$ select submit_match_result(%L, 1::smallint, 1::smallint) $$, (pg_temp.duel((select id from t), 1, 0)).challenge_id),
  'A tournament duel cannot end in a tie', 'pas d''égalité en tournoi');

-- ========== Demi-finale 1 : surprise, pilote4 bat pilote1 ==========
select submit_match_result((pg_temp.duel((select id from t), 1, 0)).challenge_id, 2::smallint, 1::smallint);
select tests.login('pilote1');
select confirm_match((select id from matches where challenge_id = (pg_temp.duel((select id from t), 1, 0)).challenge_id));
reset role;
select results_eq(
  $$ select winner_id, outcome from tournament_matches where id = (pg_temp.duel((select id from t), 1, 0)).id $$,
  $$ values (tests.id('pilote4'), 'race') $$,
  'le duel validé désigne le qualifié');
select is((pg_temp.duel((select id from t), 2, 0)).pilot_a, tests.id('pilote4'), 'le vainqueur de la case paire monte en pilote A');
select is((pg_temp.duel((select id from t), 2, 0)).challenge_id, null, 'la finale attend l''autre demi-finale');
select isnt((select elo from profiles where id = tests.id('pilote4')), 1100, 'un duel de tournoi compte pour l''ELO');

-- ========== Demi-finale 2 : forfait de pilote3 ==========
select tests.login('pilote1');
set local role authenticated;
select throws_ok(
  format($$ select forfeit_tournament_match(%L) $$, (pg_temp.duel((select id from t), 1, 1)).id),
  'Tournament match not found', 'on ne déclare forfait que pour son propre duel');
select tests.login('pilote3');
select forfeit_tournament_match((pg_temp.duel((select id from t), 1, 1)).id);
reset role;
select results_eq(
  $$ select winner_id, outcome from tournament_matches where id = (pg_temp.duel((select id from t), 1, 1)).id $$,
  $$ values (tests.id('pilote2'), 'forfeit') $$,
  'forfait : l''adversaire est qualifié');
select is((select elo from profiles where id = tests.id('pilote3')), 1200, 'un forfait ne coûte pas d''ELO');
select is((pg_temp.duel((select id from t), 2, 0)).pilot_b, tests.id('pilote2'), 'le vainqueur de la case impaire monte en pilote B');
select isnt((pg_temp.duel((select id from t), 2, 0)).challenge_id, null, 'les deux finalistes connus : le défi de la finale est créé');

-- ========== Finale : pilote2 bat pilote4 ==========
select tests.login('pilote2');
set local role authenticated;
select submit_match_result((pg_temp.duel((select id from t), 2, 0)).challenge_id, 2::smallint, 1::smallint);
select tests.login('pilote4');
select confirm_match((select id from matches where challenge_id = (pg_temp.duel((select id from t), 2, 0)).challenge_id));
reset role;
select results_eq(
  $$ select status::text, champion_id, runner_up_id from tournaments where id = (select id from t) $$,
  $$ values ('completed', tests.id('pilote2'), tests.id('pilote4')) $$,
  'tournoi terminé : vainqueur et finaliste');
select results_eq(
  $$ select profile_id, amount from point_transactions where reason = 'tournament' order by amount desc $$,
  $$ values (tests.id('pilote2'), 300), (tests.id('pilote4'), 100) $$,
  'récompenses : 300 points au vainqueur, 100 au finaliste');

-- ========== Lancement manuel et qualification d'office ==========
select tests.pilot(u) from unnest(array['orga1', 'orga2', 'orga3']) u;
update profiles set elo = 1300 where id = tests.id('orga1');
select tests.login('orga1');
set local role authenticated;
create temp table t2 on commit drop as
  select create_tournament(p_track_id => tests.track(), p_name => 'Coupe de printemps', p_size => 4, p_format => 'position',
                           p_starts_at => null, p_message => null, p_is_private => false, p_prize => null,
                           p_is_official => false, p_participate => true, p_auto_start => false,
                           p_min_elo => null, p_max_elo => null, p_options => null) as id;
grant select on t2 to authenticated;
select tests.login('orga2');
select join_tournament((select id from t2));
select tests.login('orga1');
select throws_ok($$ select start_tournament((select id from t2)) $$, 'Not enough pilots to start', 'il faut au moins 3 pilotes sur 4');
select tests.login('orga3');
select join_tournament((select id from t2));
select throws_ok($$ select start_tournament((select id from t2)) $$, 'Only the organizer can start the tournament',
  'seul l''organisateur lance le tableau');
select tests.login('orga1');
select start_tournament((select id from t2));
reset role;
select is((select status from tournaments where id = (select id from t2)), 'running'::tournament_status, 'lancé avec 3 pilotes');
select results_eq(
  $$ select winner_id, outcome, challenge_id from tournament_matches where id = (pg_temp.duel((select id from t2), 1, 0)).id $$,
  $$ values (tests.id('orga1'), 'bye', null::uuid) $$,
  'la tête de série 1 n''a pas d''adversaire : qualifiée d''office, sans défi');
select is((pg_temp.duel((select id from t2), 2, 0)).pilot_a, tests.id('orga1'), 'et elle attend en finale');

select * from finish();
rollback;
