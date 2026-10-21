-- Kart Rivals : panel d'administration complet (admins appli).
--   - Tableau de bord : chiffres clés, inscriptions des 8 dernières semaines, circuits les plus actifs.
--   - Pilotes : recherche, fiche admin, suspension temporaire, bannissement, retrait du badge vérifié, correction d'ELO.
--     Un pilote suspendu ou banni ne peut plus rien publier ni lancer (déclencheurs) ; banni, il disparaît des listes.
--   - Circuits : création depuis l'appli, masquage, fusion de doublons, liste des fiches à vérifier
--     (positions approximatives, infos manquantes).
--   - Annonces : message officiel affiché dans l'appli (accueil et Actu) jusqu'à sa date de fin.
--   - Journal : chaque action admin est tracée.

-- ========== JOURNAL DES ACTIONS ==========
create table public.admin_actions (
  id         bigint generated always as identity primary key,
  admin_id   uuid references public.profiles (id) on delete set null default auth.uid(),
  action     text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  track_id   uuid references public.tracks (id) on delete set null,
  details    jsonb,
  created_at timestamptz not null default now()
);
create index admin_actions_profile_idx on public.admin_actions (profile_id, created_at desc);
alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;

create or replace function public.require_app_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then
    raise exception 'Only app admins can do this';
  end if;
end $$;
revoke execute on function public.require_app_admin() from public, anon, authenticated;

-- ========== PILOTES : MODÉRATION ==========
alter table public.profiles
  add column if not exists suspended_until   timestamptz,
  add column if not exists banned_at         timestamptz,
  add column if not exists moderation_reason text check (char_length(moderation_reason) <= 300),
  add column if not exists verified_revoked  boolean not null default false;
-- Seule la date de bannissement est lisible (pour écarter les bannis des listes) ; le motif reste privé.
grant select (banned_at) on public.profiles to authenticated;

create or replace function public.is_restricted(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_profile and (banned_at is not null or suspended_until > now()));
$$;
revoke execute on function public.is_restricted(uuid) from public, anon;
grant execute on function public.is_restricted(uuid) to authenticated;

-- Statut du compte connecté (écran « Compte suspendu »).
create or replace function public.my_account_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'suspended_until', case when suspended_until > now() then suspended_until end,
    'banned_at', banned_at,
    'reason', case when banned_at is not null or suspended_until > now() then moderation_reason end)
  from profiles where id = auth.uid();
$$;
revoke execute on function public.my_account_status() from public, anon;
grant execute on function public.my_account_status() to authenticated;

-- Un compte suspendu ou banni ne crée plus rien (défis, courses, messages, publications…).
create or replace function public.reject_restricted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.is_restricted(auth.uid()) then
    raise exception 'Account suspended';
  end if;
  return new;
end $$;
revoke execute on function public.reject_restricted() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['challenges', 'races', 'time_attack_sessions', 'messages', 'feed_posts', 'post_comments',
                           'post_reactions', 'track_reviews', 'track_photos', 'open_sessions', 'session_participants',
                           'friendships', 'team_invites', 'team_applications', 'teams']
  loop
    execute format('create trigger %I before insert on public.%I for each row execute function public.reject_restricted()',
                   t || '_reject_restricted', t);
  end loop;
end $$;

-- Badge « pilote vérifié » : retirable par un admin (triche avérée…).
create or replace function public.verified_pilots()
returns table (profile_id uuid, validated_sessions int, verified_since timestamptz)
language sql stable security definer set search_path = public as $$
  select s.pilot_id, count(*)::int, min(coalesce(s.validated_at, s.check_in_at))
    from time_attack_sessions s
    join profiles p on p.id = s.pilot_id and not p.verified_revoked
   where s.status = 'validated'
   group by s.pilot_id;
$$;

