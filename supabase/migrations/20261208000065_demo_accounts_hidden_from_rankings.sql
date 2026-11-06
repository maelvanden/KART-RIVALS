-- Kart Rivals : les comptes de démonstration (vérification Apple) n'apparaissent dans aucun classement.
-- Ils restent utilisables normalement (connexion, défis, Actu…) ; seuls les classements et les records les ignorent :
-- France (leaderboard_global), 50 km (leaderboard_near), région et département (pilot_areas → leaderboard_area,
-- pilot_standings), classement d'un circuit (track_leaderboard) et records du tour (lap_times_private).

alter table public.profiles add column if not exists is_demo boolean not null default false;
-- Lisible (leaderboard_global est une vue security_invoker), jamais modifiable par les pilotes (pas de grant insert/update).
grant select (is_demo) on public.profiles to authenticated;

update public.profiles set is_demo = true
 where id in ('a99e0001-0000-4000-8000-000000000001', 'a99e0001-0000-4000-8000-000000000002');

-- ========== FRANCE ==========
create or replace view public.leaderboard_global with (security_invoker = true) as
  select id, username, avatar_url, home_track_id, elo, rank, wins, losses, draws, matches_played,
         rank() over (order by elo desc) as position
  from public.profiles
  where matches_played > 0 and banned_at is null and not is_demo;

-- ========== 50 KM ==========
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
    and p.banned_at is null
    and not p.is_demo
    and p.location is not null
    and st_dwithin(p.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography,
                   least(greatest(radius_km, 1), 200) * 1000)
  order by p.elo desc
  limit 100;
$$;

-- ========== RÉGION ET DÉPARTEMENT ==========
-- Département et région de chaque pilote classable (non banni, hors comptes de démo).
create or replace function public.pilot_areas()
returns table (profile_id uuid, department text, region text)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, d.code, dr.region
    from profiles p
    left join tracks ht on ht.id = p.home_track_id
    left join lateral (
      select t.postal_code from tracks t
       where ht.postal_code is null and p.location is not null and t.hidden_at is null and t.postal_code is not null
       order by t.location <-> p.location
       limit 1
    ) nt on true
    cross join lateral (select left(coalesce(ht.postal_code, nt.postal_code), 2) as code) d
    left join department_regions dr on dr.department = d.code
   where p.banned_at is null
     and not p.is_demo;
$$;

-- ========== CLASSEMENT D'UN CIRCUIT ==========
create or replace function public.track_leaderboard(p_track_id uuid, p_limit int default 20)
returns table (id uuid, username text, elo int, rank public.rank_tier, wins bigint, matches bigint)
language sql stable security definer set search_path = public as $$
  with results as (
    select p.id as pilot_id, (m.winner_id = p.id) as won
    from matches m
    join challenges c on c.id = m.challenge_id
    join profiles p on p.id in (c.challenger_id, c.opponent_id)
    where m.status = 'confirmed'
      and c.track_id = p_track_id
  )
  select p.id, p.username, p.elo, p.rank,
         count(*) filter (where r.won),
         count(*)
  from results r
  join profiles p on p.id = r.pilot_id and p.banned_at is null and not p.is_demo
  group by p.id
  order by count(*) filter (where r.won) desc, p.elo desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- ========== RECORDS DU TOUR ==========
-- Source de track_lap_records, pilot_lap_records et track_records : les chronos des comptes de démo n'y entrent pas.
create or replace view public.lap_times_private as
  select c.track_id, c.challenger_id as pilot_id, m.challenger_best_lap_ms as lap_ms, m.confirmed_at
  from public.matches m join public.challenges c on c.id = m.challenge_id
  where m.status = 'confirmed' and c.format = 'lap_time' and m.challenger_best_lap_ms is not null
    and not exists (select 1 from public.profiles d where d.id = c.challenger_id and d.is_demo)
  union all
  select c.track_id, c.opponent_id, m.opponent_best_lap_ms, m.confirmed_at
  from public.matches m join public.challenges c on c.id = m.challenge_id
  where m.status = 'confirmed' and c.format = 'lap_time' and m.opponent_best_lap_ms is not null
    and not exists (select 1 from public.profiles d where d.id = c.opponent_id and d.is_demo);
