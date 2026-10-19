-- Kart Rivals : sessions ouvertes « Je roule samedi ».
--   - Un pilote annonce une session (circuit, date, places, format) ouverte à tous ou à ses coéquipiers et à son écurie.
--   - Les pilotes la rejoignent jusqu'à ce qu'elle soit complète ; l'organisateur peut la lancer à tout moment.
--   - À l'heure prévue (pg_cron toutes les 5 min) ou au lancement : 3 pilotes ou plus → une course (tous inscrits),
--     2 pilotes → un défi déjà accepté, 1 pilote → session expirée. Résultat et ELO suivent le circuit habituel.

create table public.open_sessions (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  track_id     uuid not null references public.tracks (id) on delete cascade,
  starts_at    timestamptz not null,
  spots        smallint not null check (spots between 2 and 8),
  format       public.race_format not null default 'position',
  visibility   text not null default 'public' check (visibility in ('public', 'teammates')),
  message      text check (char_length(message) <= 280),
  status       text not null default 'open' check (status in ('open', 'started', 'cancelled', 'expired')),
  race_id      uuid references public.races (id) on delete set null,
  challenge_id uuid references public.challenges (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index open_sessions_upcoming_idx on public.open_sessions (status, starts_at);
create index open_sessions_track_idx on public.open_sessions (track_id, starts_at);

create table public.session_participants (
  session_id uuid not null references public.open_sessions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (session_id, profile_id)
);
create index session_participants_profile_idx on public.session_participants (profile_id);

-- Coéquipier (relation acceptée) ou même écurie.
create or replace function public.are_teammates(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
     where status = 'accepted'
       and least(requester_id, addressee_id) = least(p_a, p_b)
       and greatest(requester_id, addressee_id) = greatest(p_a, p_b)
  ) or exists (
    select 1 from team_members a join team_members b on a.team_id = b.team_id
     where a.profile_id = p_a and b.profile_id = p_b
  );
$$;

-- Une session est visible si elle est publique (ou réservée aux coéquipiers de l'organisateur), sans blocage.
create or replace function public.can_see_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from open_sessions s
     where s.id = p_session_id
       and (s.host_id = auth.uid()
            or exists (select 1 from session_participants p where p.session_id = s.id and p.profile_id = auth.uid())
            or ((s.visibility = 'public' or public.are_teammates(s.host_id, auth.uid()))
                and not public.is_blocked_between(s.host_id, auth.uid())))
  );
$$;

alter table public.open_sessions enable row level security;
alter table public.session_participants enable row level security;
revoke all on public.open_sessions, public.session_participants from anon, authenticated;
grant select on public.open_sessions, public.session_participants to authenticated;
create policy "visible sessions" on public.open_sessions for select to authenticated using (public.can_see_session(id));
create policy "participants of visible sessions" on public.session_participants
  for select to authenticated using (public.can_see_session(session_id));

-- ========== ORGANISATEUR ==========
create or replace function public.create_open_session(
  p_track_id uuid, p_starts_at timestamptz, p_spots int, p_format public.race_format default 'position',
  p_visibility text default 'public', p_message text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_starts_at < now() + interval '15 minutes' or p_starts_at > now() + interval '60 days' then
    raise exception 'Session must start between 15 minutes and 60 days from now';
  end if;
  if (select count(*) from open_sessions where host_id = auth.uid() and status = 'open') >= 5 then
    raise exception 'Too many open sessions';
  end if;
  insert into open_sessions (host_id, track_id, starts_at, spots, format, visibility, message)
  values (auth.uid(), p_track_id, p_starts_at, p_spots, p_format, p_visibility, nullif(btrim(p_message), ''))
  returning id into v_id;
  insert into session_participants (session_id, profile_id) values (v_id, auth.uid());
  return v_id;
end $$;

create or replace function public.cancel_open_session(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update open_sessions set status = 'cancelled' where id = p_id and host_id = auth.uid() and status = 'open';
  if not found then
    raise exception 'Only the host can cancel an open session';
  end if;
end $$;

-- Transforme une session en course (3+ pilotes) ou en défi accepté (2 pilotes). Appelée par l'organisateur ou le cron.
create or replace function public.start_session_internal(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  s open_sessions;
  v_count int;
  v_race uuid;
  v_challenge uuid;
  v_other uuid;
begin
  select * into s from open_sessions where id = p_id for update;
  if s.id is null or s.status <> 'open' then
    return 'skipped';
  end if;
  select count(*) into v_count from session_participants where session_id = s.id;

  if v_count >= 3 then
    insert into races (organizer_id, track_id, scheduled_at, format, message)
    values (s.host_id, s.track_id, s.starts_at, s.format, coalesce(s.message, 'Session ouverte'))
    returning id into v_race;
    insert into race_entries (race_id, pilot_id, status)
      select v_race, profile_id, 'accepted' from session_participants where session_id = s.id;
    update open_sessions set status = 'started', race_id = v_race where id = s.id;
    return 'race';
  elsif v_count = 2 then
    select profile_id into v_other from session_participants where session_id = s.id and profile_id <> s.host_id;
    insert into challenges (challenger_id, opponent_id, track_id, scheduled_at, format, message, status, responded_at)
    values (s.host_id, v_other, s.track_id, s.starts_at, s.format, coalesce(s.message, 'Session ouverte'), 'accepted', now())
    returning id into v_challenge;
    update open_sessions set status = 'started', challenge_id = v_challenge where id = s.id;
    return 'challenge';
  end if;
  update open_sessions set status = 'expired' where id = s.id;
  return 'expired';
end $$;

create or replace function public.start_open_session(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
begin
  if not exists (select 1 from open_sessions where id = p_id and host_id = auth.uid() and status = 'open') then
    raise exception 'Only the host can start an open session';
  end if;
  if (select count(*) from session_participants where session_id = p_id) < 2 then
    raise exception 'Wait for at least one other pilot';
  end if;
  v_kind := public.start_session_internal(p_id);
  return (select jsonb_build_object('kind', v_kind, 'race_id', race_id, 'challenge_id', challenge_id)
            from open_sessions where id = p_id);
end $$;

-- ========== PILOTES ==========
create or replace function public.join_open_session(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s open_sessions;
begin
  select * into s from open_sessions where id = p_id for update;
  if s.id is null or not public.can_see_session(p_id) then
    raise exception 'Session not found';
  end if;
  if s.status <> 'open' or s.starts_at <= now() then
    raise exception 'Session is closed';
  end if;
  if exists (select 1 from session_participants where session_id = p_id and profile_id = auth.uid()) then
    raise exception 'Already in this session';
  end if;
  if (select count(*) from session_participants where session_id = p_id) >= s.spots then
    raise exception 'Session is full';
  end if;
  insert into session_participants (session_id, profile_id) values (p_id, auth.uid());
end $$;

create or replace function public.leave_open_session(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from open_sessions where id = p_id and host_id = auth.uid()) then
    raise exception 'The host cannot leave, cancel the session instead';
  end if;
  delete from session_participants sp
   using open_sessions s
   where sp.session_id = p_id and sp.profile_id = auth.uid() and s.id = sp.session_id and s.status = 'open';
  if not found then
    raise exception 'Not in this open session';
  end if;
end $$;

-- ========== AUTOMATISATION ==========
create or replace function public.start_due_sessions()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in select id from open_sessions where status = 'open' and starts_at <= now() loop
    perform public.start_session_internal(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
select cron.schedule('start-due-open-sessions', '*/5 * * * *', 'select public.start_due_sessions()');

revoke execute on function public.start_session_internal(uuid), public.start_due_sessions() from public, anon, authenticated;
revoke execute on function
  public.are_teammates(uuid, uuid), public.can_see_session(uuid), public.create_open_session(uuid, timestamptz, int, public.race_format, text, text),
  public.cancel_open_session(uuid), public.start_open_session(uuid), public.join_open_session(uuid), public.leave_open_session(uuid)
from public, anon;
grant execute on function
  public.are_teammates(uuid, uuid), public.can_see_session(uuid), public.create_open_session(uuid, timestamptz, int, public.race_format, text, text),
  public.cancel_open_session(uuid), public.start_open_session(uuid), public.join_open_session(uuid), public.leave_open_session(uuid)
to authenticated;

alter publication supabase_realtime add table public.open_sessions, public.session_participants;
