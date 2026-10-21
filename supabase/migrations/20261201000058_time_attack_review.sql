-- Kart Rivals : plus de DNF injuste au Time Attack.
--   - Si la lecture automatique du ticket échoue ou se trompe, le pilote envoie son ticket en vérification manuelle :
--     la session passe « en vérification » (pending_review) et sort du balayage DNF.
--   - Le planificateur n'inflige plus de DNF à une session dont un ticket a été envoyé avant l'échéance : elle part
--     d'office en vérification. Seule une session sans aucun ticket finit en DNF automatique.
--   - Les admins appli tranchent dans l'écran Time Attack : valider (avec le temps corrigé), DNF (−15 ELO, comme
--     l'abandon automatique) ou annuler sans pénalité.

alter type public.time_attack_status add value if not exists 'pending_review';

alter table public.time_attack_sessions
  add column review_requested_at timestamptz,
  add column review_note         text check (char_length(review_note) <= 300),
  -- Vérification demandée par le planificateur (ticket envoyé mais jamais validé) plutôt que par le pilote.
  add column review_auto         boolean not null default false,
  -- Heure d'envoi de la photo retenue : heure du ticket par défaut si l'admin valide sans la corriger.
  add column ticket_uploaded_at  timestamptz;

create index time_attack_sessions_pending_idx on public.time_attack_sessions (review_requested_at)
  where review_requested_at is not null and admin_reviewed_at is null;

-- Dernière photo envoyée avant l'échéance pour une session.
create or replace function public.time_attack_last_ticket(p_pilot_id uuid, p_session_id uuid, p_deadline timestamptz)
returns table (path text, uploaded_at timestamptz)
language sql stable security definer set search_path = public, storage as $$
  select o.name, o.created_at
    from storage.objects o
   where o.bucket_id = 'time-attack-tickets'
     and o.name like p_pilot_id::text || '/' || p_session_id::text || '/%'
     and o.created_at <= p_deadline
   order by o.created_at desc
   limit 1;
$$;
revoke execute on function public.time_attack_last_ticket(uuid, uuid, timestamptz) from public, anon, authenticated;

