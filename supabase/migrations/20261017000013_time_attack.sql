-- Kart Rivals : mode solo « Time Attack » avec check-in anti-triche.
--
-- Règles :
--   1. Check-in (« Je pars rouler ») : l'heure est prise par le serveur (check_in_at = now()),
--      jamais par le téléphone. Le pilote a 90 minutes pour envoyer la photo de son ticket.
--   2. Règle d'or : l'heure de session imprimée sur le ticket (ticket_at, lue par l'IA Vision dans
--      l'Edge Function time-attack-ticket) doit être STRICTEMENT postérieure au check-in.
--      Un ticket daté d'avant le check-in est refusé : le pilote ne peut pas attendre de voir
--      son chrono pour décider s'il « s'engage ».
--   3. Pénalité : 90 minutes après le check-in sans ticket valide, la session passe en DNF
--      et le pilote perd de l'ELO (tâche pg_cron expire_time_attack_sessions).

create type public.time_attack_status as enum ('on_track', 'validated', 'dnf');

create table public.time_attack_sessions (
  id                    uuid primary key default gen_random_uuid(),
  pilot_id              uuid not null references public.profiles (id) on delete cascade,
  track_id              uuid not null references public.tracks (id),
  status                public.time_attack_status not null default 'on_track',
  check_in_at           timestamptz not null default now(),
  -- Même now() que check_in_at (heure de début de transaction) : échéance = check-in + 90 min.
  deadline_at           timestamptz not null default now() + interval '90 minutes',
  -- Ticket retenu (renseigné uniquement quand la session est validée).
  ticket_at             timestamptz,
  ticket_path           text,
  best_lap_ms           int check (best_lap_ms > 0),
  validated_at          timestamptz,
  -- Dernier ticket refusé : le pilote peut réessayer jusqu'à l'échéance.
  rejection_count       int not null default 0,
  last_rejection_code   text,
  last_rejected_at      timestamptz,
  last_rejected_ticket_at timestamptz,
  -- Abandon automatique.
  dnf_at                timestamptz,
  elo_penalty           int,
  created_at            timestamptz not null default now(),
  check (deadline_at = check_in_at + interval '90 minutes'),
  check (status <> 'validated' or (ticket_at is not null and ticket_at > check_in_at))
);
create index time_attack_sessions_pilot_idx on public.time_attack_sessions (pilot_id, created_at desc);
-- Une seule session « en piste » à la fois par pilote.
create unique index time_attack_sessions_one_on_track on public.time_attack_sessions (pilot_id) where status = 'on_track';
-- Un même ticket ne peut valider qu'une seule session.
create unique index time_attack_sessions_ticket_once on public.time_attack_sessions (pilot_id, ticket_at) where status = 'validated';
-- Balayage du planificateur.
create index time_attack_sessions_deadline_idx on public.time_attack_sessions (deadline_at) where status = 'on_track';

-- L'historique ELO accepte désormais aussi une session Time Attack (pénalité DNF).
alter table public.elo_history add column time_attack_id uuid references public.time_attack_sessions (id) on delete cascade;
alter table public.elo_history drop constraint elo_history_one_source;
alter table public.elo_history add constraint elo_history_one_source
  check (num_nonnulls(match_id, race_id, time_attack_id) = 1);
create unique index elo_history_time_attack_profile_key on public.elo_history (time_attack_id, profile_id) where time_attack_id is not null;

-- ========== SÉCURITÉ : le pilote lit ses sessions ; écritures uniquement via les fonctions ==========
alter table public.time_attack_sessions enable row level security;
revoke all on public.time_attack_sessions from anon, authenticated;
grant select on public.time_attack_sessions to authenticated;

create policy "pilots read their time attack sessions" on public.time_attack_sessions
  for select to authenticated using (pilot_id = auth.uid());

-- Photos des tickets : bucket privé, chaque pilote n'écrit que dans son dossier
-- time-attack-tickets/<son id>/<id de session>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('time-attack-tickets', 'time-attack-tickets', false, 8 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "pilots upload their own tickets" on storage.objects;
create policy "pilots upload their own tickets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'time-attack-tickets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pilots read their own tickets" on storage.objects;
create policy "pilots read their own tickets"
  on storage.objects for select to authenticated
  using (bucket_id = 'time-attack-tickets' and (storage.foldername(name))[1] = auth.uid()::text);

-- ========== CHECK-IN ==========
create or replace function public.start_time_attack(p_track_id uuid)
returns public.time_attack_sessions
language plpgsql security definer set search_path = public as $$
declare
  s time_attack_sessions;
begin
  if not exists (select 1 from tracks where id = p_track_id) then
    raise exception 'Unknown track';
  end if;
  if exists (select 1 from time_attack_sessions where pilot_id = auth.uid() and status = 'on_track') then
    raise exception 'A Time Attack session is already in progress';
  end if;
  -- check_in_at et deadline_at prennent leurs valeurs par défaut : l'heure du serveur fait foi.
  insert into time_attack_sessions (pilot_id, track_id)
  values (auth.uid(), p_track_id)
  returning * into s;
  return s;
end $$;

-- ========== VALIDATION DU TICKET (appelée par l'Edge Function, jamais par l'app) ==========
-- Contrôle d'autorité, sous verrou : l'Edge Function fait déjà la comparaison pour répondre vite,
-- mais c'est ici que la règle est garantie (pas de course avec le planificateur, pas de ticket réutilisé).
-- Renvoie { ok: true } ou { ok: false, code: '...' } — sans lever d'exception, pour que le refus
-- soit bien enregistré sur la session.
create or replace function public.record_time_attack_ticket(
  p_session_id uuid,
  p_pilot_id uuid,
  p_ticket_at timestamptz,
  p_best_lap_ms int,
  p_ticket_path text,
  p_received_at timestamptz
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

  -- L'heure de réception est fournie par l'Edge Function (le temps de lecture par l'IA ne doit pas
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
    when exists (
      select 1 from time_attack_sessions
       where pilot_id = s.pilot_id and status = 'validated' and ticket_at = p_ticket_at
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
         validated_at = now()
   where id = s.id;
  return jsonb_build_object('ok', true, 'check_in_at', s.check_in_at, 'ticket_at', p_ticket_at);
end $$;

-- ========== PÉNALITÉ DNF (planificateur) ==========
-- Passe en DNF les sessions « en piste » dont l'échéance de 90 min est dépassée et retire l'ELO.
-- Marge de 5 min après l'échéance : un ticket envoyé à 89 min dont la lecture par l'IA est en cours
-- n'est pas pénalisé à tort (record_time_attack_ticket juge sur l'heure de réception).
create or replace function public.expire_time_attack_sessions()
returns int
language plpgsql security definer set search_path = public as $$
declare
  c_penalty constant int := 15; -- ELO retiré pour un abandon
  s record;
  v_elo int;
  v_count int := 0;
begin
  for s in
    select id, pilot_id
      from time_attack_sessions
     where status = 'on_track'
       and deadline_at + interval '5 minutes' < now()
     order by pilot_id
       for update skip locked
  loop
    select elo into v_elo from profiles where id = s.pilot_id for update;

    update profiles set elo = elo - c_penalty where id = s.pilot_id;
    insert into elo_history (time_attack_id, profile_id, elo_before, elo_after, k_factor)
    values (s.id, s.pilot_id, v_elo, v_elo - c_penalty, 0);
    update time_attack_sessions
       set status = 'dnf', dnf_at = now(), elo_penalty = c_penalty
     where id = s.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke execute on function public.start_time_attack(uuid) from public, anon;
grant execute on function public.start_time_attack(uuid) to authenticated;

-- Réservées à l'Edge Function (service_role) et au planificateur.
revoke execute on function
  public.record_time_attack_ticket(uuid, uuid, timestamptz, int, text, timestamptz),
  public.expire_time_attack_sessions()
from public, anon, authenticated;
grant execute on function public.record_time_attack_ticket(uuid, uuid, timestamptz, int, text, timestamptz) to service_role;

-- Toutes les 5 minutes (pg_cron, déjà activé par la migration expire_challenges).
create extension if not exists pg_cron;
select cron.schedule('expire-time-attack-sessions', '*/5 * * * *', 'select public.expire_time_attack_sessions()');
