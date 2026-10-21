-- Kart Rivals : remontées des pilotes sur les fiches circuit et suivi des kartings officiels.
--   - « Signaler une erreur sur cette fiche » : horaires, circuit fermé, position, contact, infos piste, autre.
--     Position proposée possible (GPS sur place ou coordonnées collées). 5 remontées par jour et par pilote.
--   - Les admins appli (et les admins du karting concerné) traitent : appliquer la position, marquer corrigé
--     (+20 points pour le pilote, merci !) ou rejeter.
--   - Suivi des kartings officiels : admins, dernière mise à jour de la fiche, événements, promos et codes affichés.

alter type public.point_reason add value if not exists 'contribution';

-- Dernière modification de la fiche par ses gestionnaires.
alter table public.tracks
  add column if not exists page_updated_at timestamptz,
  add column if not exists page_updated_by uuid references public.profiles (id) on delete set null;

create table public.track_corrections (
  id            uuid primary key default gen_random_uuid(),
  track_id      uuid not null references public.tracks (id) on delete cascade,
  author_id     uuid references public.profiles (id) on delete set null default auth.uid(),
  kind          text not null check (kind in ('hours', 'closed', 'position', 'contact', 'info', 'other')),
  message       text check (char_length(message) <= 500),
  suggested_lat double precision check (suggested_lat between -90 and 90),
  suggested_lng double precision check (suggested_lng between -180 and 180),
  status        text not null default 'open' check (status in ('open', 'applied', 'dismissed')),
  handled_by    uuid references public.profiles (id) on delete set null,
  handled_at    timestamptz,
  created_at    timestamptz not null default now(),
  check ((suggested_lat is null) = (suggested_lng is null)),
  check (message is not null or suggested_lat is not null or kind = 'closed')
);
create index track_corrections_status_idx on public.track_corrections (status, created_at desc);
create index track_corrections_track_idx on public.track_corrections (track_id);
alter table public.track_corrections enable row level security;
revoke all on public.track_corrections from anon, authenticated;

create trigger track_corrections_reject_restricted before insert on public.track_corrections
  for each row execute function public.reject_restricted();

