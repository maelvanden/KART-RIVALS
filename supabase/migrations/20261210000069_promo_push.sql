-- Kart Rivals : annonces en notification et promos des kartings (accord explicite du pilote).
--   - profiles.promo_push : null tant que le pilote n'a pas répondu, puis son choix (Apple 4.5.4 et RGPD : les
--     notifications promotionnelles demandent un accord explicite, jamais activé par défaut). promo_push_at : date
--     du dernier choix (preuve du consentement).
--   - Annonces : push = 'important' (information de service, tous les pilotes visés) ou 'promo' (seulement ceux qui
--     ont accepté). Envoyée à la publication, ou à son heure si elle est programmée (pg_cron, toutes les 5 min).
--   - Agenda des kartings : un événement ou une promo publiée notifie les pilotes du circuit qui ont accepté.

alter table public.profiles
  add column if not exists promo_push boolean,
  add column if not exists promo_push_at timestamptz;
grant select (promo_push) on public.profiles to authenticated;

create or replace function public.set_promo_push(p_enabled boolean)
returns void
language sql security definer set search_path = public as $$
  update profiles set promo_push = p_enabled, promo_push_at = now() where id = auth.uid();
$$;
revoke execute on function public.set_promo_push(boolean) from public, anon;
grant execute on function public.set_promo_push(boolean) to authenticated;

-- ========== ANNONCES ==========
alter table public.announcements
  add column if not exists push text check (push in ('important', 'promo')),
  add column if not exists pushed_at timestamptz;

-- Envoie les annonces dont l'heure est venue et qui ne sont pas encore parties, au public de chacune.
create or replace function public.push_due_announcements()
returns void
language plpgsql security definer set search_path = public as $$
declare
  a announcements;
begin
  for a in
    select * from announcements
     where push is not null and pushed_at is null and archived_at is null and starts_at <= now() and ends_at > now()
     for update skip locked
  loop
    update announcements set pushed_at = now() where id = a.id;
    perform send_push(
      array(
        select p.id from profiles p
         where p.banned_at is null and not p.is_demo
           and (a.push = 'important' or p.promo_push is true)
           and (a.region is null or p.id in (select pa.profile_id from pilot_areas() pa where pa.region = a.region))
           and (a.track_id is null or public.is_track_pilot(a.track_id, p.id))),
      (case a.push when 'promo' then '🏷️ ' else '📣 ' end) || a.title,
      a.body,
      '/');
  end loop;
end $$;
revoke execute on function public.push_due_announcements() from public, anon, authenticated;

select cron.schedule('push-due-announcements', '*/5 * * * *', 'select public.push_due_announcements()');

drop function if exists public.admin_publish_announcement(text, text, text, int, text, uuid, timestamptz);
create function public.admin_publish_announcement(p_title text, p_body text, p_link text default null,
                                                  p_days int default 7, p_region text default null,
                                                  p_track_id uuid default null, p_starts_at timestamptz default null,
                                                  p_push text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_region text := nullif(btrim(p_region), '');
  v_start timestamptz := greatest(coalesce(p_starts_at, now()), now());
  v_push text := nullif(btrim(p_push), '');
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
  if v_push is not null and v_push not in ('important', 'promo') then
    raise exception 'Invalid push kind';
  end if;
  insert into announcements (title, body, link_url, starts_at, ends_at, region, track_id, push)
  values (btrim(p_title), btrim(p_body), nullif(btrim(p_link), ''), v_start, v_start + make_interval(days => p_days),
          v_region, p_track_id, v_push)
  returning id into v_id;
  insert into admin_actions (action, track_id, details)
  values ('announcement', p_track_id,
          jsonb_strip_nulls(jsonb_build_object('title', btrim(p_title), 'region', v_region, 'push', v_push,
                                               'starts_at', case when v_start > now() then v_start end)));
  -- Publiée tout de suite : la notification part sans attendre le planificateur.
  perform public.push_due_announcements();
  return v_id;
end $$;
revoke execute on function public.admin_publish_announcement(text, text, text, int, text, uuid, timestamptz, text) from public, anon;
grant execute on function public.admin_publish_announcement(text, text, text, int, text, uuid, timestamptz, text) to authenticated;

-- Pilotes qui recevraient une annonce promo (accord donné) : affiché avant de publier.
create or replace function public.admin_promo_push_audience()
returns int language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return (select count(*)::int from profiles where promo_push is true and banned_at is null and not is_demo);
end $$;
revoke execute on function public.admin_promo_push_audience() from public, anon;
grant execute on function public.admin_promo_push_audience() to authenticated;

-- ========== AGENDA DES KARTINGS ==========
create or replace function public.push_on_track_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Seulement ce qui est encore à venir ou en cours.
  if coalesce(new.ends_at, new.starts_at, now()) < now() then
    return new;
  end if;
  perform send_push(
    array(select p.id from profiles p
           where p.promo_push is true and p.banned_at is null and not p.is_demo
             and public.is_track_pilot(new.track_id, p.id)),
    (case new.kind when 'promo' then '🏷️ Promo · ' else '📅 ' end) || track_name(new.track_id),
    new.title,
    '/event/' || new.id);
  return new;
end $$;
revoke execute on function public.push_on_track_event() from public, anon, authenticated;
drop trigger if exists track_events_push on public.track_events;
create trigger track_events_push after insert on public.track_events
  for each row execute function public.push_on_track_event();
