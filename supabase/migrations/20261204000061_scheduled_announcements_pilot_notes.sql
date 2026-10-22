-- Kart Rivals : annonces programmées et ciblées par circuit, notes internes sur les pilotes.
--   - Une annonce peut démarrer plus tard (starts_at) : préparée lundi, affichée vendredi 18 h.
--   - Ciblage par circuit : pilotes dont c'est le circuit favori, ou qui y ont roulé (défi, Time Attack) ces 90 jours.
--     Une annonce vise toute la France, une région ou un circuit, jamais deux à la fois.
--   - Notes internes : remarques des admins appli sur un pilote (« Déjà prévenu oralement »), jamais visibles du pilote.

-- ========== ANNONCES ==========
alter table public.announcements
  add column starts_at timestamptz,
  add column track_id  uuid references public.tracks (id) on delete cascade;
update public.announcements set starts_at = created_at;
alter table public.announcements
  alter column starts_at set default now(),
  alter column starts_at set not null,
  add constraint announcements_one_target check (region is null or track_id is null),
  add constraint announcements_starts_before_end check (starts_at < ends_at);

-- Le pilote fait partie du public d'un circuit : circuit favori, ou défi / Time Attack sur ce circuit depuis 90 jours.
create or replace function public.is_track_pilot(p_track uuid, p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_profile and home_track_id = p_track)
      or exists (select 1 from challenges
                  where track_id = p_track and p_profile in (challenger_id, opponent_id)
                    and created_at > now() - interval '90 days')
      or exists (select 1 from time_attack_sessions
                  where track_id = p_track and pilot_id = p_profile and check_in_at > now() - interval '90 days');
$$;
revoke execute on function public.is_track_pilot(uuid, uuid) from public, anon, authenticated;

-- Version limitée au pilote connecté, utilisable dans la règle d'accès aux annonces.
create or replace function public.is_my_track(p_track uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_track_pilot(p_track, auth.uid());
$$;
revoke execute on function public.is_my_track(uuid) from public, anon;
grant execute on function public.is_my_track(uuid) to authenticated;

drop policy "live announcements of my region, all for admins" on public.announcements;
create policy "live announcements for me, all for admins" on public.announcements for select to authenticated
  using ((archived_at is null and starts_at <= now() and ends_at > now()
          and (region is null or region = public.my_region())
          and (track_id is null or public.is_my_track(track_id)))
         or public.is_app_admin());

drop function if exists public.admin_publish_announcement(text, text, text, int, text);
create function public.admin_publish_announcement(p_title text, p_body text, p_link text default null,
                                                  p_days int default 7, p_region text default null,
                                                  p_track_id uuid default null, p_starts_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_region text := nullif(btrim(p_region), '');
  v_start timestamptz := greatest(coalesce(p_starts_at, now()), now());
begin
  perform public.require_app_admin();
  if p_days is null or p_days not between 1 and 60 then
    raise exception 'Invalid duration';
  end if;
  if v_start > now() + interval '60 days' then
    raise exception 'Schedule within the next 60 days';
  end if;
  if v_region is not null and p_track_id is not null then
    raise exception 'Pick a region or a track, not both';
  end if;
  if p_track_id is not null and not exists (select 1 from tracks where id = p_track_id) then
    raise exception 'Track not found';
  end if;
  insert into announcements (title, body, link_url, starts_at, ends_at, region, track_id)
  values (btrim(p_title), btrim(p_body), nullif(btrim(p_link), ''), v_start, v_start + make_interval(days => p_days),
          v_region, p_track_id)
  returning id into v_id;
  insert into admin_actions (action, track_id, details)
  values ('announcement', p_track_id,
          jsonb_strip_nulls(jsonb_build_object('title', btrim(p_title), 'region', v_region,
                                               'starts_at', case when v_start > now() then v_start end)));
  return v_id;
end $$;

-- Nombre de pilotes (non bannis) touchés par une annonce sur ce circuit.
create or replace function public.admin_track_audience(p_track uuid)
returns int language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return (select count(*)::int from profiles p
           where p.banned_at is null and public.is_track_pilot(p_track, p.id));
end $$;

revoke execute on function public.admin_publish_announcement(text, text, text, int, text, uuid, timestamptz),
  public.admin_track_audience(uuid) from public, anon;
grant execute on function public.admin_publish_announcement(text, text, text, int, text, uuid, timestamptz),
  public.admin_track_audience(uuid) to authenticated;

-- ========== NOTES INTERNES ==========
create table public.pilot_notes (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  body       text not null check (char_length(btrim(body)) between 2 and 500),
  created_at timestamptz not null default clock_timestamp()
);
create index pilot_notes_profile_idx on public.pilot_notes (profile_id, created_at desc);
-- Aucun accès direct : seulement par les fonctions réservées aux admins appli.
alter table public.pilot_notes enable row level security;
revoke all on public.pilot_notes from anon, authenticated;

create or replace function public.admin_pilot_notes(p_profile uuid)
returns table (id uuid, body text, created_at timestamptz, author text, mine boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return query
    select n.id, n.body, n.created_at, a.username, n.author_id = auth.uid()
      from pilot_notes n left join profiles a on a.id = n.author_id
     where n.profile_id = p_profile
     order by n.created_at desc;
end $$;

create or replace function public.admin_add_pilot_note(p_profile uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform public.require_app_admin();
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception 'Pilot not found';
  end if;
  insert into pilot_notes (profile_id, body) values (p_profile, btrim(p_body)) returning id into v_id;
  return v_id;
end $$;

-- Chaque admin supprime ses propres notes.
create or replace function public.admin_delete_pilot_note(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  delete from pilot_notes where id = p_id and author_id = auth.uid();
  if not found then
    raise exception 'Note not found';
  end if;
end $$;

revoke execute on function public.admin_pilot_notes(uuid), public.admin_add_pilot_note(uuid, text),
  public.admin_delete_pilot_note(uuid) from public, anon;
grant execute on function public.admin_pilot_notes(uuid), public.admin_add_pilot_note(uuid, text),
  public.admin_delete_pilot_note(uuid) to authenticated;
