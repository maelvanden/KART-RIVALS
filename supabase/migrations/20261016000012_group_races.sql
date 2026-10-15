-- Kart Rivals : courses à plusieurs (3 à 8 pilotes).
-- L'organisateur invite, saisit le résultat ; validation à la majorité des participants ;
-- ELO multijoueur (chaque paire de pilotes compte comme un mini-duel, pondéré par 1 / (n - 1)).

create type public.race_status as enum ('open', 'awaiting_confirmation', 'confirmed', 'disputed', 'cancelled');
create type public.race_entry_status as enum ('invited', 'accepted', 'declined');

create table public.races (
  id             uuid primary key default gen_random_uuid(),
  organizer_id   uuid not null references public.profiles (id) on delete cascade,
  track_id       uuid not null references public.tracks (id),
  scheduled_at   timestamptz,
  format         public.race_format not null default 'position',
  message        text check (char_length(message) <= 280),
  status         public.race_status not null default 'open',
  submitted_at   timestamptz,
  confirmed_at   timestamptz,
  dispute_reason text check (char_length(dispute_reason) <= 500),
  created_at     timestamptz not null default now()
);
create index races_organizer_idx on public.races (organizer_id, status);

create table public.race_entries (
  race_id      uuid not null references public.races (id) on delete cascade,
  pilot_id     uuid not null references public.profiles (id) on delete cascade,
  status       public.race_entry_status not null default 'invited',
  position     smallint check (position between 1 and 8),
  best_lap_ms  int check (best_lap_ms > 0),
  confirmed_at timestamptz,
  primary key (race_id, pilot_id)
);
create index race_entries_pilot_idx on public.race_entries (pilot_id);

-- Compteurs de courses sur la licence (séparés du bilan des duels).
alter table public.profiles
  add column race_count int not null default 0,
  add column race_wins int not null default 0,
  add column race_podiums int not null default 0;
grant select (race_count, race_wins, race_podiums) on public.profiles to authenticated;

-- L'historique ELO accepte désormais un match OU une course.
alter table public.elo_history alter column match_id drop not null;
alter table public.elo_history add column race_id uuid references public.races (id) on delete cascade;
alter table public.elo_history add constraint elo_history_one_source
  check ((match_id is null) <> (race_id is null));
create unique index elo_history_race_profile_key on public.elo_history (race_id, profile_id) where race_id is not null;

-- ========== SÉCURITÉ : lecture pour les participants, écritures uniquement via les fonctions ==========
alter table public.races enable row level security;
alter table public.race_entries enable row level security;
revoke all on public.races, public.race_entries from anon, authenticated;
grant select on public.races, public.race_entries to authenticated;

create or replace function public.is_race_member(p_race_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from race_entries where race_id = p_race_id and pilot_id = auth.uid());
$$;

create policy "members read their races" on public.races
  for select to authenticated using (public.is_race_member(id));
create policy "members read race entries" on public.race_entries
  for select to authenticated using (public.is_race_member(race_id));

