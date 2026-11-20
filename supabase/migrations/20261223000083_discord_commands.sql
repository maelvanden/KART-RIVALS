-- Read-only Discord projections: only public, non-demo, non-banned pilots.
-- Do not expose the internal lap views or grant clients access to these RPCs.
create or replace function public.discord_recent_laps()
returns table (username text, track_name text, lap_ms int, confirmed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.username, t.name, l.lap_ms, l.confirmed_at
  from lap_times_private l
  join profiles p on p.id = l.pilot_id
  join tracks t on t.id = l.track_id
  where p.is_discoverable and not p.is_demo and p.banned_at is null
    and l.confirmed_at is not null and l.lap_ms > 0
  order by l.confirmed_at desc, l.source, l.source_id, l.pilot_id
  limit 10;
$$;

create or replace function public.discord_next_rival(p_pilot_id uuid, p_track_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with eligible as (
    select id, username from profiles
    where is_discoverable and not is_demo and banned_at is null
  ), me as (
    select * from eligible where id = p_pilot_id
  ), own_record as (
    select r.lap_ms from lap_records_private r join me on me.id = r.pilot_id
    where r.track_id = p_track_id
  ), rival as (
    select p.username, r.lap_ms
    from lap_records_private r join eligible p on p.id = r.pilot_id
    where r.track_id = p_track_id and r.lap_ms < (select lap_ms from own_record)
    order by r.lap_ms desc, r.set_at, r.pilot_id
    limit 1
  )
  select case when not exists (select 1 from me) then jsonb_build_object('unavailable', true)
  else jsonb_build_object(
    'pilot', (select jsonb_build_object('username', username) from me),
    'track', (select jsonb_build_object('id', id, 'name', name, 'city', city) from tracks where id = p_track_id),
    'lap_ms', (select lap_ms from own_record),
    'rival', (select jsonb_build_object('username', username, 'lap_ms', lap_ms) from rival)
  ) end;
$$;
revoke all on function public.discord_recent_laps(), public.discord_next_rival(uuid, uuid) from public, anon, authenticated;
grant execute on function public.discord_recent_laps(), public.discord_next_rival(uuid, uuid) to service_role;
