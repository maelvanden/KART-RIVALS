-- Flux d'un défi (respond_challenge → submit_match_result → confirm_match / dispute_match) et moteur ELO.
begin;
select plan(38);

select tests.pilot('alice');
select tests.pilot('bruno');
select tests.pilot('chloe');

-- ========== Défi envoyé et accepté ==========
select tests.login('alice');
set local role authenticated;

insert into challenges (opponent_id, track_id, format) values (tests.id('bruno'), tests.track(), 'position');
create temp table ch on commit drop as select id from challenges where challenger_id = tests.id('alice');
grant select on ch to authenticated;

select throws_ok(
  $$ select respond_challenge((select id from ch), true) $$,
  'Challenge not found', 'le lanceur ne peut pas accepter son propre défi');

select tests.login('bruno');
select is((respond_challenge((select id from ch), true)).status, 'accepted'::challenge_status, 'l''adversaire accepte');
select throws_ok(
  $$ select respond_challenge((select id from ch), true) $$,
  'Challenge is no longer pending', 'un défi ne se répond qu''une fois');

-- ========== Saisie du résultat ==========
select tests.login('chloe');
select throws_ok(
  $$ select submit_match_result((select id from ch), 1::smallint, 2::smallint) $$,
  'Challenge not found', 'un tiers ne peut pas saisir le résultat');

select tests.login('alice');
select throws_ok(
  $$ select submit_match_result((select id from ch), 1::smallint, null) $$,
  'Both positions are required', 'les deux positions sont obligatoires');

create temp table m on commit drop as
  select * from submit_match_result((select id from ch), 1::smallint, 2::smallint);
grant select on m to authenticated;
select is((select status from m), 'awaiting_confirmation'::match_status, 'résultat en attente de confirmation');
select is((select winner_id from m), tests.id('alice'), 'la meilleure position gagne');
select isnt((select challenger_confirmed_at from m), null, 'la saisie vaut confirmation pour son auteur');
select is((select opponent_confirmed_at from m), null, 'l''adversaire n''a pas encore confirmé');

select throws_ok(
  $$ select submit_match_result((select id from ch), 2::smallint, 1::smallint) $$,
  'A result has already been submitted', 'pas de seconde saisie tant que le résultat n''est pas contesté');

-- L'auteur reconfirme : rien ne change, l'ELO attend l'adversaire.
select is((confirm_match((select id from m))).status, 'awaiting_confirmation'::match_status,
  'une seule confirmation ne valide pas le duel');

-- ========== Le client ne touche jamais à l'ELO ==========
select throws_ok(
  $$ update profiles set elo = 3000 where id = tests.id('alice') $$,
  '42501', null, 'l''ELO n''est pas modifiable par le client');
select throws_ok(
  $$ insert into elo_history (match_id, profile_id, elo_before, elo_after, k_factor)
     values ((select id from m), tests.id('alice'), 1000, 3000, 40) $$,
  '42501', null, 'l''historique ELO n''est pas modifiable par le client');

-- ========== Confirmation par l'adversaire : calcul de l'ELO ==========
-- Deux débutants à 1000 (K = 40) : probabilité 0,5 → ±20.
select tests.login('bruno');
select is((confirm_match((select id from m))).status, 'confirmed'::match_status, 'les deux confirmations valident le duel');

reset role;
select tests.logout();

select is((select elo from profiles where id = tests.id('alice')), 1020, 'gagnant : 1000 + 40 × 0,5');
select is((select elo from profiles where id = tests.id('bruno')), 980, 'perdant : 1000 − 40 × 0,5');
select is((select wins from profiles where id = tests.id('alice')), 1, 'victoire comptée');
select is((select losses from profiles where id = tests.id('bruno')), 1, 'défaite comptée');
select is((select status from challenges where id = (select id from ch)), 'completed'::challenge_status, 'défi terminé');
select results_eq(
  $$ select profile_id, elo_before, elo_after, k_factor::int from elo_history
      where match_id = (select id from m) order by elo_after desc $$,
  $$ values (tests.id('alice'), 1000, 1020, 40), (tests.id('bruno'), 1000, 980, 40) $$,
  'historique ELO des deux pilotes');

select tests.login('bruno');
set local role authenticated;
select throws_ok(
  $$ select confirm_match((select id from m)) $$,
  'Match is not awaiting confirmation', 'un duel validé ne se recompte pas');
reset role;

-- ========== Facteur K et surprise ==========
-- Diane (1850, 10 duels → K = 16) perd contre Émile (1200, 10 duels → K = 24).
-- Probabilité de victoire de Diane : 1 / (1 + 10^((1200 − 1850) / 400)) ≈ 0,9768.
select tests.pilot('diane', 1850, 10);
select tests.pilot('emile', 1200, 10);

