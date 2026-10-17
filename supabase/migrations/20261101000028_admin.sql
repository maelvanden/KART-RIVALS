-- Kart Rivals : administration.
--   - Admin appli (app_admins) : gère toutes les fiches circuit, nomme les admins karting, traite les signalements
--     et les demandes de gestion, nomme d'autres admins appli. Le tout premier se déclare depuis l'app tant qu'aucun
--     admin n'existe (claim_app_admin).
--   - Admin karting (track_admins) : gère la fiche de son circuit (infos, liens, position, tracé) et modère ses photos.
--     Un exploitant le demande depuis la fiche (track_admin_requests), un admin appli valide.

-- ========== RÔLES ==========
create table public.app_admins (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create table public.track_admins (
  track_id   uuid not null references public.tracks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (track_id, profile_id)
);
create index track_admins_profile_idx on public.track_admins (profile_id);
alter table public.track_admins enable row level security;
revoke all on public.track_admins from anon, authenticated;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where profile_id = auth.uid());
$$;

create or replace function public.is_track_manager(p_track_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_app_admin()
      or exists (select 1 from track_admins where track_id = p_track_id and profile_id = auth.uid());
$$;

/** Rôles du pilote connecté : admin appli, circuits gérés, et si un admin appli existe déjà. */
create or replace function public.my_admin_roles()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'is_app_admin', public.is_app_admin(),
    'admin_exists', exists (select 1 from app_admins),
    'managed_track_ids', coalesce((select jsonb_agg(track_id) from track_admins where profile_id = auth.uid()), '[]'::jsonb)
  );
$$;

-- Le premier admin appli se déclare lui-même ; ensuite, seuls les admins appli en nomment d'autres.
create or replace function public.claim_app_admin()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('claim_app_admin'));
  if exists (select 1 from app_admins) then
    raise exception 'An app admin already exists';
  end if;
  insert into app_admins (profile_id, added_by) values (auth.uid(), auth.uid());
end $$;

