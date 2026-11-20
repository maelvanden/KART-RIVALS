-- Kart Rivals : recours contre une sanction.
-- Un pilote suspendu ou banni peut contester depuis l'écran « Compte suspendu » : son message arrive dans la file
-- « À traiter » des admins appli (pas des modérateurs : lever une sanction est une décision d'admin), qui lèvent la
-- sanction ou refusent avec une réponse que le pilote lit sur le même écran.
--   - Un seul recours par sanction : une nouvelle suspension ou un bannissement rouvre le droit d'en envoyer un.
--   - Lever un recours passe par admin_moderate_pilot (unsuspend / unban), donc la décision est tracée deux fois au
--     journal : la levée de la sanction, et la réponse au recours.
--   - Un recours qui concerne une sanction déjà remplacée par une autre ne peut plus être accepté, seulement refusé.

create table public.sanction_appeals (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('suspension', 'ban')),
  sanction_key text not null,
  message      text not null check (char_length(message) between 10 and 1000),
  status       text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  response     text check (char_length(response) <= 500),
  created_at   timestamptz not null default now(),
  handled_by   uuid references public.profiles (id) on delete set null,
  handled_at   timestamptz,
  unique (profile_id, sanction_key)
);
create index sanction_appeals_status_idx on public.sanction_appeals (status, created_at);
alter table public.sanction_appeals enable row level security;
revoke all on public.sanction_appeals from anon, authenticated;