-- Le pilote envoie son dernier ticket aux admins.
create or replace function public.request_time_attack_review(p_session_id uuid, p_ticket_name text,
                                                             p_best_lap_ms int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  s time_attack_sessions;
  v_path text;
  v_uploaded timestamptz;
begin
  select * into s from time_attack_sessions where id = p_session_id and pilot_id = auth.uid() for update;
  if s.id is null then
    raise exception 'Time Attack session not found';
  end if;
  if s.status <> 'on_track' then
    raise exception 'Session already closed';
  end if;
  if char_length(btrim(coalesce(p_ticket_name, ''))) < 2 then
    raise exception 'Ticket name is required';
  end if;
  if p_best_lap_ms is null or p_best_lap_ms not between 10000 and 600000 then
    raise exception 'Invalid lap time';
  end if;
  select t.path, t.uploaded_at into v_path, v_uploaded
    from public.time_attack_last_ticket(s.pilot_id, s.id, s.deadline_at) t;
  if v_path is null then
    raise exception 'Send a ticket photo before the deadline';
  end if;

  update time_attack_sessions
     set status = 'pending_review',
         review_requested_at = now(),
         review_note = nullif(left(btrim(p_note), 300), ''),
         review_auto = false,
         ticket_path = v_path,
         ticket_uploaded_at = v_uploaded,
         ticket_name = left(btrim(p_ticket_name), 60),
         best_lap_ms = p_best_lap_ms
   where id = s.id;
end $$;

-- Balayage : DNF seulement sans aucun ticket envoyé à temps, sinon vérification manuelle d'office.
create or replace function public.expire_time_attack_sessions()
returns int
language plpgsql security definer set search_path = public as $$
declare
  c_penalty constant int := 15; -- ELO retiré pour un abandon
  s record;
  v_elo int;
  v_path text;
  v_uploaded timestamptz;
  v_count int := 0;
begin
  for s in
    select id, pilot_id, deadline_at, last_rejected_ticket_at
      from time_attack_sessions
     where status = 'on_track'
       and deadline_at + interval '5 minutes' < now()
     order by pilot_id
       for update skip locked
  loop
    select t.path, t.uploaded_at into v_path, v_uploaded
      from public.time_attack_last_ticket(s.pilot_id, s.id, s.deadline_at) t;

    if v_path is not null then
      update time_attack_sessions
         set status = 'pending_review', review_requested_at = now(), review_auto = true,
             ticket_path = v_path, ticket_uploaded_at = v_uploaded
       where id = s.id;
    else
      select elo into v_elo from profiles where id = s.pilot_id for update;
      update profiles set elo = elo - c_penalty where id = s.pilot_id;
      insert into elo_history (time_attack_id, profile_id, elo_before, elo_after, k_factor)
      values (s.id, s.pilot_id, v_elo, v_elo - c_penalty, 0);
      update time_attack_sessions
         set status = 'dnf', dnf_at = now(), elo_penalty = c_penalty
       where id = s.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.expire_time_attack_sessions() from public, anon, authenticated;

-- Liste admin : ajoute le filtre « pending » (plus anciennes d'abord) et les infos de la demande.
drop function if exists public.admin_time_attacks(text);
create function public.admin_time_attacks(p_filter text default 'suspect')
returns table (id uuid, pilot_id uuid, username text, track_id uuid, track_name text, best_lap_ms int,
               previous_best_ms int, gap_pct numeric, check_in_at timestamptz, ticket_at timestamptz,
               validated_at timestamptz, ticket_path text, ticket_name text, ocr_text text, reviewed boolean,
               status text, deadline_at timestamptz, last_rejection_code text, rejection_count int,
               review_requested_at timestamptz, review_note text, review_auto boolean,
               ticket_uploaded_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return query
    select s.id, s.pilot_id, p.username, s.track_id, t.name, s.best_lap_ms, prev.best,
           case when prev.best > 0 and s.best_lap_ms is not null
                then round((1 - s.best_lap_ms::numeric / prev.best) * 100, 1) end,
           s.check_in_at, s.ticket_at, s.validated_at, s.ticket_path, s.ticket_name, s.ocr_text,
           s.admin_reviewed_at is not null,
           s.status::text, s.deadline_at, s.last_rejection_code, s.rejection_count,
           s.review_requested_at, s.review_note, s.review_auto, s.ticket_uploaded_at
      from time_attack_sessions s
      join profiles p on p.id = s.pilot_id
      join tracks t on t.id = s.track_id
      left join lateral (
        select min(x.best_lap_ms) as best from time_attack_sessions x
         where x.track_id = s.track_id and x.status = 'validated' and x.id <> s.id
           and x.validated_at < coalesce(s.validated_at, now())
      ) prev on true
     where case p_filter
             when 'pending' then s.status = 'pending_review'
             when 'suspect' then s.status = 'validated' and s.admin_reviewed_at is null and prev.best is not null
                                 and s.best_lap_ms < prev.best * 0.97
             else s.status = 'validated'
           end
     order by case when p_filter = 'pending' then s.review_requested_at end asc,
              s.validated_at desc
     limit case p_filter when 'suspect' then 100 when 'pending' then 100 else 30 end;
end $$;

-- Décision sur une session en vérification.
create or replace function public.admin_decide_time_attack_review(
  p_id uuid, p_decision text, p_best_lap_ms int default null, p_ticket_at timestamptz default null,
  p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c_penalty constant int := 15; -- même pénalité que l'abandon automatique
  s time_attack_sessions;
  v_lap int;
  v_ticket_at timestamptz;
  v_elo int;
  v_reason text := nullif(btrim(p_reason), '');
begin
  perform public.require_app_admin();
  select * into s from time_attack_sessions where id = p_id for update;
  if s.id is null or s.status <> 'pending_review' then
    raise exception 'This session is not waiting for a review';
  end if;

  if p_decision = 'validate' then
    v_lap := coalesce(p_best_lap_ms, s.best_lap_ms);
    if v_lap is null or v_lap not between 10000 and 600000 then
      raise exception 'Invalid lap time';
    end if;
    -- Heure du ticket : celle saisie par l'admin, sinon celle lue (si plausible), sinon l'heure d'envoi de la photo.
    v_ticket_at := coalesce(
      p_ticket_at,
      case when s.last_rejected_ticket_at > s.check_in_at and s.last_rejected_ticket_at <= s.deadline_at
           then s.last_rejected_ticket_at end,
      s.ticket_uploaded_at,
      s.check_in_at + interval '1 second');
    if v_ticket_at <= s.check_in_at or v_ticket_at > s.deadline_at then
      raise exception 'Ticket time must be between check-in and deadline';
    end if;
    if exists (select 1 from time_attack_sessions x
                where x.pilot_id = s.pilot_id and x.status = 'validated' and x.ticket_at = v_ticket_at) then
      raise exception 'Ticket already used';
    end if;
    update time_attack_sessions
       set status = 'validated', best_lap_ms = v_lap, ticket_at = v_ticket_at,
           ticket_name_key = regexp_replace(lower(coalesce(ticket_name, '')), '[^a-z0-9]', '', 'g'),
           validated_at = now(), admin_reviewed_at = now()
     where id = s.id;
  elsif p_decision = 'dnf' then
    select elo into v_elo from profiles where id = s.pilot_id for update;
    update profiles set elo = elo - c_penalty where id = s.pilot_id;
    insert into elo_history (time_attack_id, profile_id, elo_before, elo_after, k_factor)
    values (s.id, s.pilot_id, v_elo, v_elo - c_penalty, 0);
    update time_attack_sessions
       set status = 'dnf', dnf_at = now(), elo_penalty = c_penalty, admin_reviewed_at = now(),
           rejected_reason = v_reason
     where id = s.id;
  elsif p_decision = 'cancel' then
    update time_attack_sessions
       set status = 'rejected', admin_reviewed_at = now(), rejected_reason = v_reason
     where id = s.id;
  else
    raise exception 'Unknown decision';
  end if;

  insert into admin_actions (action, profile_id, track_id, details)
  values (case p_decision when 'validate' then 'review_validate_time_attack'
                          when 'dnf' then 'review_dnf_time_attack'
                          else 'review_cancel_time_attack' end,
          s.pilot_id, s.track_id,
          jsonb_strip_nulls(jsonb_build_object('lap_ms', coalesce(v_lap, s.best_lap_ms), 'reason', v_reason)));
end $$;

revoke execute on function public.request_time_attack_review(uuid, text, int, text),
  public.admin_time_attacks(text),
  public.admin_decide_time_attack_review(uuid, text, int, timestamptz, text)
  from public, anon;
grant execute on function public.request_time_attack_review(uuid, text, int, text),
  public.admin_time_attacks(text),
  public.admin_decide_time_attack_review(uuid, text, int, timestamptz, text)
  to authenticated;
