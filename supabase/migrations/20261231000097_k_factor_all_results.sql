-- Facteur K des duels : K = 40 pendant les 10 premiers résultats du pilote, duels ET courses de groupe confondus,
-- comme pour les courses (confirm_race, apply_race_elo). Avant, un duel ne comptait que les duels : un pilote avec
-- 10 courses mais aucun duel restait à K = 40 en duel.
-- Seules les lignes ka / kb changent ; le reste des deux fonctions est repris à l'identique.

-- Duel confirmé par les deux pilotes.
create or replace function public.confirm_match(p_match_id uuid)
returns public.matches
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  c challenges;
  a profiles;
  b profiles;
  ea numeric;
  sa numeric;
  ka int;
  kb int;
  new_a int;
  new_b int;
begin
  select * into m from matches where id = p_match_id for update;
  select * into c from challenges where id = m.challenge_id;
  if m.id is null or auth.uid() not in (c.challenger_id, c.opponent_id) then
    raise exception 'Match not found';
  end if;
  if m.status <> 'awaiting_confirmation' then
    raise exception 'Match is not awaiting confirmation';
  end if;

  if auth.uid() = c.challenger_id then
    update matches set challenger_confirmed_at = coalesce(challenger_confirmed_at, now())
     where id = m.id returning * into m;
  else
    update matches set opponent_confirmed_at = coalesce(opponent_confirmed_at, now())
     where id = m.id returning * into m;
  end if;

  if m.challenger_confirmed_at is null or m.opponent_confirmed_at is null then
    return m;
  end if;

  -- Verrouille les deux profils dans un ordre stable pour éviter les interblocages.
  perform 1 from profiles where id in (c.challenger_id, c.opponent_id) order by id for update;
  select * into a from profiles where id = c.challenger_id;
  select * into b from profiles where id = c.opponent_id;

  ea := 1 / (1 + power(10, (b.elo - a.elo) / 400.0));
  sa := case when m.winner_id = a.id then 1 when m.winner_id = b.id then 0 else 0.5 end;
  ka := case when a.matches_played + a.race_count < 10 then 40 when a.elo >= 1850 then 16 else 24 end;
  kb := case when b.matches_played + b.race_count < 10 then 40 when b.elo >= 1850 then 16 else 24 end;
  new_a := round(a.elo + ka * (sa - ea));
  new_b := round(b.elo + kb * ((1 - sa) - (1 - ea)));

  update profiles
     set elo = new_a,
         wins = wins + (sa = 1)::int,
         losses = losses + (sa = 0)::int,
         draws = draws + (sa = 0.5)::int
   where id = a.id;
  update profiles
     set elo = new_b,
         wins = wins + (sa = 0)::int,
         losses = losses + (sa = 1)::int,
         draws = draws + (sa = 0.5)::int
   where id = b.id;

  insert into elo_history (match_id, profile_id, elo_before, elo_after, k_factor)
  values (m.id, a.id, a.elo, new_a, ka), (m.id, b.id, b.elo, new_b, kb);

  update matches set status = 'confirmed', confirmed_at = now() where id = m.id returning * into m;
  update challenges set status = 'completed' where id = c.id;
  return m;
end $$;

-- Duel validé par un admin (même calcul).
create or replace function public.apply_match_elo(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m matches;
  c challenges;
  a profiles;
  b profiles;
  ea numeric;
  sa numeric;
  ka int;
  kb int;
  new_a int;
  new_b int;
begin
  select * into m from matches where id = p_match_id for update;
  select * into c from challenges where id = m.challenge_id;
  perform 1 from profiles where id in (c.challenger_id, c.opponent_id) order by id for update;
  select * into a from profiles where id = c.challenger_id;
  select * into b from profiles where id = c.opponent_id;

  ea := 1 / (1 + power(10, (b.elo - a.elo) / 400.0));
  sa := case when m.winner_id = a.id then 1 when m.winner_id = b.id then 0 else 0.5 end;
  ka := case when a.matches_played + a.race_count < 10 then 40 when a.elo >= 1850 then 16 else 24 end;
  kb := case when b.matches_played + b.race_count < 10 then 40 when b.elo >= 1850 then 16 else 24 end;
  new_a := round(a.elo + ka * (sa - ea));
  new_b := round(b.elo + kb * ((1 - sa) - (1 - ea)));

  update profiles set elo = new_a, wins = wins + (sa = 1)::int, losses = losses + (sa = 0)::int,
                      draws = draws + (sa = 0.5)::int
   where id = a.id;
  update profiles set elo = new_b, wins = wins + (sa = 0)::int, losses = losses + (sa = 1)::int,
                      draws = draws + (sa = 0.5)::int
   where id = b.id;
  insert into elo_history (match_id, profile_id, elo_before, elo_after, k_factor)
  values (m.id, a.id, a.elo, new_a, ka), (m.id, b.id, b.elo, new_b, kb);

  update matches set status = 'confirmed', confirmed_at = now(), dispute_reason = null,
                     challenger_confirmed_at = coalesce(challenger_confirmed_at, now()),
                     opponent_confirmed_at = coalesce(opponent_confirmed_at, now())
   where id = m.id;
  update challenges set status = 'completed' where id = c.id;
end $$;
