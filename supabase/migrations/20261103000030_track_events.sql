-- Kart Rivals : agenda et promos des kartings.
--   - Les admins karting publient des événements (endurance, Grand Prix, nocturne, course, autre) et des promos avec
--     un code réservé aux pilotes Kart Rivals.
--   - Les pilotes marquent « Ça m'intéresse » ; un code promo n'est livré que par reveal_promo, qui compte les
--     pilotes l'ayant affiché (statistique utile aux kartings).
--   - Les admins appli mettent un événement « à la une » (futur placement payant).

create table public.track_events (
  id               uuid primary key default gen_random_uuid(),
  track_id         uuid not null references public.tracks (id) on delete cascade,
  kind             text not null check (kind in ('event', 'promo')),
  category         text check (category in ('endurance', 'grand_prix', 'nocturne', 'course', 'autre')),
  title            text not null check (char_length(title) between 3 and 80),
  description      text check (char_length(description) <= 1000),
  starts_at        timestamptz,
  ends_at          timestamptz,
  price            text check (char_length(price) <= 40),
  booking_url      text check (booking_url ~ '^https://'),
  promo_code       text check (char_length(promo_code) <= 40),
  promo_conditions text check (char_length(promo_conditions) <= 300),
  featured         boolean not null default false,
  created_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  -- Un événement a une date ; une promo a un code et une date de fin.
  check (kind <> 'event' or (starts_at is not null and category is not null)),
  check (kind <> 'promo' or (promo_code is not null and ends_at is not null)),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create index track_events_track_idx on public.track_events (track_id, coalesce(starts_at, ends_at));
create index track_events_upcoming_idx on public.track_events (coalesce(ends_at, starts_at));

alter table public.track_events enable row level security;
revoke all on public.track_events from anon, authenticated;
-- Tout sauf le code promo, livré par reveal_promo (ou lisible par les gestionnaires via manage_track_events).
grant select (id, track_id, kind, category, title, description, starts_at, ends_at, price, booking_url,
              promo_conditions, featured, created_by, created_at)
  on public.track_events to authenticated;
create policy "events readable by pilots" on public.track_events for select to authenticated using (true);

create table public.event_interests (
  event_id   uuid not null references public.track_events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
alter table public.event_interests enable row level security;
revoke all on public.event_interests from anon, authenticated;
grant select on public.event_interests to authenticated;
create policy "interests readable by pilots" on public.event_interests for select to authenticated using (true);

create table public.promo_reveals (
  event_id   uuid not null references public.track_events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
alter table public.promo_reveals enable row level security;
revoke all on public.promo_reveals from anon, authenticated;

-- ========== PUBLICATION (admins du karting) ==========
-- p_id null = création. Champs : kind, category, title, description, starts_at, ends_at, price, booking_url,
-- promo_code, promo_conditions.
create or replace function public.save_track_event(p_track_id uuid, p_data jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_track uuid;
begin
  if p_id is not null then
    select track_id into v_track from track_events where id = p_id;
    if v_track is null then
      raise exception 'Event not found';
    end if;
  else
    v_track := p_track_id;
  end if;
  if not public.is_track_manager(v_track) then
    raise exception 'Only the track admins can publish events';
  end if;
  if p_id is null and (select count(*) from track_events where track_id = v_track
                        and coalesce(ends_at, starts_at) >= now()) >= 30 then
    raise exception 'Too many upcoming events';
  end if;

  if p_id is null then
    insert into track_events (track_id, kind, category, title, description, starts_at, ends_at, price, booking_url,
                              promo_code, promo_conditions)
    values (v_track, p_data->>'kind', nullif(p_data->>'category', ''), btrim(p_data->>'title'),
            nullif(btrim(p_data->>'description'), ''), nullif(p_data->>'starts_at', '')::timestamptz,
            nullif(p_data->>'ends_at', '')::timestamptz, nullif(btrim(p_data->>'price'), ''),
            nullif(btrim(p_data->>'booking_url'), ''), nullif(upper(btrim(p_data->>'promo_code')), ''),
            nullif(btrim(p_data->>'promo_conditions'), ''))
    returning id into v_id;
  else
    update track_events set
      kind = p_data->>'kind',
      category = nullif(p_data->>'category', ''),
      title = btrim(p_data->>'title'),
      description = nullif(btrim(p_data->>'description'), ''),
      starts_at = nullif(p_data->>'starts_at', '')::timestamptz,
      ends_at = nullif(p_data->>'ends_at', '')::timestamptz,
      price = nullif(btrim(p_data->>'price'), ''),
      booking_url = nullif(btrim(p_data->>'booking_url'), ''),
      promo_code = nullif(upper(btrim(p_data->>'promo_code')), ''),
      promo_conditions = nullif(btrim(p_data->>'promo_conditions'), '')
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.delete_track_event(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_track_manager((select track_id from track_events where id = p_id)) then
    raise exception 'Only the track admins can publish events';
  end if;
  delete from track_events where id = p_id;
end $$;

-- Pour les gestionnaires : leurs événements avec code promo et statistiques.
create or replace function public.manage_track_events(p_track_id uuid)
returns table (id uuid, promo_code text, interested int, reveals int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_track_manager(p_track_id) then
    raise exception 'Only the track admins can publish events';
  end if;
  return query
    select e.id, e.promo_code,
           (select count(*)::int from event_interests i where i.event_id = e.id),
           (select count(*)::int from promo_reveals r where r.event_id = e.id)
      from track_events e
     where e.track_id = p_track_id;
end $$;

-- Mise en avant (admins appli).
create or replace function public.set_event_featured(p_id uuid, p_featured boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then
    raise exception 'Admins only';
  end if;
  update track_events set featured = p_featured where id = p_id;
end $$;

-- ========== PILOTES ==========
create or replace function public.toggle_event_interest(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from track_events where id = p_id) then
    raise exception 'Event not found';
  end if;
  if exists (select 1 from event_interests where event_id = p_id and profile_id = auth.uid()) then
    delete from event_interests where event_id = p_id and profile_id = auth.uid();
    return false;
  end if;
  insert into event_interests (event_id, profile_id) values (p_id, auth.uid());
  return true;
end $$;

-- Livre le code d'une promo encore valable et compte le pilote.
create or replace function public.reveal_promo(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  e track_events;
begin
  select * into e from track_events where id = p_id and kind = 'promo';
  if e.id is null then
    raise exception 'Event not found';
  end if;
  if e.ends_at < now() then
    raise exception 'Promo expired';
  end if;
  insert into promo_reveals (event_id, profile_id) values (p_id, auth.uid()) on conflict do nothing;
  return e.promo_code;
end $$;

revoke execute on function
  public.save_track_event(uuid, jsonb, uuid), public.delete_track_event(uuid), public.manage_track_events(uuid),
  public.set_event_featured(uuid, boolean), public.toggle_event_interest(uuid), public.reveal_promo(uuid)
from public, anon;
grant execute on function
  public.save_track_event(uuid, jsonb, uuid), public.delete_track_event(uuid), public.manage_track_events(uuid),
  public.set_event_featured(uuid, boolean), public.toggle_event_interest(uuid), public.reveal_promo(uuid)
to authenticated;
