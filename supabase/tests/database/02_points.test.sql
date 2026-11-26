-- Points de la boutique : bienvenue, duels, garde-fous (jamais sous zéro, jamais écrits par le client).
begin;
select plan(14);

-- ========== Bienvenue ==========
select tests.pilot('alice');
select tests.pilot('bruno');

select is((select points from profiles where id = tests.id('alice')), 200, '200 points à l''inscription');
select results_eq(
  $$ select reason::text, amount from point_transactions where profile_id = tests.id('alice') $$,
  $$ values ('welcome', 200) $$,
  'une seule transaction de bienvenue');
select throws_ok(
  $$ insert into point_transactions (profile_id, amount, reason) values (tests.id('alice'), 200, 'welcome') $$,
  '23505', null, 'le bonus de bienvenue ne se touche qu''une fois');

-- ========== Duel validé : +20, +30 de plus pour le vainqueur ==========
insert into challenges (challenger_id, opponent_id, track_id, status)
values (tests.id('alice'), tests.id('bruno'), tests.track(), 'accepted');
select tests.login('alice');
set local role authenticated;
create temp table m on commit drop as
  select * from submit_match_result((select id from challenges where challenger_id = tests.id('alice')),
                                    1::smallint, 2::smallint);
grant select on m to authenticated;
select tests.login('bruno');
select confirm_match((select id from m));
reset role;

select is((select points from profiles where id = tests.id('alice')), 250, 'vainqueur : 200 + 20 + 30');
select is((select points from profiles where id = tests.id('bruno')), 220, 'perdant : 200 + 20');
select results_eq(
  $$ select t.reason::text, t.amount from point_transactions t join elo_history h on h.id = t.elo_history_id
      where h.match_id = (select id from m) order by t.amount desc $$,
  $$ values ('match', 50), ('match', 20) $$,
  'les points sont liés à la ligne d''historique ELO du duel');

-- ========== Match nul : +20 chacun ==========
select tests.pilot('chloe');
select tests.pilot('diane');
insert into challenges (challenger_id, opponent_id, track_id, status, format)
values (tests.id('chloe'), tests.id('diane'), tests.track(), 'accepted', 'lap_time');
select tests.login('chloe');
set local role authenticated;
create temp table m2 on commit drop as
  select * from submit_match_result((select id from challenges where challenger_id = tests.id('chloe')),
                                    null, null, 47000, 47000);
grant select on m2 to authenticated;
select tests.login('diane');
select confirm_match((select id from m2));
reset role;

select is((select points from profiles where id = tests.id('chloe')), 220, 'match nul : +20 sans bonus');
select is((select points from profiles where id = tests.id('diane')), 220, 'match nul : +20 pour l''autre aussi');

-- ========== Le client n'écrit jamais ses points ==========
select tests.login('alice');
set local role authenticated;
select throws_ok(
  $$ update profiles set points = 99999 where id = tests.id('alice') $$,
  '42501', null, 'le solde n''est pas modifiable par le client');
select throws_ok(
  $$ insert into point_transactions (profile_id, amount, reason) values (tests.id('alice'), 1000, 'admin_adjustment') $$,
  '42501', null, 'le journal des points n''est pas modifiable par le client');
select is((select count(*)::int from point_transactions where profile_id = tests.id('bruno')), 0,
  'un pilote ne voit pas le journal des autres');
reset role;
select tests.logout();

-- ========== Jamais sous zéro ==========
select throws_ok(
  $$ insert into point_transactions (profile_id, amount, reason) values (tests.id('bruno'), -1000, 'purchase') $$,
  '23514', null, 'une dépense supérieure au solde est refusée');
select admin_claw_back_points(tests.id('bruno'), 5000);
select is((select points from profiles where id = tests.id('bruno')), 0, 'une reprise admin s''arrête à zéro');
select is((select amount from point_transactions where profile_id = tests.id('bruno') and reason = 'admin_adjustment'),
  -220, 'la reprise est journalisée pour le montant réellement retiré');

select * from finish();
rollback;