create or replace function public.set_app_admin(p_profile_id uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then
    raise exception 'Admins only';
  end if;
  if p_admin then
    insert into app_admins (profile_id, added_by) values (p_profile_id, auth.uid()) on conflict do nothing;
  else
    if (select count(*) from app_admins) <= 1 then
      raise exception 'The last app admin cannot be removed';
    end if;
    delete from app_admins where profile_id = p_profile_id;
  end if;
end $$;

create or replace function public.list_app_admins()
returns table (id uuid, username text, avatar_url text, elo int, rank public.rank_tier, since timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then
    raise exception 'Admins only';
  end if;
  return query
    select p.id, p.username, p.avatar_url, p.elo, p.rank, a.created_at
      from app_admins a join profiles p on p.id = a.profile_id
     order by a.created_at;
end $$;

-- ========== ADMINS KARTING ==========
create or replace function public.list_track_admins(p_track_id uuid)
returns table (id uuid, username text, avatar_url text, elo int, rank public.rank_tier, since timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_track_manager(p_track_id) then
    raise exception 'Admins only';
  end if;
  return query
    select p.id, p.username, p.avatar_url, p.elo, p.rank, t.created_at
      from track_admins t join profiles p on p.id = t.profile_id
     where t.track_id = p_track_id
     order by t.created_at;
end $$;

create or replace function public.set_track_admin(p_track_id uuid, p_profile_id uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then
    raise exception 'Admins only';
  end if;
  if p_admin then
    insert into track_admins (track_id, profile_id, added_by) values (p_track_id, p_profile_id, auth.uid())
    on conflict do nothing;
    update track_admin_requests set status = 'approved', handled_by = auth.uid(), handled_at = now()
     where track_id = p_track_id and profile_id = p_profile_id and status = 'pending';
  else
    delete from track_admins where track_id = p_track_id and profile_id = p_profile_id;
  end if;
end $$;

-- ========== DEMANDES DE GESTION D'UNE FICHE ==========
create table public.track_admin_requests (
  id         uuid primary key default gen_random_uuid(),
  track_id   uuid not null references public.tracks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  message    text check (char_length(message) <= 500),
  status     text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index track_admin_requests_pending_key on public.track_admin_requests (track_id, profile_id)
  where status = 'pending';
alter table public.track_admin_requests enable row level security;
revoke all on public.track_admin_requests from anon, authenticated;
grant select on public.track_admin_requests to authenticated;
create policy "pilots see their requests, admins all" on public.track_admin_requests
  for select to authenticated using (profile_id = auth.uid() or public.is_app_admin());

create or replace function public.request_track_admin(p_track_id uuid, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from track_admins where track_id = p_track_id and profile_id = auth.uid()) then
    raise exception 'You already manage this track';
  end if;
  if exists (select 1 from track_admin_requests where track_id = p_track_id and profile_id = auth.uid() and status = 'pending') then
    raise exception 'Request already sent';
  end if;
  if (select count(*) from track_admin_requests where profile_id = auth.uid() and status = 'pending') >= 3 then
    raise exception 'Too many pending requests';
  end if;
  insert into track_admin_requests (track_id, profile_id, message) values (p_track_id, auth.uid(), nullif(btrim(p_message), ''));
end $$;

create or replace function public.admin_track_requests()
returns table (
  id uuid, track_id uuid, track_name text, track_city text, profile_id uuid, username text, avatar_url text,
  elo int, rank public.rank_tier, message text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then
    raise exception 'Admins only';
  end if;
  return query
    select r.id, t.id, t.name, t.city, p.id, p.username, p.avatar_url, p.elo, p.rank, r.message, r.created_at
      from track_admin_requests r
      join tracks t on t.id = r.track_id
      join profiles p on p.id = r.profile_id
     where r.status = 'pending'
     order by r.created_at;
end $$;

create or replace function public.respond_track_admin_request(p_request_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  r track_admin_requests;
begin
  if not public.is_app_admin() then
    raise exception 'Admins only';
  end if;
  select * into r from track_admin_requests where id = p_request_id and status = 'pending' for update;
  if r.id is null then
    raise exception 'No pending request';
  end if;
  update track_admin_requests
     set status = case when p_accept then 'approved' else 'declined' end, handled_by = auth.uid(), handled_at = now()
   where id = r.id;
  if p_accept then
    insert into track_admins (track_id, profile_id, added_by) values (r.track_id, r.profile_id, auth.uid())
    on conflict do nothing;
  end if;
end $$;

-- ========== ÉDITION D'UNE FICHE ==========
-- Champs modifiables : les clés absentes de p_data ne changent pas, une chaîne vide efface la valeur.
-- Les contraintes de la table (liens en https, longueurs) s'appliquent.
create or replace function public.update_track_page(p_track_id uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_lat double precision;
  v_lng double precision;
begin
  if not public.is_track_manager(p_track_id) then
    raise exception 'Only the track admins can edit this page';
  end if;

  update tracks set
    name          = case when p_data ? 'name' then coalesce(nullif(btrim(p_data->>'name'), ''), name) else name end,
    address       = case when p_data ? 'address' then nullif(btrim(p_data->>'address'), '') else address end,
    postal_code   = case when p_data ? 'postal_code' then nullif(btrim(p_data->>'postal_code'), '') else postal_code end,
    city          = case when p_data ? 'city' then coalesce(nullif(btrim(p_data->>'city'), ''), city) else city end,
    length_m      = case when p_data ? 'length_m' then nullif(p_data->>'length_m', '')::int else length_m end,
    kart_power    = case when p_data ? 'kart_power' then nullif(btrim(p_data->>'kart_power'), '') else kart_power end,
    is_indoor     = case when p_data ? 'is_indoor' then (p_data->>'is_indoor')::boolean else is_indoor end,
    description   = case when p_data ? 'description' then nullif(btrim(p_data->>'description'), '') else description end,
    booking_url   = case when p_data ? 'booking_url' then nullif(btrim(p_data->>'booking_url'), '') else booking_url end,
    website       = case when p_data ? 'website' then nullif(btrim(p_data->>'website'), '') else website end,
    phone         = case when p_data ? 'phone' then nullif(btrim(p_data->>'phone'), '') else phone end,
    instagram_url = case when p_data ? 'instagram_url' then nullif(btrim(p_data->>'instagram_url'), '') else instagram_url end,
    facebook_url  = case when p_data ? 'facebook_url' then nullif(btrim(p_data->>'facebook_url'), '') else facebook_url end,
    tiktok_url    = case when p_data ? 'tiktok_url' then nullif(btrim(p_data->>'tiktok_url'), '') else tiktok_url end,
    youtube_url   = case when p_data ? 'youtube_url' then nullif(btrim(p_data->>'youtube_url'), '') else youtube_url end,
    layout_url    = case when p_data ? 'layout_url' then nullif(btrim(p_data->>'layout_url'), '') else layout_url end
  where id = p_track_id;

  if p_data ? 'lat' and p_data ? 'lng' then
    v_lat := (p_data->>'lat')::double precision;
    v_lng := (p_data->>'lng')::double precision;
    if v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      raise exception 'Invalid coordinates';
    end if;
    update tracks set location = st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography where id = p_track_id;
  end if;
end $$;

-- Tracé envoyé depuis l'app : bucket public track-layouts, rangé sous <circuit>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('track-layouts', 'track-layouts', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "track managers upload layouts" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'track-layouts' and public.is_track_manager(((storage.foldername(name))[1])::uuid));
create policy "track managers delete layouts" on storage.objects
  for delete to authenticated
  using (bucket_id = 'track-layouts' and public.is_track_manager(((storage.foldername(name))[1])::uuid));

-- Les gestionnaires d'un circuit modèrent ses photos.
create policy "track managers delete track photos" on public.track_photos
  for delete to authenticated using (public.is_track_manager(track_id));
create policy "track managers delete track photo files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'track-photos' and public.is_track_manager(((storage.foldername(name))[1])::uuid));

-- ========== SIGNALEMENTS ==========
create or replace function public.admin_reports(p_status text default 'open')
returns table (
  id uuid, reason public.report_reason, details text, status text, created_at timestamptz,
  reporter_id uuid, reporter_username text,
  target_id uuid, target_username text, target_report_count int,
  message_id uuid, message_kind text, message_body text, message_hidden boolean,
  photo_id uuid, photo_path text, photo_hidden boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then
    raise exception 'Admins only';
  end if;
  return query
    select r.id, r.reason, r.details, r.status, r.created_at,
           r.reporter_id, rp.username,
           r.target_profile_id, tp.username,
           (select count(*)::int from reports x where x.target_profile_id = r.target_profile_id),
           m.id, m.kind::text, m.body, m.hidden_at is not null,
           ph.id, ph.path, ph.hidden_at is not null
      from reports r
      left join profiles rp on rp.id = r.reporter_id
      left join profiles tp on tp.id = r.target_profile_id
      left join messages m on m.id = r.message_id
      left join track_photos ph on ph.id = r.photo_id
     where r.status = p_status
     order by r.created_at desc
     limit 100;
end $$;

-- Clôt un signalement (reviewed = traité, dismissed = rejeté) et masque ou rétablit le contenu visé.
create or replace function public.resolve_report(p_report_id uuid, p_status text, p_hide boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r reports;
begin
  if not public.is_app_admin() then
    raise exception 'Admins only';
  end if;
  if p_status not in ('reviewed', 'dismissed') then
    raise exception 'Invalid status';
  end if;
  select * into r from reports where id = p_report_id;
  if r.id is null then
    raise exception 'Report not found';
  end if;
  update reports set status = p_status where id = r.id;
  if p_hide is not null and r.message_id is not null then
    update messages set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.message_id;
  end if;
  if p_hide is not null and r.photo_id is not null then
    update track_photos set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.photo_id;
  end if;
end $$;

-- ========== DROITS ==========
revoke execute on function
  public.is_app_admin(), public.is_track_manager(uuid), public.my_admin_roles(), public.claim_app_admin(),
  public.set_app_admin(uuid, boolean), public.list_app_admins(), public.list_track_admins(uuid),
  public.set_track_admin(uuid, uuid, boolean), public.request_track_admin(uuid, text), public.admin_track_requests(),
  public.respond_track_admin_request(uuid, boolean), public.update_track_page(uuid, jsonb),
  public.admin_reports(text), public.resolve_report(uuid, text, boolean)
from public, anon;
grant execute on function
  public.is_app_admin(), public.is_track_manager(uuid), public.my_admin_roles(), public.claim_app_admin(),
  public.set_app_admin(uuid, boolean), public.list_app_admins(), public.list_track_admins(uuid),
  public.set_track_admin(uuid, uuid, boolean), public.request_track_admin(uuid, text), public.admin_track_requests(),
  public.respond_track_admin_request(uuid, boolean), public.update_track_page(uuid, jsonb),
  public.admin_reports(text), public.resolve_report(uuid, text, boolean)
to authenticated;
