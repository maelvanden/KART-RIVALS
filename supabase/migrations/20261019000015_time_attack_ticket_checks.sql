-- Kart Rivals : Time Attack, contrôles renforcés du ticket.
--   - Un même ticket (même heure de session, même nom, même meilleur tour) ne valide qu'une seule session,
--     tous pilotes confondus : impossible de valider avec le ticket d'un ami.
--   - Une même photo (empreinte SHA-256) ne valide qu'une seule session.
--   - Le nom déclaré et le texte lu sont enregistrés dans la même transaction que la validation.

alter table public.time_attack_sessions
  add column ticket_name_key text,
  add column photo_sha256 text;

-- Sessions déjà validées : clé du nom approximative (sans accents gérés), suffisante pour l'historique.
update public.time_attack_sessions
   set ticket_name_key = regexp_replace(lower(ticket_name), '[^a-z0-9]', '', 'g')
 where ticket_name is not null;

create unique index time_attack_sessions_ticket_global on public.time_attack_sessions (ticket_at, ticket_name_key, best_lap_ms)
  where status = 'validated' and ticket_name_key is not null;
create unique index time_attack_sessions_photo_once on public.time_attack_sessions (photo_sha256)
  where status = 'validated' and photo_sha256 is not null;

drop function public.record_time_attack_ticket(uuid, uuid, timestamptz, int, text, timestamptz);

create or replace function public.record_time_attack_ticket(
  p_session_id uuid,
  p_pilot_id uuid,
  p_ticket_at timestamptz,
  p_best_lap_ms int,
  p_ticket_path text,
  p_received_at timestamptz,
  p_ticket_name text,
  p_ticket_name_key text,
  p_photo_sha256 text,
  p_ocr_text text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s time_attack_sessions;
  v_code text;
begin
  select * into s from time_attack_sessions where id = p_session_id for update;
  if s.id is null or s.pilot_id <> p_pilot_id then
    return jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND');
  end if;
  if s.status <> 'on_track' then
    return jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED', 'status', s.status);
  end if;

  -- L'heure de réception est fournie par l'Edge Function (le temps de lecture du ticket ne doit pas
  -- faire rater l'échéance) ; on refuse une valeur incohérente avec l'horloge du serveur.
  if p_received_at > now() or p_received_at < now() - interval '5 minutes' then
    raise exception 'Invalid received_at';
  end if;

  v_code := case
    when p_received_at > s.deadline_at then 'DEADLINE_PASSED'
    -- Règle d'or : strictement après le check-in.
    when p_ticket_at <= s.check_in_at then 'TICKET_BEFORE_CHECK_IN'
    -- Tolérance de 10 min pour l'horloge de l'imprimante du circuit ; au-delà, l'heure a été mal lue.
    when p_ticket_at > p_received_at + interval '10 minutes' then 'TICKET_IN_FUTURE'
    -- Même ticket déjà utilisé, par ce pilote ou par un autre.
    when exists (
      select 1 from time_attack_sessions
       where status = 'validated'
         and ticket_at = p_ticket_at
         and (pilot_id = s.pilot_id or (ticket_name_key = p_ticket_name_key and best_lap_ms = p_best_lap_ms))
    ) then 'TICKET_ALREADY_USED'
    when exists (
      select 1 from time_attack_sessions where status = 'validated' and photo_sha256 = p_photo_sha256
    ) then 'TICKET_ALREADY_USED'
  end;

  if v_code is not null then
    update time_attack_sessions
       set rejection_count = rejection_count + 1,
           last_rejection_code = v_code,
           last_rejected_at = now(),
           last_rejected_ticket_at = p_ticket_at
     where id = s.id;
    return jsonb_build_object('ok', false, 'code', v_code,
                              'check_in_at', s.check_in_at, 'ticket_at', p_ticket_at, 'deadline_at', s.deadline_at);
  end if;

  update time_attack_sessions
     set status = 'validated',
         ticket_at = p_ticket_at,
         ticket_path = p_ticket_path,
         best_lap_ms = p_best_lap_ms,
         ticket_name = left(p_ticket_name, 60),
         ticket_name_key = p_ticket_name_key,
         photo_sha256 = p_photo_sha256,
         ocr_text = left(p_ocr_text, 5000),
         validated_at = now()
   where id = s.id;
  return jsonb_build_object('ok', true, 'check_in_at', s.check_in_at, 'ticket_at', p_ticket_at);
end $$;

revoke execute on function
  public.record_time_attack_ticket(uuid, uuid, timestamptz, int, text, timestamptz, text, text, text, text)
from public, anon, authenticated;
grant execute on function
  public.record_time_attack_ticket(uuid, uuid, timestamptz, int, text, timestamptz, text, text, text, text)
to service_role;
