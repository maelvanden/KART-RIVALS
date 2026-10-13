-- Kart Rivals : fonctions RPC (défis, feuille de temps, moteur ELO, proximité, classements)

-- ========== DÉFIS ==========
create or replace function public.respond_challenge(p_challenge_id uuid, p_accept boolean)
returns public.challenges
language plpgsql security definer set search_path = public as $$
declare
  c challenges;
begin
  select * into c from challenges where id = p_challenge_id for update;
  if c.id is null or c.opponent_id <> auth.uid() then
    raise exception 'Challenge not found';
  end if;
  if c.status <> 'pending' then
    raise exception 'Challenge is no longer pending';
  end if;
  if c.expires_at < now() then
    update challenges set status = 'expired' where id = c.id returning * into c;
    return c;
  end if;

  update challenges
     set status = case when p_accept then 'accepted' else 'declined' end::challenge_status,
         responded_at = now()
   where id = c.id
  returning * into c;
  return c;
end $$;

create or replace function public.cancel_challenge(p_challenge_id uuid)
returns public.challenges
language plpgsql security definer set search_path = public as $$
declare
  c challenges;
begin
  select * into c from challenges where id = p_challenge_id for update;
  if c.id is null or auth.uid() not in (c.challenger_id, c.opponent_id) then
    raise exception 'Challenge not found';
  end if;
  if c.status not in ('pending', 'accepted') then
    raise exception 'Challenge cannot be cancelled';
  end if;
  if exists (select 1 from matches where challenge_id = c.id and status = 'awaiting_confirmation') then
    raise exception 'A result is awaiting confirmation';
  end if;

  update challenges set status = 'cancelled' where id = c.id returning * into c;
  return c;
end $$;

-- ========== FEUILLE DE TEMPS ==========
-- Saisit (ou ressaisit après contestation) le résultat. Le déclarant est réputé l'avoir confirmé.
create or replace function public.submit_match_result(
  p_challenge_id uuid,
  p_challenger_position smallint default null,
  p_opponent_position smallint default null,
  p_challenger_best_lap_ms int default null,
  p_opponent_best_lap_ms int default null
)
returns public.matches
language plpgsql security definer set search_path = public as $$
declare
  c challenges;
  m matches;
  v_winner uuid;
begin
  select * into c from challenges where id = p_challenge_id for update;
  if c.id is null or auth.uid() not in (c.challenger_id, c.opponent_id) then
    raise exception 'Challenge not found';
  end if;
  if c.status <> 'accepted' then
    raise exception 'Challenge must be accepted before submitting a result';
  end if;

  if c.format = 'position' then
    if p_challenger_position is null or p_opponent_position is null then
      raise exception 'Both positions are required';
    end if;
    v_winner := case
      when p_challenger_position < p_opponent_position then c.challenger_id
      when p_opponent_position < p_challenger_position then c.opponent_id
    end;
  else
    if p_challenger_best_lap_ms is null or p_opponent_best_lap_ms is null then
      raise exception 'Both lap times are required';
    end if;
    v_winner := case
      when p_challenger_best_lap_ms < p_opponent_best_lap_ms then c.challenger_id
      when p_opponent_best_lap_ms < p_challenger_best_lap_ms then c.opponent_id
    end;
  end if;

  select * into m from matches where challenge_id = c.id for update;
  if m.id is not null and m.status <> 'disputed' then
    raise exception 'A result has already been submitted';
  end if;

  insert into matches (
    challenge_id, submitted_by,
    challenger_position, opponent_position, challenger_best_lap_ms, opponent_best_lap_ms,
    winner_id, status, challenger_confirmed_at, opponent_confirmed_at, dispute_reason
  ) values (
    c.id, auth.uid(),
    p_challenger_position, p_opponent_position, p_challenger_best_lap_ms, p_opponent_best_lap_ms,
    v_winner, 'awaiting_confirmation',
    case when auth.uid() = c.challenger_id then now() end,
    case when auth.uid() = c.opponent_id then now() end,
    null
  )
  on conflict (challenge_id) do update set
    submitted_by = excluded.submitted_by,
    challenger_position = excluded.challenger_position,
    opponent_position = excluded.opponent_position,
    challenger_best_lap_ms = excluded.challenger_best_lap_ms,
    opponent_best_lap_ms = excluded.opponent_best_lap_ms,
    winner_id = excluded.winner_id,
    status = excluded.status,
    challenger_confirmed_at = excluded.challenger_confirmed_at,
    opponent_confirmed_at = excluded.opponent_confirmed_at,
    dispute_reason = null
  returning * into m;
  return m;