-- Recherche de pilotes (pseudo), avec filtres : all, reported (signalements ouverts), restricted, recent (7 jours).
create or replace function public.admin_search_pilots(p_query text default null, p_filter text default 'all')
returns table (id uuid, username text, avatar_url text, elo int, rank public.rank_tier, created_at timestamptz,
               suspended_until timestamptz, banned_at timestamptz, open_reports int, total_reports int, is_admin boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return query
    select p.id, p.username, p.avatar_url, p.elo, p.rank, p.created_at,
           case when p.suspended_until > now() then p.suspended_until end, p.banned_at,
           (select count(*)::int from reports r where r.target_profile_id = p.id and r.status = 'open'),
           (select count(*)::int from reports r where r.target_profile_id = p.id),
           exists (select 1 from app_admins a where a.profile_id = p.id)
      from profiles p
     where (coalesce(btrim(p_query), '') = '' or p.username ilike '%' || btrim(p_query) || '%')
       and case p_filter
             when 'reported' then exists (select 1 from reports r where r.target_profile_id = p.id and r.status = 'open')
             when 'restricted' then p.banned_at is not null or p.suspended_until > now()
             when 'recent' then p.created_at > now() - interval '7 days'
             else true
           end
     order by
       case when p_filter = 'reported'
            then (select count(*) from reports r where r.target_profile_id = p.id and r.status = 'open') end desc nulls last,
       case when p_filter = 'recent' then p.created_at end desc nulls last,
       p.username
     limit 60;
end $$;

-- Fiche admin d'un pilote : compte, activité, signalements reçus, actions passées.
create or replace function public.admin_pilot_detail(p_profile uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p profiles%rowtype;
begin
  perform public.require_app_admin();
  select * into p from profiles where id = p_profile;
  if p.id is null then
    raise exception 'Pilot not found';
  end if;
  return jsonb_build_object(
    'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url, 'elo', p.elo, 'rank', p.rank,
    'created_at', p.created_at, 'kart_number', p.kart_number,
    'home_track', (select name from tracks where id = p.home_track_id),
    'suspended_until', case when p.suspended_until > now() then p.suspended_until end,
    'banned_at', p.banned_at, 'moderation_reason', p.moderation_reason,
    'is_admin', exists (select 1 from app_admins where profile_id = p.id),
    'verified_revoked', p.verified_revoked,
    'validated_sessions', (select count(*)::int from time_attack_sessions where pilot_id = p.id and status = 'validated'),
    'matches', p.wins + p.losses + p.draws, 'wins', p.wins,
    'races', (select count(*)::int from race_entries where pilot_id = p.id and status = 'accepted'),
    'posts', (select count(*)::int from feed_posts where author_id = p.id),
    'messages', (select count(*)::int from messages where sender_id = p.id),
    'last_activity', (select max(x) from (
        select max(created_at) x from feed_posts where author_id = p.id
        union all select max(created_at) from messages where sender_id = p.id
        union all select max(created_at) from elo_history where profile_id = p.id
        union all select max(created_at) from challenges where challenger_id = p.id
        union all select max(check_in_at) from time_attack_sessions where pilot_id = p.id) a),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'details', r.details, 'status', r.status,
                                          'created_at', r.created_at, 'reporter', rp.username) order by r.created_at desc)
        from (select * from reports where target_profile_id = p.id order by created_at desc limit 15) r
        left join profiles rp on rp.id = r.reporter_id), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('action', a.action, 'details', a.details, 'created_at', a.created_at,
                                          'admin', ap.username) order by a.created_at desc)
        from (select * from admin_actions where profile_id = p.id order by created_at desc limit 15) a
        left join profiles ap on ap.id = a.admin_id), '[]'::jsonb));
end $$;