-- Identifie la sanction en cours d'un pilote (null s'il n'est ni suspendu ni banni).
create or replace function public.current_sanction_key(p_profile uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when banned_at is not null then 'ban:' || banned_at::text
              when suspended_until > now() then 'suspension:' || suspended_until::text end
    from profiles where id = p_profile;
$$;
revoke execute on function public.current_sanction_key(uuid) from public, anon, authenticated;

-- ========== CÔTÉ PILOTE ==========
create or replace function public.submit_sanction_appeal(p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_key text := public.current_sanction_key(auth.uid());
  v_msg text := btrim(coalesce(p_message, ''));
  v_id uuid;
begin
  if auth.uid() is null or v_key is null then
    raise exception 'No active sanction';
  end if;
  if char_length(v_msg) < 10 then
    raise exception 'Appeal too short';
  end if;
  if char_length(v_msg) > 1000 then
    raise exception 'Appeal too long';
  end if;

  insert into sanction_appeals (profile_id, kind, sanction_key, message)
  values (auth.uid(), case when v_key like 'ban:%' then 'ban' else 'suspension' end, v_key, v_msg)
  on conflict (profile_id, sanction_key) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'Appeal already sent';
  end if;

  perform send_push(array(select public.team_alert_targets('admin')), '⚖️ Recours · ' || pilot_name(auth.uid()),
    left(v_msg, 120), '/admin/appeals');
  return v_id;
end $$;

-- Recours du pilote connecté contre sa sanction en cours (null s'il n'en a pas envoyé).
create or replace function public.my_appeal()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'status', a.status, 'kind', a.kind, 'message', a.message,
                            'response', a.response, 'created_at', a.created_at, 'handled_at', a.handled_at)
    from sanction_appeals a
   where a.profile_id = auth.uid() and a.sanction_key = public.current_sanction_key(auth.uid());
$$;

revoke execute on function public.submit_sanction_appeal(text), public.my_appeal() from public, anon;
grant execute on function public.submit_sanction_appeal(text), public.my_appeal() to authenticated;

-- ========== CÔTÉ ADMIN ==========
-- p_status : 'open' (du plus ancien au plus récent) ou 'done' (traités, les plus récents d'abord).
create or replace function public.admin_appeals(p_status text default 'open')
returns table (id uuid, profile_id uuid, username text, avatar_url text, rank public.rank_tier, elo int, kind text,
               sanction_reason text, suspended_until timestamptz, banned_at timestamptz, still_active boolean,
               message text, status text, response text, created_at timestamptz, handled_at timestamptz,
               handled_by text, warnings int, reports int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  if p_status not in ('open', 'done') then
    raise exception 'Invalid filter';
  end if;
  return query
    select a.id, a.profile_id, p.username, p.avatar_url, p.rank, p.elo, a.kind, p.moderation_reason,
           case when p.suspended_until > now() then p.suspended_until end, p.banned_at,
           public.current_sanction_key(p.id) is not distinct from a.sanction_key,
           a.message, a.status, a.response, a.created_at, a.handled_at, h.username,
           (select count(*)::int from pilot_warnings w where w.profile_id = p.id),
           (select count(*)::int from reports r where r.target_profile_id = p.id)
      from sanction_appeals a
      join profiles p on p.id = a.profile_id
      left join profiles h on h.id = a.handled_by
     where (p_status = 'open') = (a.status = 'open')
     order by case when p_status = 'open' then a.created_at end asc, a.handled_at desc
     limit 100;
end $$;

-- p_decision : 'lift' (lève la sanction) ou 'reject' (réponse obligatoire).
create or replace function public.admin_resolve_appeal(p_id uuid, p_decision text, p_response text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  a sanction_appeals;
  v_resp text := nullif(left(btrim(coalesce(p_response, '')), 500), '');
  v_key text;
begin
  perform public.require_app_admin();
  select * into a from sanction_appeals where id = p_id for update;
  if a.id is null then
    raise exception 'Appeal not found';
  end if;
  if a.status <> 'open' then
    raise exception 'Appeal already handled';
  end if;

  if p_decision = 'reject' then
    if v_resp is null or char_length(v_resp) < 3 then
      raise exception 'A reason is required';
    end if;
  elsif p_decision = 'lift' then
    v_key := public.current_sanction_key(a.profile_id);
    if v_key is not null then
      if v_key <> a.sanction_key then
        raise exception 'This appeal concerns an older sanction';
      end if;
      perform public.admin_moderate_pilot(a.profile_id, case a.kind when 'ban' then 'unban' else 'unsuspend' end);
    end if;
  else
    raise exception 'Invalid decision';
  end if;

  update sanction_appeals
     set status = case p_decision when 'lift' then 'accepted' else 'rejected' end,
         response = v_resp, handled_by = auth.uid(), handled_at = now()
   where id = a.id;
  insert into admin_actions (action, profile_id, details)
  values (case p_decision when 'lift' then 'appeal_accepted' else 'appeal_rejected' end, a.profile_id,
          jsonb_strip_nulls(jsonb_build_object('kind', a.kind, 'reason', v_resp)));
  if p_decision = 'lift' then
    perform send_push(array[a.profile_id], '✅ Sanction levée',
      'Ton recours a été accepté : ton compte est de nouveau actif.' || coalesce(' ' || v_resp, ''), '/');
  else
    perform send_push(array[a.profile_id], '⚖️ Recours examiné', 'Ton recours a été refusé : ' || v_resp, '/');
  end if;
end $$;

revoke execute on function public.admin_appeals(text), public.admin_resolve_appeal(uuid, text, text) from public, anon;
grant execute on function public.admin_appeals(text), public.admin_resolve_appeal(uuid, text, text) to authenticated;

-- ========== RAPPEL DU MATIN ==========
-- Même fonction que team_alerts, avec les recours en attente depuis plus de 48 h (admins appli seulement).
create or replace function public.team_queue_watch(p_force boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_late interval := interval '48 hours';
  n_reports int;
  n_support int;
  n_tickets int;
  n_disputes int;
  n_corrections int;
  n_requests int;
  n_tournaments int;
  n_appeals int;
  v_mod text[] := '{}';
  v_admin text[] := '{}';
  v_mod_total int := 0;
  v_admin_total int := 0;
  v_admin_only_total int;
begin
  if not p_force and extract(hour from now() at time zone 'Europe/Paris') <> 9 then
    return;
  end if;

  select count(*) into n_reports from reports where status = 'open' and created_at < now() - v_late;
  select count(*) into n_support from conversations c
   where c.kind = 'support' and c.last_message_at < now() - v_late
     and exists (select 1 from messages m
                  where m.conversation_id = c.id and m.sender_id = c.support_profile_id
                    and m.created_at > coalesce(c.staff_read_at, '-infinity'::timestamptz));
  select count(*) into n_tickets from time_attack_sessions
   where status = 'pending_review' and coalesce(review_requested_at, check_in_at) < now() - v_late;
  select (select count(*) from matches m
           where (m.status = 'disputed' or (m.status = 'awaiting_confirmation' and m.created_at < now() - interval '3 days'))
             and m.created_at < now() - v_late)
       + (select count(*) from races r
           where (r.status = 'disputed' or (r.status = 'awaiting_confirmation' and r.submitted_at < now() - interval '3 days'))
             and coalesce(r.submitted_at, r.created_at) < now() - v_late)
    into n_disputes;
  select count(*) into n_corrections from track_corrections where status = 'open' and created_at < now() - v_late;
  select count(*) into n_requests from track_admin_requests where status = 'pending' and created_at < now() - v_late;
  select count(*) into n_tournaments from tournaments t
   where t.status = 'running'
     and exists (select 1 from public.tournament_open_duels(t.id) d where d.stuck_since is not null);
  select count(*) into n_appeals from sanction_appeals where status = 'open' and created_at < now() - v_late;

  if n_reports > 0 then v_mod := v_mod || (n_reports || case when n_reports > 1 then ' signalements' else ' signalement' end); end if;
  if n_support > 0 then v_mod := v_mod || (n_support || case when n_support > 1 then ' messages au support' else ' message au support' end); end if;
  v_admin := v_mod;
  if n_tickets > 0 then v_admin := v_admin || (n_tickets || case when n_tickets > 1 then ' tickets à vérifier' else ' ticket à vérifier' end); end if;
  if n_disputes > 0 then v_admin := v_admin || (n_disputes || case when n_disputes > 1 then ' litiges' else ' litige' end); end if;
  if n_corrections > 0 then v_admin := v_admin || (n_corrections || case when n_corrections > 1 then ' remontées' else ' remontée' end); end if;
  if n_requests > 0 then v_admin := v_admin || (n_requests || case when n_requests > 1 then ' demandes de karting' else ' demande de karting' end); end if;
  if n_tournaments > 0 then v_admin := v_admin || (n_tournaments || case when n_tournaments > 1 then ' tournois bloqués' else ' tournoi bloqué' end); end if;
  if n_appeals > 0 then v_admin := v_admin || (n_appeals || ' recours'); end if;

  v_mod_total := n_reports + n_support;
  v_admin_only_total := n_tickets + n_disputes + n_corrections + n_requests + n_tournaments + n_appeals;
  v_admin_total := v_mod_total + v_admin_only_total;

  if v_admin_total > 0 then
    perform send_push(array(select public.team_alert_targets('admin')),
      '⏰ ' || v_admin_total || ' élément' || case when v_admin_total > 1 then 's' else '' end || ' en retard',
      array_to_string(v_admin, ', ') || ' en attente depuis plus de 48 h.', '/admin/queue');
  end if;
  if v_mod_total > 0 then
    perform send_push(array(select public.team_alert_targets('moderator')),
      '⏰ ' || v_mod_total || ' élément' || case when v_mod_total > 1 then 's' else '' end || ' en retard',
      array_to_string(v_mod, ', ') || ' en attente depuis plus de 48 h.', '/admin/queue');
  end if;
exception when others then
  raise warning 'team_queue_watch: %', sqlerrm;
end $$;
