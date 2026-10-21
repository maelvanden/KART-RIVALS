-- Kart Rivals : annonces ciblées par région et escalade des sanctions.
--   - Fiche admin du pilote : liste complète de ses suspensions (suggestion de sanction après 3 avertissements).
-- Annonces ciblées par région (« Les Hauts-de-France sont arrivés » seulement pour les pilotes concernés).
--   - Région d'un pilote : celle de son circuit favori, sinon celle du circuit le plus proche de sa position approximative.
--   - Une annonce sans région reste nationale ; une annonce régionale n'est lue que par les pilotes de la région
--     (les admins appli voient tout).

-- Département (2 premiers chiffres du code postal) → région administrative.
create table public.department_regions (
  department text primary key,
  region     text not null
);
insert into public.department_regions (department, region)
select d, r from (values
  ('Auvergne-Rhône-Alpes', array['01','03','07','15','26','38','42','43','63','69','73','74']),
  ('Bourgogne-Franche-Comté', array['21','25','39','58','70','71','89','90']),
  ('Bretagne', array['22','29','35','56']),
  ('Centre-Val de Loire', array['18','28','36','37','41','45']),
  ('Corse', array['20']),
  ('Grand Est', array['08','10','51','52','54','55','57','67','68','88']),
  ('Hauts-de-France', array['02','59','60','62','80']),
  ('Île-de-France', array['75','77','78','91','92','93','94','95']),
  ('Normandie', array['14','27','50','61','76']),
  ('Nouvelle-Aquitaine', array['16','17','19','23','24','33','40','47','64','79','86','87']),
  ('Occitanie', array['09','11','12','30','31','32','34','46','48','65','66','81','82']),
  ('Pays de la Loire', array['44','49','53','72','85']),
  ('Provence-Alpes-Côte d’Azur', array['04','05','06','13','83','84'])
) v(r, ds), unnest(v.ds) d;
alter table public.department_regions enable row level security;
revoke all on public.department_regions from anon, authenticated;

-- Région d'un pilote (null si ni circuit favori ni position).
create or replace function public.pilot_region(p_profile uuid)
returns text language sql stable security definer set search_path = public, extensions as $$
  select dr.region
    from profiles p
    left join tracks ht on ht.id = p.home_track_id
    left join lateral (
      select t.postal_code from tracks t
       where ht.postal_code is null and p.location is not null and t.hidden_at is null and t.postal_code is not null
       order by t.location <-> p.location
       limit 1
    ) nt on true
    join department_regions dr on dr.department = left(coalesce(ht.postal_code, nt.postal_code), 2)
   where p.id = p_profile;
$$;
revoke execute on function public.pilot_region(uuid) from public, anon, authenticated;

create or replace function public.my_region()
returns text language sql stable security definer set search_path = public as $$
  select public.pilot_region(auth.uid());
$$;
revoke execute on function public.my_region() from public, anon;
grant execute on function public.my_region() to authenticated;

alter table public.announcements add column region text;
alter table public.announcements add constraint announcements_region_known
  check (region is null or region in ('Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté', 'Bretagne', 'Centre-Val de Loire',
                                      'Corse', 'Grand Est', 'Hauts-de-France', 'Île-de-France', 'Normandie',
                                      'Nouvelle-Aquitaine', 'Occitanie', 'Pays de la Loire', 'Provence-Alpes-Côte d’Azur'));

drop policy "live announcements, all for admins" on public.announcements;
create policy "live announcements of my region, all for admins" on public.announcements for select to authenticated
  using ((archived_at is null and ends_at > now() and (region is null or region = public.my_region()))
         or public.is_app_admin());

-- Publication : région facultative (null = toute la France).
drop function if exists public.admin_publish_announcement(text, text, text, int);
create function public.admin_publish_announcement(p_title text, p_body text, p_link text default null,
                                                  p_days int default 7, p_region text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_region text := nullif(btrim(p_region), '');
begin
  perform public.require_app_admin();
  if p_days is null or p_days not between 1 and 60 then
    raise exception 'Invalid duration';
  end if;
  insert into announcements (title, body, link_url, ends_at, region)
  values (btrim(p_title), btrim(p_body), nullif(btrim(p_link), ''), now() + make_interval(days => p_days), v_region)
  returning id into v_id;
  insert into admin_actions (action, details)
  values ('announcement', jsonb_strip_nulls(jsonb_build_object('title', btrim(p_title), 'region', v_region)));
  return v_id;
end $$;

-- Nombre de pilotes touchés par une annonce (toute la France si région nulle), par région.
create or replace function public.admin_announcement_audience()
returns table (region text, pilots int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return query
    select r.region, count(*)::int
      from (select public.pilot_region(p.id) as region from profiles p where p.banned_at is null) r
     group by r.region
     order by count(*) desc;
end $$;

revoke execute on function public.admin_publish_announcement(text, text, text, int, text),
  public.admin_announcement_audience() from public, anon;
grant execute on function public.admin_publish_announcement(text, text, text, int, text),
  public.admin_announcement_audience() to authenticated;

-- ========== FICHE PILOTE : historique des suspensions ==========
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
        left join profiles ap on ap.id = a.admin_id), '[]'::jsonb),
    'warnings', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'message', w.message, 'created_at', w.created_at,
                                          'acknowledged_at', w.acknowledged_at, 'admin', wp.username) order by w.created_at desc)
        from pilot_warnings w left join profiles wp on wp.id = w.admin_id
       where w.profile_id = p.id), '[]'::jsonb),
    -- Toutes les suspensions (le journal ci-dessus est limité aux 15 dernières actions) : escalade des sanctions.
    'suspensions', coalesce((
      select jsonb_agg(a.created_at order by a.created_at desc)
        from admin_actions a where a.profile_id = p.id and a.action = 'suspend'), '[]'::jsonb));
end $$;

