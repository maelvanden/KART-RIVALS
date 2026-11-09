-- Kart Rivals : classement Time Attack (onglet Podium, mode « Time Attack »).
-- Par circuit, le meilleur tour certifié par ticket de chaque pilote (sessions Time Attack validées), du plus rapide
-- au plus lent. Comptes de démo et pilotes bannis exclus, comme les autres classements.

-- Circuits qui ont au moins un chrono Time Attack, les plus disputés d'abord (sélecteur de circuit).
create or replace function public.time_attack_tracks()
returns table (track_id uuid, track_name text, city text, pilots bigint, best_lap_ms int)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.city, count(distinct s.pilot_id), min(s.best_lap_ms)
  from time_attack_sessions s
  join tracks t on t.id = s.track_id
  join profiles p on p.id = s.pilot_id
  where s.status = 'validated' and s.best_lap_ms is not null and not p.is_demo and p.banned_at is null
  group by t.id, t.name, t.city
  order by count(distinct s.pilot_id) desc, t.name;
$$;

-- Classement d'un circuit : un tour par pilote (son meilleur ; le plus ancien en cas d'égalité), avec son nombre de
-- sessions validées sur ce circuit.
create or replace function public.time_attack_leaderboard(p_track_id uuid, p_limit int default 100)
returns table ("position" bigint, pilot_id uuid, username text, avatar_url text, rank public.rank_tier,
               lap_ms int, set_at timestamptz, sessions bigint)
language sql stable security definer set search_path = public as $$
  with laps as (
    select s.pilot_id, s.best_lap_ms as lap_ms, coalesce(s.validated_at, s.ticket_at) as set_at
    from time_attack_sessions s
    join profiles p on p.id = s.pilot_id
    where s.track_id = p_track_id and s.status = 'validated' and s.best_lap_ms is not null
      and not p.is_demo and p.banned_at is null
  ),
  best as (
    select distinct on (pilot_id) pilot_id, lap_ms, set_at, count(*) over (partition by pilot_id) as sessions
    from laps
    order by pilot_id, lap_ms, set_at
  )
  select rank() over (order by b.lap_ms), b.pilot_id, p.username, p.avatar_url, p.rank, b.lap_ms, b.set_at, b.sessions
  from best b
  join profiles p on p.id = b.pilot_id
  order by b.lap_ms, b.set_at
  limit least(greatest(p_limit, 1), 200);
$$;

revoke execute on function public.time_attack_tracks(), public.time_attack_leaderboard(uuid, int) from public, anon;
grant execute on function public.time_attack_tracks(), public.time_attack_leaderboard(uuid, int) to authenticated;