select tests.login('diane');
set local role authenticated;
insert into challenges (opponent_id, track_id, format) values (tests.id('emile'), tests.track(), 'lap_time');
create temp table ch2 on commit drop as select id from challenges where challenger_id = tests.id('diane');
grant select on ch2 to authenticated;

select tests.login('emile');
select respond_challenge((select id from ch2), true);
select throws_ok(
  $$ select submit_match_result((select id from ch2), null, null, 48000, null) $$,
  'Both lap times are required', 'les deux temps sont obligatoires en format meilleur tour');
create temp table m2 on commit drop as
  select * from submit_match_result((select id from ch2), null, null, 48500, 47900);
grant select on m2 to authenticated;
select is((select winner_id from m2), tests.id('emile'), 'meilleur tour le plus court gagne');

select tests.login('diane');
select confirm_match((select id from m2));
reset role;

select is((select elo from profiles where id = tests.id('diane')), 1834, 'favorite battue : 1850 − 16 × 0,9768');
select is((select elo from profiles where id = tests.id('emile')), 1223, 'outsider vainqueur : 1200 + 24 × 0,9768');
select is((select rank from profiles where id = tests.id('diane')), 'diamant'::rank_tier, 'le rang suit l''ELO (sous 1850 → diamant)');

-- ========== Égalité ==========
select tests.pilot('fanny');
select tests.pilot('gael');
select tests.login('fanny');
set local role authenticated;
insert into challenges (opponent_id, track_id, format) values (tests.id('gael'), tests.track(), 'lap_time');
create temp table ch3 on commit drop as select id from challenges where challenger_id = tests.id('fanny');
grant select on ch3 to authenticated;
select tests.login('gael');
select respond_challenge((select id from ch3), true);
create temp table m3 on commit drop as select * from submit_match_result((select id from ch3), null, null, 47000, 47000);
grant select on m3 to authenticated;
select is((select winner_id from m3), null, 'même temps : pas de vainqueur');
select tests.login('fanny');
select confirm_match((select id from m3));
reset role;

select is((select elo from profiles where id = tests.id('fanny')), 1000, 'égalité entre pilotes de même niveau : ELO inchangé');
select is((select draws from profiles where id = tests.id('gael')), 1, 'match nul compté');

-- ========== Contestation puis nouvelle saisie ==========
select tests.pilot('hugo');
select tests.pilot('ines');
select tests.login('hugo');
set local role authenticated;
insert into challenges (opponent_id, track_id, format) values (tests.id('ines'), tests.track(), 'position');
create temp table ch4 on commit drop as select id from challenges where challenger_id = tests.id('hugo');
grant select on ch4 to authenticated;
select tests.login('ines');
select respond_challenge((select id from ch4), true);
select tests.login('hugo');
create temp table m4 on commit drop as select * from submit_match_result((select id from ch4), 1::smallint, 2::smallint);
grant select on m4 to authenticated;

select tests.login('ines');
create temp table d4 on commit drop as select * from dispute_match((select id from m4), 'J''ai gagné');
grant select on d4 to authenticated;
select is((select status from d4), 'disputed'::match_status, 'l''adversaire conteste');
select is((select challenger_confirmed_at from d4), null, 'la contestation efface les confirmations');
select throws_ok(
  $$ select confirm_match((select id from m4)) $$,
  'Match is not awaiting confirmation', 'un résultat contesté ne se confirme pas');

select is((submit_match_result((select id from ch4), 2::smallint, 1::smallint)).winner_id, tests.id('ines'),
  'après contestation, le résultat peut être ressaisi');
select tests.login('hugo');
select is((confirm_match((select id from m4))).status, 'confirmed'::match_status, 'puis confirmé par l''autre pilote');
reset role;
select is((select elo from profiles where id = tests.id('ines')), 1020, 'l''ELO suit le résultat ressaisi');
select is((select count(*)::int from elo_history where match_id = (select id from m4)), 2,
  'un seul calcul d''ELO malgré la contestation');

-- ========== Défi expiré ==========
select tests.pilot('jade');
select tests.pilot('karim');
insert into challenges (challenger_id, opponent_id, track_id, expires_at)
values (tests.id('jade'), tests.id('karim'), tests.track(), now() - interval '1 minute');
select tests.login('karim');
set local role authenticated;
select is((respond_challenge((select id from challenges where challenger_id = tests.id('jade')), true)).status,
  'expired'::challenge_status, 'un défi expiré ne peut plus être accepté');
reset role;

-- ========== Pilote suspendu ==========
update profiles set suspended_until = now() + interval '1 day' where id = tests.id('jade');
select tests.login('jade');
set local role authenticated;
select throws_ok(
  $$ insert into challenges (opponent_id, track_id) values (tests.id('karim'), tests.track()) $$,
  'Account suspended', 'un pilote suspendu ne peut pas lancer de défi');
reset role;

select * from finish();
rollback;
