-- Kart Rivals : rôle intermédiaire et recrutement ouvert.
--   - Directeur Sportif (bras droit du Team Principal) : recrute, traite les candidatures et libère les
--     Pilotes officiels. Couleurs, blason et rôles restent au Team Principal.
--   - Recrutement ouvert : l'écurie affiche « Recrute » avec un message ; les pilotes sans écurie postulent,
--     le staff (Team Principal ou Directeur Sportif) accepte ou refuse.
-- Les fonctions sont en plpgsql : la nouvelle valeur d'enum n'est utilisable qu'après validation de la
-- transaction, et le corps d'une fonction plpgsql n'est évalué qu'à l'exécution.

alter type public.team_role add value if not exists 'directeur_sportif';

alter table public.teams
  add column recruiting boolean not null default false,
  add column recruiting_message text check (char_length(recruiting_message) <= 140);

drop view public.team_standings;
create view public.team_standings with (security_invoker = true) as
  select t.id, t.name, t.tag, t.logo_url, t.color, t.recruiting, t.recruiting_message, t.created_at,
         count(m.profile_id)::int as member_count,
         coalesce(round(avg(p.elo))::int, 0) as elo,
         rank() over (order by coalesce(avg(p.elo), 0) desc) as position
  from public.teams t
  left join public.team_members m on m.team_id = t.id
  left join public.profiles p on p.id = m.profile_id
  group by t.id;
grant select on public.team_standings to authenticated;

-- ========== CANDIDATURES ==========
create type public.team_application_status as enum ('pending', 'accepted', 'declined', 'cancelled');

