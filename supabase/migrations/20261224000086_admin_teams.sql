-- Kart Rivals : modération des écuries par les admins appli.
--   - admin_teams : recherche par nom ou tag, écuries récentes (noms et blasons à relire) et écuries « à l'abandon »
--     (Team Principal sanctionné, ou sans activité depuis plus de 60 jours).
--   - admin_team_detail : effectif avec rôle, dernière activité et sanction, plus l'historique admin de l'écurie.
--   - admin_rename_team : remplace un nom ou un tag inapproprié.
--   - admin_moderate_team : retire le blason, ou efface le message de recrutement.
--   - admin_transfer_team : confie l'écurie à un autre de ses pilotes (Team Principal inactif ou banni).
--   - admin_dissolve_team : supprime l'écurie ; ses pilotes redeviennent libres.
-- Chaque décision est tracée au journal (details.team_id) et les pilotes concernés sont prévenus.

create or replace function public.admin_teams(p_query text default null, p_filter text default 'all')
returns table (id uuid, name text, tag text, logo_url text, color text, created_at timestamptz, members int, elo int,
               recruiting boolean, principal_id uuid, principal text, principal_restricted boolean,
               principal_last_activity timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public.require_app_admin();
  if p_filter not in ('all', 'recent', 'inactive') then
    raise exception 'Invalid filter';
  end if;
  return query
    with last_seen as (
      select a.profile_id, max(a.at) as last_at from public.pilot_activity() a group by a.profile_id
    )
    select t.id, t.name, t.tag, t.logo_url, t.color, t.created_at,
           (select count(*)::int from team_members m where m.team_id = t.id),
           coalesce((select round(avg(p.elo))::int from team_members m join profiles p on p.id = m.profile_id
                      where m.team_id = t.id), 0),
           t.recruiting, tp.profile_id, pp.username, coalesce(public.is_restricted(tp.profile_id), false), ls.last_at
      from teams t
      left join team_members tp on tp.team_id = t.id and tp.role = 'team_principal'
      left join profiles pp on pp.id = tp.profile_id
      left join last_seen ls on ls.profile_id = tp.profile_id
     where (v_query is null or t.name ilike '%' || v_query || '%' or t.tag ilike v_query || '%')
       and case p_filter
             when 'recent' then t.created_at > now() - interval '14 days'
             when 'inactive' then tp.profile_id is null
                               or public.is_restricted(tp.profile_id)
                               or (t.created_at < now() - interval '60 days'
                                   and coalesce(ls.last_at, pp.created_at) < now() - interval '60 days')
             else true
           end
     order by case when p_filter = 'inactive' then ls.last_at end nulls first, t.created_at desc
     limit 100;
end $$;

create or replace function public.admin_team_detail(p_team_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t teams;
begin
  perform public.require_app_admin();
  select * into t from teams where id = p_team_id;
  if t.id is null then
    raise exception 'Team not found';
  end if;
  return jsonb_build_object(
    'id', t.id, 'name', t.name, 'tag', t.tag, 'logo_url', t.logo_url, 'color', t.color, 'created_at', t.created_at,
    'recruiting', t.recruiting, 'recruiting_message', t.recruiting_message,
    'founder', pilot_name(t.created_by),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url, 'elo', p.elo, 'rank', p.rank,
                           'role', m.role, 'joined_at', m.joined_at,
                           'restricted', public.is_restricted(p.id),
                           'last_activity', (select max(a.at) from public.pilot_activity() a where a.profile_id = p.id))
                           order by case m.role when 'team_principal' then 0 when 'directeur_sportif' then 1 else 2 end,
                                    m.joined_at)
                           from team_members m join profiles p on p.id = m.profile_id
                          where m.team_id = t.id), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', a.id, 'action', a.action, 'details', a.details, 'created_at', a.created_at,
                           'admin', ap.username, 'pilot', pp.username) order by a.created_at desc)
                           from admin_actions a
                           left join profiles ap on ap.id = a.admin_id
                           left join profiles pp on pp.id = a.profile_id
                          where a.details->>'team_id' = t.id::text), '[]'::jsonb));
end $$;