-- Actions : suspend (p_days), unsuspend, ban, unban, revoke_verified, restore_verified.
create or replace function public.admin_moderate_pilot(p_profile uuid, p_action text, p_days int default null,
                                                       p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
begin
  perform public.require_app_admin();
  if p_action in ('suspend', 'ban') then
    if p_profile = auth.uid() then
      raise exception 'You cannot sanction yourself';
    end if;
    if exists (select 1 from app_admins where profile_id = p_profile) then
      raise exception 'Remove the admin role before sanctioning this pilot';
    end if;
  end if;

  case p_action
    when 'suspend' then
      if p_days is null or p_days not between 1 and 365 then
        raise exception 'Invalid suspension length';
      end if;
      update profiles set suspended_until = now() + make_interval(days => p_days), moderation_reason = v_reason
       where id = p_profile;
    when 'unsuspend' then
      update profiles set suspended_until = null,
                          moderation_reason = case when banned_at is null then null else moderation_reason end
       where id = p_profile;
    when 'ban' then
      update profiles set banned_at = now(), moderation_reason = v_reason, is_discoverable = false where id = p_profile;
    when 'unban' then
      update profiles set banned_at = null, suspended_until = null, moderation_reason = null where id = p_profile;
    when 'revoke_verified' then
      update profiles set verified_revoked = true where id = p_profile;
    when 'restore_verified' then
      update profiles set verified_revoked = false where id = p_profile;
    else
      raise exception 'Unknown action';
  end case;

  insert into admin_actions (action, profile_id, details)
  values (p_action, p_profile, jsonb_strip_nulls(jsonb_build_object('days', p_days, 'reason', v_reason)));
end $$;

-- Correction d'ELO (erreur de saisie, triche) : tracée dans le journal.
create or replace function public.admin_set_elo(p_profile uuid, p_elo int, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before int;
begin
  perform public.require_app_admin();
  if p_elo not between 0 and 4000 then
    raise exception 'Invalid ELO';
  end if;
  select elo into v_before from profiles where id = p_profile for update;
  if v_before is null then
    raise exception 'Pilot not found';
  end if;
  update profiles set elo = p_elo where id = p_profile;
  insert into admin_actions (action, profile_id, details)
  values ('set_elo', p_profile, jsonb_strip_nulls(jsonb_build_object('before', v_before, 'after', p_elo,
                                                                     'reason', nullif(btrim(p_reason), ''))));
end $$;

-- ========== CIRCUITS ==========
alter table public.tracks
  add column if not exists hidden_at       timestamptz,
  add column if not exists location_approx boolean not null default false;

-- Positions placées approximativement lors des imports (pas de GPS dans les recensements).
update public.tracks set location_approx = true
 where (name, city) in (('Kids Racing Land', 'La Mézière'), ('SpeedPark Rennes', 'Cesson-Sévigné'),
                        ('Brest Karting Électrique', 'Brest'), ('Défis Parc', 'Gauchy'), ('Loisi Sambre', 'Maubeuge'),
                        ('SpeedPark Beauvais', 'Beauvais'), ('SpeedPark Jaux', 'Jaux'),
                        ('SpeedPark Hénin-Beaumont', 'Hénin-Beaumont'), ('DB Karting', 'Saint-Lyé'),
                        ('Games Factory Reims', 'Reims'), ('SpeedPark Strasbourg', 'Reichstett'),
                        ('SpeedPark Cagnes-sur-Mer', 'Cagnes-sur-Mer'), ('Karrousel', 'Le Versoud'),
                        ('Weekart', 'Lantriac'));

-- Les circuits masqués disparaissent de l'appli, sauf pour les admins appli.
create or replace view public.tracks_map with (security_invoker = true) as
  select id, name, address, postal_code, city, region, is_indoor, length_m, kart_power, is_verified,
         extensions.st_y(location::extensions.geometry) as lat,
         extensions.st_x(location::extensions.geometry) as lng,
         description, booking_url, website, phone, instagram_url, facebook_url, tiktok_url, youtube_url, layout_url,
         is_official, cover_url, hidden_at, location_approx
  from public.tracks
  where hidden_at is null or public.is_app_admin();

-- Fiche modifiée par ses gestionnaires ; une position corrigée n'est plus « approximative ».
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
    layout_url    = case when p_data ? 'layout_url' then nullif(btrim(p_data->>'layout_url'), '') else layout_url end,
    cover_url     = case when p_data ? 'cover_url' then nullif(btrim(p_data->>'cover_url'), '') else cover_url end
  where id = p_track_id;

  if p_data ? 'lat' and p_data ? 'lng' then
    v_lat := (p_data->>'lat')::double precision;
    v_lng := (p_data->>'lng')::double precision;
    if v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      raise exception 'Invalid coordinates';
    end if;
    update tracks set location = st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography, location_approx = false
     where id = p_track_id;
  end if;
end $$;

-- Liste admin de tous les circuits (masqués compris) avec ce qui manque sur la fiche.
create or replace function public.admin_tracks()
returns table (id uuid, name text, city text, postal_code text, region text, is_indoor boolean, is_official boolean,
               hidden boolean, location_approx boolean, has_contact boolean, has_length boolean,
               has_description boolean, has_cover boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return query
    select t.id, t.name, t.city, t.postal_code, t.region, t.is_indoor, t.is_official, t.hidden_at is not null,
           t.location_approx, (t.website is not null or t.phone is not null), t.length_m is not null,
           t.description is not null, t.cover_url is not null, t.created_at
      from tracks t
     order by t.name;
end $$;

-- Nouveau circuit créé par un admin depuis l'appli.
create or replace function public.admin_create_track(p_data jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_lat double precision := (p_data->>'lat')::double precision;
  v_lng double precision := (p_data->>'lng')::double precision;
begin
  perform public.require_app_admin();
  if coalesce(btrim(p_data->>'name'), '') = '' or coalesce(btrim(p_data->>'city'), '') = '' then
    raise exception 'Name and city are required';
  end if;
  if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'Invalid coordinates';
  end if;
  if exists (select 1 from tracks where lower(name) = lower(btrim(p_data->>'name')) and lower(city) = lower(btrim(p_data->>'city'))) then
    raise exception 'Track already exists';
  end if;

  insert into tracks (name, city, postal_code, address, region, is_indoor, length_m, kart_power, website, phone,
                      description, is_verified, location, created_by)
  values (btrim(p_data->>'name'), btrim(p_data->>'city'), nullif(btrim(p_data->>'postal_code'), ''),
          nullif(btrim(p_data->>'address'), ''), nullif(btrim(p_data->>'region'), ''),
          coalesce((p_data->>'is_indoor')::boolean, false), nullif(p_data->>'length_m', '')::int,
          nullif(btrim(p_data->>'kart_power'), ''), nullif(btrim(p_data->>'website'), ''),
          nullif(btrim(p_data->>'phone'), ''), nullif(btrim(p_data->>'description'), ''), true,
          st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography, auth.uid())
  returning id into v_id;

  insert into admin_actions (action, track_id, details) values ('create_track', v_id, jsonb_build_object('name', p_data->>'name'));
  return v_id;
end $$;

create or replace function public.admin_set_track_hidden(p_track_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  update tracks set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end where id = p_track_id;
  insert into admin_actions (action, track_id) values (case when p_hidden then 'hide_track' else 'show_track' end, p_track_id);
end $$;

-- Fusion d'un doublon (p_from) dans la fiche conservée (p_into) : tout l'historique est rattaché à p_into,
-- les infos manquantes de p_into sont complétées par celles de p_from, puis p_from est supprimé.
create or replace function public.admin_merge_tracks(p_from uuid, p_into uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_from tracks%rowtype;
begin
  perform public.require_app_admin();
  if p_from = p_into then
    raise exception 'Pick two different tracks';
  end if;
  select * into v_from from tracks where id = p_from;
  if v_from.id is null or not exists (select 1 from tracks where id = p_into) then
    raise exception 'Track not found';
  end if;

  update profiles set home_track_id = p_into where home_track_id = p_from;
  update challenges set track_id = p_into where track_id = p_from;
  update races set track_id = p_into where track_id = p_from;
  update time_attack_sessions set track_id = p_into where track_id = p_from;
  update track_photos set track_id = p_into where track_id = p_from;
  update track_events set track_id = p_into where track_id = p_from;
  update open_sessions set track_id = p_into where track_id = p_from;
  update feed_posts set track_id = p_into where track_id = p_from;
  -- Un seul avis par pilote et par circuit : on garde celui déjà posé sur la fiche conservée.
  update track_reviews r set track_id = p_into
   where r.track_id = p_from
     and not exists (select 1 from track_reviews k where k.track_id = p_into and k.author_id = r.author_id);
  insert into track_admins (track_id, profile_id)
  select p_into, profile_id from track_admins where track_id = p_from
  on conflict do nothing;

  update tracks t set
    address = coalesce(t.address, v_from.address), postal_code = coalesce(t.postal_code, v_from.postal_code),
    length_m = coalesce(t.length_m, v_from.length_m), kart_power = coalesce(t.kart_power, v_from.kart_power),
    description = coalesce(t.description, v_from.description), booking_url = coalesce(t.booking_url, v_from.booking_url),
    website = coalesce(t.website, v_from.website), phone = coalesce(t.phone, v_from.phone),
    instagram_url = coalesce(t.instagram_url, v_from.instagram_url), facebook_url = coalesce(t.facebook_url, v_from.facebook_url),
    tiktok_url = coalesce(t.tiktok_url, v_from.tiktok_url), youtube_url = coalesce(t.youtube_url, v_from.youtube_url),
    layout_url = coalesce(t.layout_url, v_from.layout_url), cover_url = coalesce(t.cover_url, v_from.cover_url)
   where t.id = p_into;

  delete from tracks where id = p_from;
  insert into admin_actions (action, track_id, details)
  values ('merge_track', p_into, jsonb_build_object('merged', v_from.name, 'merged_city', v_from.city));
end $$;

-- ========== ANNONCES ==========
create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 3 and 80),
  body        text not null check (char_length(btrim(body)) between 1 and 600),
  link_url    text check (link_url ~ '^https://'),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  ends_at     timestamptz not null,
  archived_at timestamptz
);
create index announcements_live_idx on public.announcements (ends_at desc) where archived_at is null;
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;
create policy "live announcements, all for admins" on public.announcements for select to authenticated
  using ((archived_at is null and ends_at > now()) or public.is_app_admin());

create or replace function public.admin_publish_announcement(p_title text, p_body text, p_link text default null,
                                                             p_days int default 7)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform public.require_app_admin();
  if p_days is null or p_days not between 1 and 60 then
    raise exception 'Invalid duration';
  end if;
  insert into announcements (title, body, link_url, ends_at)
  values (btrim(p_title), btrim(p_body), nullif(btrim(p_link), ''), now() + make_interval(days => p_days))
  returning id into v_id;
  insert into admin_actions (action, details) values ('announcement', jsonb_build_object('title', btrim(p_title)));
  return v_id;
end $$;

create or replace function public.admin_archive_announcement(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  update announcements set archived_at = now() where id = p_id and archived_at is null;
end $$;

-- ========== TABLEAU DE BORD ==========
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  w timestamptz := now() - interval '7 days';
  m timestamptz := now() - interval '30 days';
begin
  perform public.require_app_admin();
  return jsonb_build_object(
    'pilots_total', (select count(*) from profiles),
    'pilots_new_7d', (select count(*) from profiles where created_at > w),
    'pilots_new_30d', (select count(*) from profiles where created_at > m),
    'active_7d', (select count(distinct x) from (
        select profile_id x from elo_history where created_at > w
        union all select author_id from feed_posts where created_at > w
        union all select author_id from post_comments where created_at > w
        union all select sender_id from messages where created_at > w
        union all select pilot_id from time_attack_sessions where check_in_at > w
        union all select challenger_id from challenges where created_at > w
        union all select profile_id from session_participants where joined_at > w) a),
    'matches_7d', (select count(*) from matches where status = 'confirmed' and confirmed_at > w),
    'races_7d', (select count(*) from races where status = 'confirmed' and confirmed_at > w),
    'time_attacks_7d', (select count(*) from time_attack_sessions where status = 'validated' and validated_at > w),
    'posts_7d', (select count(*) from feed_posts where created_at > w),
    'sessions_7d', (select count(*) from open_sessions where created_at > w),
    'reviews_7d', (select count(*) from track_reviews where created_at > w),
    'reports_open', (select count(*) from reports where status = 'open'),
    'requests_pending', (select count(*) from track_admin_requests where status = 'pending'),
    'restricted', (select count(*) from profiles where banned_at is not null or suspended_until > now()),
    'tracks_total', (select count(*) from tracks where hidden_at is null),
    'tracks_official', (select count(*) from tracks where is_official and hidden_at is null),
    'tracks_hidden', (select count(*) from tracks where hidden_at is not null),
    'tracks_approx', (select count(*) from tracks where location_approx and hidden_at is null),
    'signups', (select coalesce(jsonb_agg(jsonb_build_object('week', wk, 'count', n) order by wk), '[]'::jsonb) from (
        select g.wk, (select count(*) from profiles p where p.created_at >= g.wk and p.created_at < g.wk + interval '7 days') n
          from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') g(wk)) s),
    'top_tracks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'city', t.city, 'count', a.n)
                                             order by a.n desc), '[]'::jsonb)
        from (select track_id, count(*) n from (
                select track_id from challenges where created_at > m
                union all select track_id from races where created_at > m
                union all select track_id from time_attack_sessions where check_in_at > m
                union all select track_id from open_sessions where created_at > m
                union all select track_id from feed_posts where created_at > m and track_id is not null) x
              group by track_id order by n desc limit 5) a
        join tracks t on t.id = a.track_id));
end $$;

-- Dernières actions admin (journal).
create or replace function public.admin_recent_actions(p_limit int default 30)
returns table (id bigint, action text, created_at timestamptz, admin text, pilot text, track text, details jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return query
    select a.id, a.action, a.created_at, ap.username, pp.username, t.name, a.details
      from admin_actions a
      left join profiles ap on ap.id = a.admin_id
      left join profiles pp on pp.id = a.profile_id
      left join tracks t on t.id = a.track_id
     order by a.created_at desc
     limit least(p_limit, 100);
end $$;

revoke execute on function public.admin_search_pilots(text, text), public.admin_pilot_detail(uuid),
  public.admin_moderate_pilot(uuid, text, int, text), public.admin_set_elo(uuid, int, text), public.admin_tracks(),
  public.admin_create_track(jsonb), public.admin_set_track_hidden(uuid, boolean), public.admin_merge_tracks(uuid, uuid),
  public.admin_publish_announcement(text, text, text, int), public.admin_archive_announcement(uuid),
  public.admin_stats(), public.admin_recent_actions(int) from public, anon;
grant execute on function public.admin_search_pilots(text, text), public.admin_pilot_detail(uuid),
  public.admin_moderate_pilot(uuid, text, int, text), public.admin_set_elo(uuid, int, text), public.admin_tracks(),
  public.admin_create_track(jsonb), public.admin_set_track_hidden(uuid, boolean), public.admin_merge_tracks(uuid, uuid),
  public.admin_publish_announcement(text, text, text, int), public.admin_archive_announcement(uuid),
  public.admin_stats(), public.admin_recent_actions(int) to authenticated;

-- ========== CLASSEMENTS SANS LES BANNIS ==========
create or replace view public.leaderboard_global with (security_invoker = true) as
  select id, username, avatar_url, home_track_id, elo, rank, wins, losses, draws, matches_played,
         rank() over (order by elo desc) as position
  from public.profiles
  where matches_played > 0 and banned_at is null;

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
    and p.location is not null
    and st_dwithin(p.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography,
                   least(greatest(radius_km, 1), 200) * 1000)
  order by p.elo desc
  limit 100;
$$;

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
  join profiles p on p.id = r.pilot_id and p.banned_at is null
  group by p.id
  order by count(*) filter (where r.won) desc, p.elo desc
  limit least(greatest(p_limit, 1), 100);
$$;
