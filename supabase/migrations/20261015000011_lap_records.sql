-- Kart Rivals : records du tour, à partir des matchs validés au format « meilleur tour ».
-- Seuls les chronos sont exposés (les matchs restent privés aux participants).

-- Tous les tours chronométrés validés : un rang par pilote et par match.
create or replace view public.lap_times_private as
  select c.track_id, c.challenger_id as pilot_id, m.challenger_best_lap_ms as lap_ms, m.confirmed_at
  from public.matches m join public.challenges c on c.id = m.challenge_id
  where m.status = 'confirmed' and c.format = 'lap_time' and m.challenger_best_lap_ms is not null
  union all
  select c.track_id, c.opponent_id, m.opponent_best_lap_ms, m.confirmed_at
  from public.matches m join public.challenges c on c.id = m.challenge_id
  where m.status = 'confirmed' and c.format = 'lap_time' and m.opponent_best_lap_ms is not null;

-- Vue interne : aucun accès direct depuis l'app.
revoke all on public.lap_times_private from anon, authenticated;

-- Meilleur tour de chaque pilote sur chaque circuit, avec sa place.
create or replace view public.lap_records_private as
  select track_id, pilot_id, lap_ms, set_at,
         rank() over (partition by track_id order by lap_ms) as position
  from (
    select distinct on (track_id, pilot_id) track_id, pilot_id, lap_ms, confirmed_at as set_at
    from public.lap_times_private
    order by track_id, pilot_id, lap_ms, confirmed_at
  ) best;

revoke all on public.lap_records_private from anon, authenticated;

-- Classement des meilleurs tours d'un circuit.
create or replace function public.track_lap_records(p_track_id uuid, p_limit int default 10)
returns table ("position" bigint, pilot_id uuid, username text, avatar_url text, rank public.rank_tier, lap_ms int, set_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.position, p.id, p.username, p.avatar_url, p.rank, r.lap_ms, r.set_at
  from lap_records_private r
  join profiles p on p.id = r.pilot_id
  where r.track_id = p_track_id
  order by r.lap_ms, r.set_at
  limit least(greatest(p_limit, 1), 50);
$$;

-- Records personnels d'un pilote, circuit par circuit.
create or replace function public.pilot_lap_records(p_profile_id uuid)
returns table (track_id uuid, track_name text, lap_ms int, set_at timestamptz, "position" bigint, pilots bigint)
language sql stable security definer set search_path = public as $$
  select r.track_id, t.name, r.lap_ms, r.set_at, r.position,
         (select count(*) from lap_records_private o where o.track_id = r.track_id)
  from lap_records_private r
  join tracks t on t.id = r.track_id
  where r.pilot_id = p_profile_id
  order by r.position, t.name;
$$;

-- Record absolu de chaque circuit (pour la liste des circuits).
create or replace function public.track_records()
returns table (track_id uuid, lap_ms int, username text)
language sql stable security definer set search_path = public as $$
  select distinct on (r.track_id) r.track_id, r.lap_ms, p.username
  from lap_records_private r
  join profiles p on p.id = r.pilot_id
  order by r.track_id, r.lap_ms, r.set_at;
$$;

revoke execute on function public.track_lap_records(uuid, int), public.pilot_lap_records(uuid), public.track_records()
  from public, anon;
grant execute on function public.track_lap_records(uuid, int), public.pilot_lap_records(uuid), public.track_records()
  to authenticated;
