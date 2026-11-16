-- Kart Rivals : rôle « modérateur », entre le pilote et l'admin appli.
-- Un modérateur traite les signalements, modère l'Actu (publications, commentaires, photos, avis), répond au support,
-- consulte la fiche admin d'un pilote, lui envoie un avertissement et tient les notes internes. Il ne peut ni
-- suspendre ni bannir, ni toucher à l'ELO, aux points, aux résultats, aux circuits, aux tournois, aux écuries, aux
-- annonces ou aux réglages, ni nommer qui que ce soit.
--
-- Les modérateurs ont leur propre table : app_admins et is_app_admin() gardent exactement leur sens, donc tout ce
-- qui est réservé aux admins appli le reste sans rien modifier. Seules les fonctions listées plus bas passent du
-- contrôle « admin » au contrôle « équipe » (admin ou modérateur). Un modérateur suspendu ou banni perd ses droits.

create table public.app_moderators (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.app_moderators enable row level security;
revoke all on public.app_moderators from anon, authenticated;

create or replace function public.is_app_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_moderators where profile_id = auth.uid())
     and not public.is_restricted(auth.uid());
$$;

create or replace function public.is_app_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_app_admin() or public.is_app_moderator();
$$;

create or replace function public.require_app_staff()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_staff() then
    raise exception 'Only the Kart Rivals team can do this';
  end if;
end $$;

-- Toute l'équipe (admins et modérateurs), pour les notifications du support.
create or replace function public.app_staff_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select profile_id from app_admins
  union
  select profile_id from app_moderators;
$$;

revoke execute on function public.is_app_moderator(), public.is_app_staff() from public, anon;
grant execute on function public.is_app_moderator(), public.is_app_staff() to authenticated;
revoke execute on function public.require_app_staff(), public.app_staff_ids() from public, anon, authenticated;

-- Un pilote nommé admin appli n'est plus modérateur : un seul rôle à la fois.
create or replace function public.clear_moderator_on_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from app_moderators where profile_id = new.profile_id;
  return new;
end $$;
revoke execute on function public.clear_moderator_on_admin() from public, anon, authenticated;
create trigger app_admins_clear_moderator after insert on public.app_admins
  for each row execute function public.clear_moderator_on_admin();

-- ========== NOMINATION (admins appli uniquement) ==========
create or replace function public.set_app_moderator(p_profile_id uuid, p_moderator boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  if not exists (select 1 from profiles where id = p_profile_id) then
    raise exception 'Pilot not found';
  end if;
  if p_moderator then
    if exists (select 1 from app_admins where profile_id = p_profile_id) then
      raise exception 'This pilot is already an app admin';
    end if;
    if public.is_restricted(p_profile_id) then
      raise exception 'A restricted pilot cannot join the team';
    end if;
    insert into app_moderators (profile_id, added_by) values (p_profile_id, auth.uid()) on conflict do nothing;
    if not found then
      return;
    end if;
    insert into admin_actions (action, profile_id) values ('add_moderator', p_profile_id);
    perform send_push(array[p_profile_id], 'Tu es modérateur Kart Rivals',
      'Tu peux traiter les signalements, modérer l’Actu et répondre au support depuis Administration.', '/admin');
  else
    delete from app_moderators where profile_id = p_profile_id;
    if not found then
      return;
    end if;
    insert into admin_actions (action, profile_id) values ('remove_moderator', p_profile_id);
  end if;
end $$;

create or replace function public.list_app_moderators()
returns table (id uuid, username text, avatar_url text, elo int, rank public.rank_tier, since timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return query
    select p.id, p.username, p.avatar_url, p.elo, p.rank, m.created_at
      from app_moderators m join profiles p on p.id = m.profile_id
     order by m.created_at;
end $$;

revoke execute on function public.set_app_moderator(uuid, boolean), public.list_app_moderators() from public, anon;
grant execute on function public.set_app_moderator(uuid, boolean), public.list_app_moderators() to authenticated;

-- Rôles du pilote connecté : is_moderator en plus (jamais vrai pour un admin appli).
create or replace function public.my_admin_roles()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'is_app_admin', public.is_app_admin(),
    'is_moderator', not public.is_app_admin() and public.is_app_moderator(),
    'admin_exists', exists (select 1 from app_admins),
    'managed_track_ids', coalesce((select jsonb_agg(track_id) from track_admins where profile_id = auth.uid()), '[]'::jsonb)
  );
$$;

-- ========== FONCTIONS OUVERTES À L'ÉQUIPE ==========
-- Chaque fonction listée est relue telle qu'elle est installée, et son contrôle « admin appli » devient un contrôle
-- « équipe ». Rien d'autre n'y change. La migration échoue si une fonction manque ou ne contient pas le contrôle
-- attendu : on ne laisse jamais un droit à moitié ouvert.
do $$
declare
  v_names text[] := array[
    -- Signalements
    'admin_reports', 'resolve_report',
    -- Modération de l'Actu
    'admin_content', 'admin_set_content_hidden',
    -- Support
    'admin_support_inbox', 'is_conversation_member', 'mark_conversation_read',
    -- Fiche admin d'un pilote : lecture, avertissement, notes internes
    'admin_search_pilots', 'admin_pilot_detail', 'admin_warn_pilot',
    'admin_pilot_notes', 'admin_add_pilot_note', 'admin_delete_pilot_note'
  ];
  v_name text;
  r record;
  v_def text;
  v_new text;
  v_found boolean;
begin
  foreach v_name in array v_names loop
    v_found := false;
    for r in
      select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_name
    loop
      v_found := true;
      v_def := pg_get_functiondef(r.oid);
      v_new := replace(replace(v_def, 'require_app_admin()', 'require_app_staff()'), 'is_app_admin()', 'is_app_staff()');
      if v_new = v_def then
        raise exception 'No app admin check found in %', v_name;
      end if;
      execute v_new;
    end loop;
    if not v_found then
      raise exception 'Function % not found', v_name;
    end if;
  end loop;

  -- Un pilote écrit au support : toute l'équipe est prévenue, plus seulement les admins appli.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'push_on_message';
  v_new := replace(v_def, 'array(select profile_id from app_admins)', 'array(select public.app_staff_ids())');
  if v_def is null or v_new = v_def then
    raise exception 'Support notification not found in push_on_message';
  end if;
  execute v_new;
end $$;