create table public.team_applications (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  message      text check (char_length(message) <= 280),
  status       public.team_application_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
create unique index team_applications_pending_key on public.team_applications (team_id, applicant_id) where status = 'pending';
create index team_applications_team_idx on public.team_applications (team_id, status);
create index team_applications_applicant_idx on public.team_applications (applicant_id, status);

alter table public.team_applications enable row level security;
revoke all on public.team_applications from anon, authenticated;
grant select on public.team_applications to authenticated;
create policy "applications readable by applicant and team" on public.team_applications
  for select to authenticated using (applicant_id = auth.uid() or team_id = public.my_team_id());

-- ========== STAFF ==========
create or replace function public.is_team_staff(p_team_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return exists (
    select 1 from team_members
     where team_id = p_team_id and profile_id = auth.uid()
       and role in ('team_principal', 'directeur_sportif')
  );
end $$;

-- Nommer ou rétrograder un Directeur Sportif (Team Principal).
create or replace function public.set_team_member_role(p_pilot_id uuid, p_role public.team_role)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := public.my_team_id();
begin
  if v_team is null or not public.is_team_principal(v_team) then
    raise exception 'Only the Team Principal can assign roles';
  end if;
  if p_role not in ('directeur_sportif', 'pilote_officiel') or p_pilot_id = auth.uid() then
    raise exception 'Invalid role';
  end if;
  update team_members set role = p_role where team_id = v_team and profile_id = p_pilot_id;
  if not found then
    raise exception 'Pilot is not in your team';
  end if;
end $$;

-- Le staff recrute (remplace la version réservée au Team Principal).
create or replace function public.invite_to_team(p_pilot_id uuid)
returns public.team_invites
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := public.my_team_id();
  i team_invites;
begin
  if v_team is null or not public.is_team_staff(v_team) then
    raise exception 'Only the team staff can recruit';
  end if;
  if exists (select 1 from team_members where profile_id = p_pilot_id) then
    raise exception 'Pilot already belongs to a team';
  end if;
  if (select count(*) from team_members where team_id = v_team) >= 12 then
    raise exception 'Team is full';
  end if;
  select * into i from team_invites where team_id = v_team and invitee_id = p_pilot_id and status = 'pending';
  if i.id is not null then
    return i;
  end if;
  insert into team_invites (team_id, invitee_id, invited_by) values (v_team, p_pilot_id, auth.uid()) returning * into i;
  return i;
end $$;

-- Libérer un pilote : le Team Principal libère n'importe qui, un Directeur Sportif seulement les Pilotes officiels.
create or replace function public.kick_team_member(p_pilot_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := public.my_team_id();
  v_target team_role;
begin
  if v_team is null or not public.is_team_staff(v_team) or p_pilot_id = auth.uid() then
    raise exception 'Only the team staff can release a pilot';
  end if;
  select role into v_target from team_members where team_id = v_team and profile_id = p_pilot_id;
  if v_target is null then
    raise exception 'Pilot is not in your team';
  end if;
  if v_target <> 'pilote_officiel' and not public.is_team_principal(v_team) then
    raise exception 'Only the Team Principal can release staff';
  end if;
  delete from team_members where team_id = v_team and profile_id = p_pilot_id;
  delete from conversation_members
   where profile_id = p_pilot_id and conversation_id in (select id from conversations where team_id = v_team);
end $$;

-- Quitter : le Team Principal passe la main à un Directeur Sportif s'il y en a, sinon au plus ancien.
create or replace function public.leave_team()
returns void
language plpgsql security definer set search_path = public as $$
declare
  m team_members;
  v_next uuid;
begin
  select * into m from team_members where profile_id = auth.uid() for update;
  if m.team_id is null then
    raise exception 'You do not belong to a team';
  end if;
  perform 1 from teams where id = m.team_id for update;

  delete from team_members where team_id = m.team_id and profile_id = auth.uid();
  delete from conversation_members
   where profile_id = auth.uid() and conversation_id in (select id from conversations where team_id = m.team_id);

  if not exists (select 1 from team_members where team_id = m.team_id) then
    delete from teams where id = m.team_id;
  elsif m.role = 'team_principal' then
    select profile_id into v_next from team_members
     where team_id = m.team_id
     order by (role = 'directeur_sportif') desc, joined_at
     limit 1;
    update team_members set role = 'team_principal' where team_id = m.team_id and profile_id = v_next;
  end if;
end $$;

-- ========== RECRUTEMENT OUVERT ==========
create or replace function public.set_team_recruiting(p_open boolean, p_message text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := public.my_team_id();
begin
  if v_team is null or not public.is_team_principal(v_team) then
    raise exception 'Only the Team Principal can open recruitment';
  end if;
  update teams set recruiting = p_open, recruiting_message = nullif(btrim(p_message), '') where id = v_team;
  -- Recrutement fermé : les candidatures en attente sont refusées.
  if not p_open then
    update team_applications set status = 'declined', responded_at = now() where team_id = v_team and status = 'pending';
  end if;
end $$;

create or replace function public.apply_to_team(p_team_id uuid, p_message text default null)
returns public.team_applications
language plpgsql security definer set search_path = public as $$
declare
  a team_applications;
begin
  if exists (select 1 from team_members where profile_id = auth.uid()) then
    raise exception 'You already belong to a team';
  end if;
  if not exists (select 1 from teams where id = p_team_id and recruiting) then
    raise exception 'This team is not recruiting';
  end if;
  if (select count(*) from team_members where team_id = p_team_id) >= 12 then
    raise exception 'Team is full';
  end if;
  if exists (select 1 from team_applications where team_id = p_team_id and applicant_id = auth.uid() and status = 'pending') then
    raise exception 'Application already sent';
  end if;
  if (select count(*) from team_applications where applicant_id = auth.uid() and status = 'pending') >= 3 then
    raise exception 'Too many pending applications';
  end if;
  insert into team_applications (team_id, applicant_id, message)
  values (p_team_id, auth.uid(), nullif(btrim(p_message), ''))
  returning * into a;
  return a;
end $$;

create or replace function public.cancel_team_application(p_application_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update team_applications set status = 'cancelled', responded_at = now()
   where id = p_application_id and applicant_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'No pending application';
  end if;
end $$;

create or replace function public.respond_team_application(p_application_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a team_applications;
begin
  select * into a from team_applications where id = p_application_id and status = 'pending' for update;
  if a.id is null or not public.is_team_staff(a.team_id) then
    raise exception 'No pending application';
  end if;
  if not p_accept then
    update team_applications set status = 'declined', responded_at = now() where id = a.id;
    return;
  end if;
  perform 1 from teams where id = a.team_id for update;
  if exists (select 1 from team_members where profile_id = a.applicant_id) then
    update team_applications set status = 'cancelled', responded_at = now() where id = a.id;
    raise exception 'Pilot already belongs to a team';
  end if;
  if (select count(*) from team_members where team_id = a.team_id) >= 12 then
    raise exception 'Team is full';
  end if;

  insert into team_members (team_id, profile_id, role) values (a.team_id, a.applicant_id, 'pilote_officiel');
  insert into conversation_members (conversation_id, profile_id)
    select id, a.applicant_id from conversations where team_id = a.team_id
    on conflict do nothing;
  update team_applications set status = 'accepted', responded_at = now() where id = a.id;
  -- Ses autres candidatures et invitations tombent.
  update team_applications set status = 'cancelled', responded_at = now()
   where applicant_id = a.applicant_id and status = 'pending';
  update team_invites set status = 'declined' where invitee_id = a.applicant_id and status = 'pending';
end $$;

-- Rejoindre une écurie par invitation annule aussi ses candidatures en attente.
create or replace function public.cancel_applications_on_join()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update team_applications set status = 'cancelled', responded_at = now()
   where applicant_id = new.profile_id and status = 'pending' and team_id <> new.team_id;
  return new;
end $$;
create trigger team_members_after_insert after insert on public.team_members
  for each row execute function public.cancel_applications_on_join();

revoke execute on function
  public.is_team_staff(uuid), public.set_team_member_role(uuid, public.team_role),
  public.set_team_recruiting(boolean, text), public.apply_to_team(uuid, text),
  public.cancel_team_application(uuid), public.respond_team_application(uuid, boolean)
from public, anon;
grant execute on function
  public.is_team_staff(uuid), public.set_team_member_role(uuid, public.team_role),
  public.set_team_recruiting(boolean, text), public.apply_to_team(uuid, text),
  public.cancel_team_application(uuid), public.respond_team_application(uuid, boolean)
to authenticated;
revoke execute on function public.cancel_applications_on_join() from public, anon, authenticated;

alter publication supabase_realtime add table public.team_applications;
