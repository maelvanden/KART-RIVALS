-- Kart Rivals : alertes à l'équipe (admins appli et modérateurs), pour que la file « À traiter » ne dorme pas.
--   - Signalement grave : une notification aussitôt. Grave = harcèlement ou contenu inapproprié, ou un pilote qui
--     cumule 3 signalements ouverts. Au plus une alerte par pilote visé et par tranche de 6 heures.
--   - Éléments en retard : chaque matin à 9 h (heure de Paris), un rappel de ce qui attend depuis plus de 48 h.
--     Les admins appli voient tout ; les modérateurs, seulement les signalements et les messages au support.
--   - Chaque membre de l'équipe peut couper ces alertes pour lui seul (my_team_alerts / set_my_team_alerts).
-- Un compte suspendu ou banni ne reçoit rien. Une notification qui échoue ne bloque jamais un signalement.

create table public.team_alert_prefs (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.team_alert_prefs enable row level security;
revoke all on public.team_alert_prefs from anon, authenticated;

-- Une ligne par alerte déjà envoyée, pour ne pas la répéter.
create table public.team_alert_log (
  key     text primary key,
  sent_at timestamptz not null default now()
);
alter table public.team_alert_log enable row level security;
revoke all on public.team_alert_log from anon, authenticated;

-- Destinataires : 'admin' = admins appli, 'moderator' = modérateurs ; ni sanctionnés ni opt-out.
create or replace function public.team_alert_targets(p_role text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select x.profile_id
    from (
      select profile_id from app_admins where p_role = 'admin'
      union
      select profile_id from app_moderators where p_role = 'moderator'
    ) x
   where not exists (select 1 from team_alert_prefs p where p.profile_id = x.profile_id and not p.enabled)
     and not public.is_restricted(x.profile_id);
$$;
revoke execute on function public.team_alert_targets(text) from public, anon, authenticated;

create or replace function public.my_team_alerts()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_staff();
  return coalesce((select enabled from team_alert_prefs where profile_id = auth.uid()), true);
end $$;

create or replace function public.set_my_team_alerts(p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_app_staff();
  insert into team_alert_prefs (profile_id, enabled) values (auth.uid(), coalesce(p_enabled, true))
  on conflict (profile_id) do update set enabled = excluded.enabled, updated_at = now();
end $$;
revoke execute on function public.my_team_alerts(), public.set_my_team_alerts(boolean) from public, anon;
grant execute on function public.my_team_alerts(), public.set_my_team_alerts(boolean) to authenticated;

-- ========== SIGNALEMENT GRAVE ==========
create or replace function public.push_on_serious_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_open int;
  v_key text;
  v_label text;
begin
  select count(*) into v_open from reports where target_profile_id = new.target_profile_id and status = 'open';
  if new.reason::text not in ('harassment', 'inappropriate') and v_open < 3 then
    return new;
  end if;

  -- Au plus une alerte par pilote visé et par tranche de 6 heures.
  insert into team_alert_log (key)
  values ('report:' || new.target_profile_id || ':' || floor(extract(epoch from now()) / 21600)::bigint)
  on conflict do nothing
  returning key into v_key;
  if v_key is null then
    return new;
  end if;

  v_label := case new.reason::text
    when 'harassment' then 'harcèlement ou insultes'
    when 'inappropriate' then 'contenu inapproprié'
    when 'cheating' then 'triche'
    when 'spam' then 'spam'
    else 'autre motif'
  end;
  perform send_push(array(select public.team_alert_targets('admin') union select public.team_alert_targets('moderator')),
    '🚨 Signalement · ' || v_label,
    pilot_name(new.target_profile_id) || ' est signalé' || case when v_open > 1 then ' (' || v_open || ' signalements ouverts)' else '' end
      || coalesce(' : ' || nullif(left(new.details, 80), ''), '.'),
    '/admin/reports');
  return new;
exception when others then
  -- Une notification ne doit jamais bloquer un signalement.
  raise warning 'push_on_serious_report: %', sqlerrm;
  return new;
end $$;
revoke execute on function public.push_on_serious_report() from public, anon, authenticated;

create trigger reports_serious_push after insert on public.reports
  for each row execute function public.push_on_serious_report();

-- ========== ÉLÉMENTS EN RETARD ==========
-- Appelée toutes les heures par pg_cron ; n'envoie rien en dehors de 9 h (Paris), sauf avec p_force (essais).
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

  if n_reports > 0 then v_mod := v_mod || (n_reports || case when n_reports > 1 then ' signalements' else ' signalement' end); end if;
  if n_support > 0 then v_mod := v_mod || (n_support || case when n_support > 1 then ' messages au support' else ' message au support' end); end if;
  v_admin := v_mod;
  if n_tickets > 0 then v_admin := v_admin || (n_tickets || case when n_tickets > 1 then ' tickets à vérifier' else ' ticket à vérifier' end); end if;
  if n_disputes > 0 then v_admin := v_admin || (n_disputes || case when n_disputes > 1 then ' litiges' else ' litige' end); end if;
  if n_corrections > 0 then v_admin := v_admin || (n_corrections || case when n_corrections > 1 then ' remontées' else ' remontée' end); end if;
  if n_requests > 0 then v_admin := v_admin || (n_requests || case when n_requests > 1 then ' demandes de karting' else ' demande de karting' end); end if;
  if n_tournaments > 0 then v_admin := v_admin || (n_tournaments || case when n_tournaments > 1 then ' tournois bloqués' else ' tournoi bloqué' end); end if;

  v_mod_total := n_reports + n_support;
  v_admin_only_total := n_tickets + n_disputes + n_corrections + n_requests + n_tournaments;
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
revoke execute on function public.team_queue_watch(boolean) from public, anon, authenticated;

select cron.schedule('team-queue-watch', '0 * * * *', 'select public.team_queue_watch()');