create or replace function public.submit_track_correction(p_track_id uuid, p_kind text, p_message text default null,
                                                          p_lat double precision default null,
                                                          p_lng double precision default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from tracks where id = p_track_id) then
    raise exception 'Track not found';
  end if;
  if (select count(*) from track_corrections where author_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Too many corrections today';
  end if;
  if exists (select 1 from track_corrections where author_id = auth.uid() and track_id = p_track_id and kind = p_kind
                                               and status = 'open') then
    raise exception 'Correction already sent';
  end if;
  insert into track_corrections (track_id, kind, message, suggested_lat, suggested_lng)
  values (p_track_id, p_kind, nullif(btrim(p_message), ''), p_lat, p_lng)
  returning id into v_id;
  return v_id;
end $$;

-- Remontées visibles par les admins appli (toutes) et les admins karting (leurs circuits).
create or replace function public.admin_track_corrections(p_status text default 'open')
returns table (id uuid, track_id uuid, track_name text, track_city text, kind text, message text,
               suggested_lat double precision, suggested_lng double precision, current_lat double precision,
               current_lng double precision, status text, created_at timestamptz, author_id uuid, author text,
               handled_by text, handled_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.is_app_admin() and not exists (select 1 from track_admins where profile_id = auth.uid()) then
    raise exception 'Admins only';
  end if;
  return query
    select c.id, c.track_id, t.name, t.city, c.kind, c.message, c.suggested_lat, c.suggested_lng,
           st_y(t.location::geometry), st_x(t.location::geometry), c.status, c.created_at, c.author_id,
           a.username, h.username, c.handled_at
      from track_corrections c
      join tracks t on t.id = c.track_id
      left join profiles a on a.id = c.author_id
      left join profiles h on h.id = c.handled_by
     where (case when p_status = 'open' then c.status = 'open' else c.status <> 'open' end)
       and (public.is_app_admin() or public.is_track_manager(c.track_id))
     order by c.created_at desc
     limit 100;
end $$;

-- applied : corrigé (+20 points à l'auteur ; p_apply_position = place le circuit sur la position proposée),
-- dismissed : rejeté.
create or replace function public.resolve_track_correction(p_id uuid, p_status text, p_apply_position boolean default false)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  c track_corrections%rowtype;
begin
  select * into c from track_corrections where id = p_id for update;
  if c.id is null then
    raise exception 'Correction not found';
  end if;
  if not public.is_track_manager(c.track_id) then
    raise exception 'Admins only';
  end if;
  if c.status <> 'open' then
    raise exception 'Correction already handled';
  end if;
  if p_status not in ('applied', 'dismissed') then
    raise exception 'Unknown decision';
  end if;

  if p_status = 'applied' and p_apply_position then
    if c.suggested_lat is null then
      raise exception 'No position suggested';
    end if;
    update tracks set location = st_setsrid(st_makepoint(c.suggested_lng, c.suggested_lat), 4326)::geography,
                      location_approx = false, page_updated_at = now(), page_updated_by = auth.uid()
     where id = c.track_id;
  end if;

  update track_corrections set status = p_status, handled_by = auth.uid(), handled_at = now() where id = c.id;
  if p_status = 'applied' and c.author_id is not null and c.author_id <> auth.uid() then
    insert into point_transactions (profile_id, amount, reason) values (c.author_id, 20, 'contribution');
  end if;
  insert into admin_actions (action, profile_id, track_id, details)
  values ('track_correction', c.author_id, c.track_id,
          jsonb_build_object('decision', p_status, 'kind', c.kind, 'position', p_apply_position));
end $$;

-- Gestionnaires : la fiche retient la date de sa dernière modification.
create or replace function public.stamp_track_page()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.is_track_manager(new.id)
     and (new.name, new.address, new.postal_code, new.city, new.length_m, new.kart_power, new.is_indoor, new.description,
          new.booking_url, new.website, new.phone, new.instagram_url, new.facebook_url, new.tiktok_url, new.youtube_url,
          new.layout_url, new.cover_url, new.location::text)
         is distinct from
         (old.name, old.address, old.postal_code, old.city, old.length_m, old.kart_power, old.is_indoor, old.description,
          old.booking_url, old.website, old.phone, old.instagram_url, old.facebook_url, old.tiktok_url, old.youtube_url,
          old.layout_url, old.cover_url, old.location::text) then
    new.page_updated_at := now();
    new.page_updated_by := auth.uid();
  end if;
  return new;
end $$;
create trigger tracks_stamp_page before update on public.tracks
  for each row execute function public.stamp_track_page();
revoke execute on function public.stamp_track_page() from public, anon, authenticated;

-- ========== SUIVI DES KARTINGS OFFICIELS ==========
create or replace function public.admin_official_tracks()
returns table (id uuid, name text, city text, postal_code text, admins text[], admins_since timestamptz,
               page_updated_at timestamptz, page_updated_by text, last_event_at timestamptz, events_total int,
               events_upcoming int, promos_active int, promo_reveals int, interests int, photos int,
               corrections_open int, last_activity timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return query
    select t.id, t.name, t.city, t.postal_code,
           (select array_agg(p.username order by ta.created_at) from track_admins ta join profiles p on p.id = ta.profile_id
             where ta.track_id = t.id),
           (select min(ta.created_at) from track_admins ta where ta.track_id = t.id),
           t.page_updated_at, u.username,
           (select max(e.created_at) from track_events e where e.track_id = t.id),
           (select count(*)::int from track_events e where e.track_id = t.id),
           (select count(*)::int from track_events e where e.track_id = t.id and e.kind = 'event'
                                                    and coalesce(e.ends_at, e.starts_at) > now()),
           (select count(*)::int from track_events e where e.track_id = t.id and e.kind = 'promo' and e.ends_at > now()),
           (select count(*)::int from promo_reveals r join track_events e on e.id = r.event_id where e.track_id = t.id),
           (select count(*)::int from event_interests i join track_events e on e.id = i.event_id where e.track_id = t.id),
           (select count(*)::int from track_photos ph where ph.track_id = t.id and ph.hidden_at is null),
           (select count(*)::int from track_corrections c where c.track_id = t.id and c.status = 'open'),
           greatest(t.page_updated_at, (select max(e.created_at) from track_events e where e.track_id = t.id))
      from tracks t
      left join profiles u on u.id = t.page_updated_by
     where t.is_official
     order by t.name;
end $$;

revoke execute on function public.submit_track_correction(uuid, text, text, double precision, double precision),
  public.admin_track_corrections(text), public.resolve_track_correction(uuid, text, boolean),
  public.admin_official_tracks() from public, anon;
grant execute on function public.submit_track_correction(uuid, text, text, double precision, double precision),
  public.admin_track_corrections(text), public.resolve_track_correction(uuid, text, boolean),
  public.admin_official_tracks() to authenticated;