end $$;

create or replace function public.dispute_match(p_match_id uuid, p_reason text default null)
returns public.matches
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  c challenges;
begin
  select * into m from matches where id = p_match_id for update;
  select * into c from challenges where id = m.challenge_id;
  if m.id is null or auth.uid() not in (c.challenger_id, c.opponent_id) then
    raise exception 'Match not found';
  end if;
  if m.status <> 'awaiting_confirmation' then
    raise exception 'Match is not awaiting confirmation';
  end if;

  update matches
     set status = 'disputed', dispute_reason = p_reason,
         challenger_confirmed_at = null, opponent_confirmed_at = null
   where id = m.id
  returning * into m;
  return m;
end $$;

-- ========== MOTEUR ELO ==========
-- Enregistre la confirmation de l'appelant. Quand les deux pilotes ont confirmé, recalcule
-- l'ELO des deux dans la même transaction.
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
  ka := case when a.matches_played < 10 then 40 when a.elo >= 1850 then 16 else 24 end;
  kb := case when b.matches_played < 10 then 40 when b.elo >= 1850 then 16 else 24 end;
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

-- ========== PROXIMITÉ ==========
create or replace function public.nearby_pilots(lat float, lng float, radius_km int default 30)
returns table (
  id uuid, username text, avatar_url text, elo int, rank public.rank_tier,
  wins int, losses int, distance_km numeric
)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.username, p.avatar_url, p.elo, p.rank, p.wins, p.losses,
         round((st_distance(p.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) / 1000)::numeric, 1)
  from profiles p
  where p.is_discoverable
    and p.location is not null
    and p.id <> auth.uid()
    and st_dwithin(p.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography,
                   least(greatest(radius_km, 1), 200) * 1000)
  order by 8
  limit 50;
$$;

-- ========== CLASSEMENTS ==========
create view public.leaderboard_global with (security_invoker = true) as
  select id, username, avatar_url, home_track_id, elo, rank, wins, losses, draws, matches_played,
         rank() over (order by elo desc) as position
  from public.profiles
  where matches_played > 0;

grant select on public.leaderboard_global to authenticated;

-- Classement local : pilotes dans un rayon autour d'un point (sans exposer leur distance).
create or replace function public.leaderboard_near(lat float, lng float, radius_km int default 50)
returns table (
  id uuid, username text, avatar_url text, elo int, rank public.rank_tier,
  wins int, losses int, "position" bigint
)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.username, p.avatar_url, p.elo, p.rank, p.wins, p.losses,
         rank() over (order by p.elo desc)
  from profiles p
  where p.matches_played > 0
    and p.location is not null
    and st_dwithin(p.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography,
                   least(greatest(radius_km, 1), 200) * 1000)
  order by p.elo desc
  limit 100;
$$;

-- Les fonctions ne sont appelables que par des utilisateurs connectés.
revoke execute on function
  public.respond_challenge(uuid, boolean),
  public.cancel_challenge(uuid),
  public.submit_match_result(uuid, smallint, smallint, int, int),
  public.dispute_match(uuid, text),
  public.confirm_match(uuid),
  public.nearby_pilots(float, float, int),
  public.leaderboard_near(float, float, int)
from public, anon;
grant execute on function
  public.respond_challenge(uuid, boolean),
  public.cancel_challenge(uuid),
  public.submit_match_result(uuid, smallint, smallint, int, int),
  public.dispute_match(uuid, text),
  public.confirm_match(uuid),
  public.nearby_pilots(float, float, int),
  public.leaderboard_near(float, float, int)
to authenticated;