-- ========== CRÉATION / RÉPONSE / ANNULATION ==========
create or replace function public.create_race(
  p_track_id uuid,
  p_invitees uuid[],
  p_scheduled_at timestamptz default null,
  p_format public.race_format default 'position',
  p_message text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_invitees uuid[];
begin
  select array_agg(distinct x) into v_invitees from unnest(p_invitees) x where x <> auth.uid();
  if coalesce(array_length(v_invitees, 1), 0) not between 2 and 7 then
    raise exception 'Invite between 2 and 7 other pilots';
  end if;
  if (select count(*) from profiles where id = any (v_invitees)) <> array_length(v_invitees, 1) then
    raise exception 'Unknown pilot in invitations';
  end if;

  insert into races (organizer_id, track_id, scheduled_at, format, message)
  values (auth.uid(), p_track_id, p_scheduled_at, p_format, p_message)
  returning id into v_id;

  insert into race_entries (race_id, pilot_id, status) values (v_id, auth.uid(), 'accepted');
  insert into race_entries (race_id, pilot_id) select v_id, unnest(v_invitees);
  return v_id;
end $$;

create or replace function public.respond_race(p_race_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from races where id = p_race_id and status = 'open') then
    raise exception 'Race is not open';
  end if;
  -- Tant que la course est ouverte, un invité peut accepter ou se désister (pas l'organisateur).
  update race_entries
     set status = case when p_accept then 'accepted' else 'declined' end::race_entry_status
   where race_id = p_race_id
     and pilot_id = auth.uid()
     and pilot_id <> (select organizer_id from races where id = p_race_id);
  if not found then
    raise exception 'No invitation to answer';
  end if;
end $$;

create or replace function public.cancel_race(p_race_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update races set status = 'cancelled'
   where id = p_race_id and organizer_id = auth.uid() and status in ('open', 'disputed');
  if not found then
    raise exception 'Only the organizer can cancel an open race';
  end if;
end $$;

-- ========== RÉSULTAT ==========
-- p_results : [{ "pilot_id": "...", "position": 1 }] ou [{ "pilot_id": "...", "best_lap_ms": 61234 }]
create or replace function public.submit_race_result(p_race_id uuid, p_results jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r races;
  v_accepted int;
  v_given int;
begin
  select * into r from races where id = p_race_id for update;
  if r.id is null or r.organizer_id <> auth.uid() then
    raise exception 'Only the organizer can submit the result';
  end if;
  if r.status not in ('open', 'disputed') then
    raise exception 'Result can no longer be submitted';
  end if;

  -- Les invités qui n'ont pas répondu ne courent pas.
  update race_entries set status = 'declined' where race_id = r.id and status = 'invited';
  select count(*) into v_accepted from race_entries where race_id = r.id and status = 'accepted';
  if v_accepted < 3 then
    raise exception 'At least 3 pilots must take part';
  end if;

  drop table if exists given;
  create temp table given on commit drop as
    select (e->>'pilot_id')::uuid as pilot_id,
           (e->>'position')::smallint as position,
           (e->>'best_lap_ms')::int as best_lap_ms
    from jsonb_array_elements(p_results) e;

  select count(distinct g.pilot_id) into v_given
  from given g join race_entries re on re.race_id = r.id and re.pilot_id = g.pilot_id and re.status = 'accepted';
  if v_given <> v_accepted or (select count(*) from given) <> v_accepted then
    raise exception 'Give exactly one result per participant';
  end if;

  if r.format = 'position' then
    if exists (select 1 from given where position is null or position < 1 or position > v_accepted)
       or (select count(distinct position) from given) <> v_accepted then
      raise exception 'Positions must be 1 to % without duplicates', v_accepted;
    end if;
    update race_entries re set position = g.position, best_lap_ms = null
      from given g where re.race_id = r.id and re.pilot_id = g.pilot_id;
  else
    if exists (select 1 from given where best_lap_ms is null or best_lap_ms <= 0) then
      raise exception 'Every participant needs a lap time';
    end if;
    -- Le classement découle des chronos (égalité possible).
    update race_entries re set best_lap_ms = g.best_lap_ms, position = ranked.pos
      from given g
      join (select pilot_id, rank() over (order by best_lap_ms) as pos from given) ranked using (pilot_id)
      where re.race_id = r.id and re.pilot_id = g.pilot_id;
  end if;

  update race_entries set confirmed_at = case when pilot_id = auth.uid() then now() end
   where race_id = r.id and status = 'accepted';
  update races set status = 'awaiting_confirmation', submitted_at = now(), dispute_reason = null where id = r.id;
end $$;

create or replace function public.dispute_race(p_race_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from race_entries where race_id = p_race_id and pilot_id = auth.uid() and status = 'accepted') then
    raise exception 'Not a participant';
  end if;
  update races set status = 'disputed', dispute_reason = p_reason
   where id = p_race_id and status = 'awaiting_confirmation';
  if not found then
    raise exception 'Race is not awaiting confirmation';
  end if;
  update race_entries set confirmed_at = null where race_id = p_race_id;
end $$;

-- ========== VALIDATION + ELO MULTIJOUEUR ==========
create or replace function public.confirm_race(p_race_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r races;
  v_n int;
  v_confirmed int;
  e record;
  o record;
  v_sum numeric;
  v_k int;
begin
  select * into r from races where id = p_race_id for update;
  if r.id is null or r.status <> 'awaiting_confirmation' then
    raise exception 'Race is not awaiting confirmation';
  end if;
  update race_entries set confirmed_at = coalesce(confirmed_at, now())
   where race_id = r.id and pilot_id = auth.uid() and status = 'accepted';
  if not found then
    raise exception 'Not a participant';
  end if;

  select count(*), count(confirmed_at) into v_n, v_confirmed
  from race_entries where race_id = r.id and status = 'accepted';
  if v_confirmed * 2 <= v_n then
    return; -- pas encore la majorité
  end if;

  -- Verrouille les profils des participants dans un ordre stable.
  perform 1 from profiles p join race_entries re on re.pilot_id = p.id
   where re.race_id = r.id and re.status = 'accepted' order by p.id for update of p;

  drop table if exists race_snapshot;
  create temp table race_snapshot on commit drop as
    select re.pilot_id, re.position, p.elo,
           case when p.matches_played + p.race_count < 10 then 40 when p.elo >= 1850 then 16 else 24 end as k
    from race_entries re join profiles p on p.id = re.pilot_id
    where re.race_id = r.id and re.status = 'accepted';

  for e in select * from race_snapshot loop
    v_sum := 0;
    for o in select * from race_snapshot where pilot_id <> e.pilot_id loop
      v_sum := v_sum
        + (case when e.position < o.position then 1 when e.position = o.position then 0.5 else 0 end)
        - 1 / (1 + power(10, (o.elo - e.elo) / 400.0));
    end loop;
    v_k := e.k;
    insert into elo_history (race_id, profile_id, elo_before, elo_after, k_factor)
    values (r.id, e.pilot_id, e.elo, e.elo + round(v_k * v_sum / (v_n - 1)), v_k);
  end loop;

  update profiles p
     set elo = h.elo_after,
         race_count = race_count + 1,
         race_wins = race_wins + (s.position = 1)::int,
         race_podiums = race_podiums + (s.position <= 3)::int
    from elo_history h join race_snapshot s on s.pilot_id = h.profile_id
   where h.race_id = r.id and p.id = h.profile_id;

  update races set status = 'confirmed', confirmed_at = now() where id = r.id;
end $$;

revoke execute on function
  public.is_race_member(uuid),
  public.create_race(uuid, uuid[], timestamptz, public.race_format, text),
  public.respond_race(uuid, boolean),
  public.cancel_race(uuid),
  public.submit_race_result(uuid, jsonb),
  public.dispute_race(uuid, text),
  public.confirm_race(uuid)
from public, anon;
grant execute on function
  public.is_race_member(uuid),
  public.create_race(uuid, uuid[], timestamptz, public.race_format, text),
  public.respond_race(uuid, boolean),
  public.cancel_race(uuid),
  public.submit_race_result(uuid, jsonb),
  public.dispute_race(uuid, text),
  public.confirm_race(uuid)
to authenticated;

alter publication supabase_realtime add table public.races, public.race_entries;