-- Team Principal d'une écurie (null si elle n'en a plus).
create or replace function public.team_principal_id(p_team_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select profile_id from team_members where team_id = p_team_id and role = 'team_principal';
$$;
revoke execute on function public.team_principal_id(uuid) from public, anon, authenticated;

create or replace function public.admin_rename_team(p_team_id uuid, p_name text, p_tag text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t teams;
  v_name text := btrim(coalesce(p_name, ''));
  v_tag text := upper(btrim(coalesce(p_tag, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 280), '');
begin
  perform public.require_app_admin();
  select * into t from teams where id = p_team_id for update;
  if t.id is null then
    raise exception 'Team not found';
  end if;
  if char_length(v_name) not between 3 and 30 then
    raise exception 'Team name must be 3 to 30 characters';
  end if;
  if v_tag !~ '^[A-Z0-9]{2,4}$' then
    raise exception 'Team tag must be 2 to 4 letters or digits';
  end if;
  if v_name = t.name and v_tag = t.tag then
    return;
  end if;
  if exists (select 1 from teams where lower(name) = lower(v_name) and id <> t.id) then
    raise exception 'Team name already taken';
  end if;
  if exists (select 1 from teams where tag = v_tag and id <> t.id) then
    raise exception 'Team tag already taken';
  end if;

  update teams set name = v_name, tag = v_tag where id = t.id;
  insert into admin_actions (action, profile_id, details)
  values ('rename_team', public.team_principal_id(t.id),
          jsonb_build_object('team_id', t.id, 'before', t.name || ' [' || t.tag || ']',
                             'after', v_name || ' [' || v_tag || ']', 'reason', v_reason));
  perform send_push(array(select profile_id from team_members where team_id = t.id and profile_id <> auth.uid()),
    'Ton écurie a été renommée',
    'L’équipe Kart Rivals a renommé ' || t.name || ' [' || t.tag || '] en ' || v_name || ' [' || v_tag || ']'
      || coalesce(' : ' || v_reason, '.'),
    '/team');
end $$;

create or replace function public.admin_moderate_team(p_team_id uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t teams;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 280), '');
begin
  perform public.require_app_admin();
  select * into t from teams where id = p_team_id for update;
  if t.id is null then
    raise exception 'Team not found';
  end if;
  if p_action = 'remove_logo' then
    if t.logo_url is null then
      return;
    end if;
    update teams set logo_url = null where id = t.id;
  elsif p_action = 'clear_message' then
    if t.recruiting_message is null then
      return;
    end if;
    update teams set recruiting_message = null where id = t.id;
  else
    raise exception 'Invalid action';
  end if;

  insert into admin_actions (action, profile_id, details)
  values ('team_' || p_action, public.team_principal_id(t.id),
          jsonb_build_object('team_id', t.id, 'name', t.name, 'reason', v_reason,
                             'excerpt', case when p_action = 'clear_message' then left(t.recruiting_message, 80) end));
  perform send_push(array(select profile_id from team_members
                           where team_id = t.id and role = 'team_principal' and profile_id <> auth.uid()),
    case when p_action = 'remove_logo' then 'Blason de ton écurie retiré' else 'Message de recrutement effacé' end,
    'L’équipe Kart Rivals a modéré ' || t.name || coalesce(' : ' || v_reason, '.'),
    '/team');
end $$;

create or replace function public.admin_transfer_team(p_team_id uuid, p_new_principal uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t teams;
  v_old uuid;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 280), '');
begin
  perform public.require_app_admin();
  select * into t from teams where id = p_team_id for update;
  if t.id is null then
    raise exception 'Team not found';
  end if;
  v_old := public.team_principal_id(t.id);
  if not exists (select 1 from team_members where team_id = t.id and profile_id = p_new_principal) then
    raise exception 'Pilot is not in this team';
  end if;
  if v_old = p_new_principal then
    return;
  end if;
  if public.is_restricted(p_new_principal) then
    raise exception 'A restricted pilot cannot lead a team';
  end if;

  -- Un seul Team Principal par écurie : on rétrograde l'ancien avant de nommer le nouveau.
  update team_members set role = 'pilote_officiel' where team_id = t.id and role = 'team_principal';
  update team_members set role = 'team_principal' where team_id = t.id and profile_id = p_new_principal;
  insert into admin_actions (action, profile_id, details)
  values ('transfer_team', p_new_principal,
          jsonb_build_object('team_id', t.id, 'name', t.name, 'before', pilot_name(v_old), 'reason', v_reason));
  perform send_push(array[p_new_principal], 'Tu es le nouveau Team Principal',
    'L’équipe Kart Rivals t’a confié ' || t.name || ' [' || t.tag || ']' || coalesce(' : ' || v_reason, '.'), '/team');
  if v_old is not null then
    perform send_push(array[v_old], 'Tu n’es plus Team Principal',
      t.name || ' est maintenant dirigée par ' || pilot_name(p_new_principal) || coalesce(' : ' || v_reason, '.'), '/team');
  end if;
end $$;

create or replace function public.admin_dissolve_team(p_team_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t teams;
  v_members uuid[];
  v_principal uuid;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 280), '');
begin
  perform public.require_app_admin();
  select * into t from teams where id = p_team_id for update;
  if t.id is null then
    raise exception 'Team not found';
  end if;
  v_principal := public.team_principal_id(t.id);
  select array_agg(profile_id) into v_members from team_members where team_id = t.id and profile_id <> auth.uid();

  -- Effectif, invitations, candidatures et canal radio partent avec l'écurie (suppressions en cascade).
  delete from teams where id = t.id;
  insert into admin_actions (action, profile_id, details)
  values ('dissolve_team', v_principal,
          jsonb_build_object('team_id', t.id, 'name', t.name || ' [' || t.tag || ']',
                             'members', coalesce(array_length(v_members, 1), 0), 'reason', v_reason));
  if v_members is not null then
    perform send_push(v_members, 'Ton écurie a été dissoute',
      'L’équipe Kart Rivals a dissous ' || t.name || ' [' || t.tag || ']' || coalesce(' : ' || v_reason || '.', '.')
        || ' Tu peux rejoindre ou fonder une autre écurie.',
      '/teams');
  end if;
end $$;

revoke execute on function public.admin_teams(text, text), public.admin_team_detail(uuid),
  public.admin_rename_team(uuid, text, text, text), public.admin_moderate_team(uuid, text, text),
  public.admin_transfer_team(uuid, uuid, text), public.admin_dissolve_team(uuid, text) from public, anon;
grant execute on function public.admin_teams(text, text), public.admin_team_detail(uuid),
  public.admin_rename_team(uuid, text, text, text), public.admin_moderate_team(uuid, text, text),
  public.admin_transfer_team(uuid, uuid, text), public.admin_dissolve_team(uuid, text) to authenticated;
