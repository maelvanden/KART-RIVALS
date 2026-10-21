-- Kart Rivals : avertissements officiels avant sanction.
--   - Un admin appli envoie un avertissement (message) à un pilote ; il est numéroté (1er, 2e…).
--   - Le pilote le voit en plein écran à l'ouverture de l'appli et doit confirmer l'avoir lu.
--   - L'historique (envoyé par, lu le) apparaît dans la fiche admin du pilote et dans le journal.

create table public.pilot_warnings (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  admin_id        uuid references public.profiles (id) on delete set null default auth.uid(),
  message         text not null check (char_length(btrim(message)) between 5 and 500),
  -- Heure exacte (pas celle de la transaction) : sert à numéroter les avertissements.
  created_at      timestamptz not null default clock_timestamp(),
  acknowledged_at timestamptz
);
create index pilot_warnings_profile_idx on public.pilot_warnings (profile_id, created_at desc);
alter table public.pilot_warnings enable row level security;
revoke all on public.pilot_warnings from anon, authenticated;

create or replace function public.admin_warn_pilot(p_profile uuid, p_message text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_number int;
begin
  perform public.require_app_admin();
  if p_profile = auth.uid() then
    raise exception 'You cannot sanction yourself';
  end if;
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception 'Pilot not found';
  end if;
  insert into pilot_warnings (profile_id, message) values (p_profile, btrim(p_message));
  select count(*)::int into v_number from pilot_warnings where profile_id = p_profile;
  insert into admin_actions (action, profile_id, details)
  values ('warn', p_profile, jsonb_build_object('number', v_number, 'reason', btrim(p_message)));
  return v_number;
end $$;

-- Plus ancien avertissement non lu du pilote connecté, avec son numéro.
create or replace function public.my_pending_warning()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', w.id, 'message', w.message, 'created_at', w.created_at,
                            'number', (select count(*) from pilot_warnings x where x.profile_id = w.profile_id
                                                                         and x.created_at <= w.created_at))
    from pilot_warnings w
   where w.profile_id = auth.uid() and w.acknowledged_at is null
   order by w.created_at
   limit 1;
$$;

create or replace function public.acknowledge_warning(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update pilot_warnings set acknowledged_at = now()
   where id = p_id and profile_id = auth.uid() and acknowledged_at is null;
$$;

-- Fiche admin du pilote : avertissements ajoutés.
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
       where w.profile_id = p.id), '[]'::jsonb));
end $$;

revoke execute on function public.admin_warn_pilot(uuid, text), public.my_pending_warning(), public.acknowledge_warning(uuid)
  from public, anon;
grant execute on function public.admin_warn_pilot(uuid, text), public.my_pending_warning(), public.acknowledge_warning(uuid)
  to authenticated;
