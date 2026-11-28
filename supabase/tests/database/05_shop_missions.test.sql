-- Boutique (achat et équipement) et missions de la semaine.
begin;
select plan(24);

select tests.pilot('alice');   -- 200 points de bienvenue, rang Novice
select tests.pilot('bruno');

-- ========== Achat ==========
select tests.login('alice');
set local role authenticated;

select throws_ok($$ select buy_gear_item('inconnu') $$, 'ITEM_NOT_FOUND', 'objet inconnu');
select throws_ok($$ select buy_gear_item('helmet-rental') $$, 'ALREADY_OWNED', 'l''équipement de location est déjà à tout le monde');
select throws_ok($$ select buy_gear_item('helmet-neon') $$, 'NOT_ENOUGH_POINTS', '400 points demandés, 200 en poche');
select throws_ok($$ select buy_gear_item('helmet-thunder') $$, 'RANK_REQUIRED', 'objet réservé au rang Argent');

select is(buy_gear_item('helmet-street'), 50, 'achat à 150 points : il en reste 50');
select is((select points from profiles where id = tests.id('alice')), 50, 'le solde est débité');
select results_eq(
  $$ select reason::text, amount, item_id from point_transactions where profile_id = tests.id('alice') and reason = 'purchase' $$,
  $$ values ('purchase', -150, 'helmet-street') $$,
  'l''achat est journalisé');
select is((select item_id from user_gear where profile_id = tests.id('alice') and slot = 'helmet'), 'helmet-street',
  'l''objet acheté est porté tout de suite');
select throws_ok($$ select buy_gear_item('helmet-street') $$, 'ALREADY_OWNED', 'on n''achète pas deux fois le même objet');

-- Le client ne s'offre rien tout seul.
select throws_ok(
  $$ insert into user_items (profile_id, item_id) values (tests.id('alice'), 'helmet-inferno') $$,
  '42501', null, 'la collection n''est pas modifiable par le client');
select throws_ok(
  $$ insert into user_gear (profile_id, slot, item_id) values (tests.id('alice'), 'suit', 'suit-carbon') $$,
  '42501', null, 'l''équipement porté n''est pas modifiable par le client');
reset role;

-- Objet de rang : gratuit une fois le rang atteint.
update profiles set elo = 1250 where id = tests.id('alice');
select tests.login('alice');
set local role authenticated;
select is(buy_gear_item('helmet-thunder'), 50, 'rang Argent atteint : l''objet se débloque sans dépenser de points');

-- ========== Équipement ==========
select equip_gear_item('helmet-rental');
select is((select count(*)::int from user_gear where profile_id = tests.id('alice') and slot = 'helmet'), 0,
  'remettre le casque de location vide l''emplacement');
select equip_gear_item('helmet-street');
select is((select item_id from user_gear where profile_id = tests.id('alice') and slot = 'helmet'), 'helmet-street',
  'on peut remettre un objet de sa collection');
select throws_ok($$ select equip_gear_item('suit-carbon') $$, 'NOT_OWNED', 'on ne porte que ce qu''on possède');

-- ========== Missions ==========
select tests.login('bruno');
select is((select count(*)::int from my_missions()), 4, '3 missions fixes + 1 bonus');
select is((select count(*)::int from my_missions() where bonus), 1, 'une seule mission bonus');
select is(extract(isodow from mission_week_start())::int, 1, 'la semaine commence le lundi');
select throws_ok($$ select claim_mission('two_tracks') $$, 'Mission not completed', 'mission pas encore remplie');
select throws_ok($$ select claim_mission('inconnue') $$, 'Mission not found', 'mission inconnue');
reset role;

-- Bruno roule cette semaine sur 2 circuits : un duel validé et un Time Attack validé.
select tests.pilot('chloe');
insert into challenges (challenger_id, opponent_id, track_id, status)
values (tests.id('bruno'), tests.id('chloe'), tests.track(), 'accepted');
select tests.login('bruno');
set local role authenticated;
create temp table m on commit drop as
  select * from submit_match_result((select id from challenges where challenger_id = tests.id('bruno')), 1::smallint, 2::smallint);
grant select on m to authenticated;
select tests.login('chloe');
select confirm_match((select id from m));
reset role;
insert into time_attack_sessions (pilot_id, track_id, status, ticket_at, best_lap_ms, validated_at)
values (tests.id('bruno'), (select id from tracks where id <> tests.track() and hidden_at is null limit 1),
        'validated', now() + interval '1 minute', 47000, now());

select tests.login('bruno');
set local role authenticated;
select is((select progress from my_missions() where key = 'two_tracks'), 2, 'deux circuits différents comptés');
select is(claim_mission('two_tracks'), 60, 'mission réclamée : 60 points');
select throws_ok($$ select claim_mission('two_tracks') $$, 'Mission already claimed', 'une mission ne se réclame qu''une fois par semaine');
reset role;
select is((select points from profiles where id = tests.id('bruno')), 200 + 50 + 60, 'bienvenue + duel gagné + mission');

select * from finish();
rollback;
