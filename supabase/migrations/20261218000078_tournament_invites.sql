-- Kart Rivals : tournois privés et invitations.
--   - Un tournoi est public (tout le monde le voit et s'inscrit) ou privé (visible et ouvert aux seuls invités).
--   - Invitations : l'organisateur invite qui il veut ; dans un tournoi public, tout inscrit peut inviter aussi.
--     L'invité accepte (il s'inscrit) ou refuse ; une invitation refusée n'est pas renvoyée.

alter table public.tournaments add column if not exists is_private boolean not null default false;

create table public.tournament_invites (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  pilot_id      uuid not null references public.profiles (id) on delete cascade,
  invited_by    uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'declined')),
  created_at    timestamptz not null default now(),
  primary key (tournament_id, pilot_id)
);
create index tournament_invites_pilot_idx on public.tournament_invites (pilot_id, status);

-- ========== QUI VOIT QUOI ==========
-- Tournoi privé : l'organisateur, les inscrits, les invités et les admins.
create or replace function public.can_see_tournament(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tournaments t
     where t.id = p_tournament_id
       and (not t.is_private
            or t.organizer_id = auth.uid()
            or exists (select 1 from tournament_entries e where e.tournament_id = t.id and e.pilot_id = auth.uid())
            or exists (select 1 from tournament_invites i where i.tournament_id = t.id and i.pilot_id = auth.uid())
            or public.is_app_admin())
  );
$$;
revoke execute on function public.can_see_tournament(uuid) from public, anon;
grant execute on function public.can_see_tournament(uuid) to authenticated;

drop policy if exists "pilots read tournaments" on public.tournaments;
create policy "pilots read tournaments" on public.tournaments
  for select to authenticated using (public.can_see_tournament(id));
drop policy if exists "pilots read tournament entries" on public.tournament_entries;
create policy "pilots read tournament entries" on public.tournament_entries
  for select to authenticated using (public.can_see_tournament(tournament_id));
drop policy if exists "pilots read tournament brackets" on public.tournament_matches;
create policy "pilots read tournament brackets" on public.tournament_matches
  for select to authenticated using (public.can_see_tournament(tournament_id));

alter table public.tournament_invites enable row level security;
revoke all on public.tournament_invites from anon, authenticated;
grant select on public.tournament_invites to authenticated;
-- L'invité, celui qui a invité et l'organisateur.
create policy "pilots read their tournament invites" on public.tournament_invites
  for select to authenticated using (
    pilot_id = auth.uid() or invited_by = auth.uid()
    or exists (select 1 from public.tournaments t where t.id = tournament_id and t.organizer_id = auth.uid())
  );

-- ========== CRÉATION : public ou privé ==========
-- L'ancienne signature est retirée : les appels sans p_is_private tombent sur la nouvelle grâce à sa valeur par défaut.
drop function if exists public.create_tournament(uuid, text, int, public.race_format, timestamptz, text);
create or replace function public.create_tournament(
  p_track_id uuid,
  p_name text,
  p_size int,
  p_format public.race_format default 'position',
  p_starts_at timestamptz default null,
  p_message text default null,
  p_is_private boolean default false
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or public.is_restricted(auth.uid()) then
    raise exception 'Account restricted';
  end if;
  if p_size not in (4, 8, 16, 32) then
    raise exception 'A tournament has 4, 8, 16 or 32 pilots';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 3 and 60 then
    raise exception 'Tournament name must be 3 to 60 characters';
  end if;
  if (select count(*) from tournaments
       where organizer_id = auth.uid() and status in ('registration', 'running')) >= 3 then
    raise exception 'Too many open tournaments';
  end if;

  insert into tournaments (organizer_id, track_id, name, size, format, starts_at, message, is_private)
  values (auth.uid(), p_track_id, trim(p_name), p_size, p_format, p_starts_at, nullif(trim(p_message), ''),
          coalesce(p_is_private, false))
  returning id into v_id;
  insert into tournament_entries (tournament_id, pilot_id) values (v_id, auth.uid());
  return v_id;
end $$;
revoke execute on function public.create_tournament(uuid, text, int, public.race_format, timestamptz, text, boolean)
  from public, anon;
grant execute on function public.create_tournament(uuid, text, int, public.race_format, timestamptz, text, boolean)
  to authenticated;

-- Modification : la visibilité se change tant que les inscriptions sont ouvertes.
create or replace function public.update_tournament(p_tournament_id uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  v_name text;
begin
  select * into t from tournaments where id = p_tournament_id for update;
  if t.id is null then
    raise exception 'Tournament not found';
  end if;
  if t.organizer_id <> auth.uid() and not public.is_app_admin() then
    raise exception 'Only the organizer can edit the tournament';
  end if;
  if t.status in ('completed', 'cancelled') then
    raise exception 'Tournament is over';
  end if;
  v_name := case when p_data ? 'name' then btrim(p_data->>'name') else t.name end;
  if char_length(coalesce(v_name, '')) not between 3 and 60 then
    raise exception 'Tournament name must be 3 to 60 characters';
  end if;

  update tournaments set
    name       = v_name,
    starts_at  = case when p_data ? 'starts_at' then nullif(p_data->>'starts_at', '')::timestamptz else starts_at end,
    message    = case when p_data ? 'message' then nullif(left(btrim(p_data->>'message'), 280), '') else message end,
    banner_url = case when p_data ? 'banner_url' then nullif(p_data->>'banner_url', '') else banner_url end,
    is_private = case when p_data ? 'is_private' and t.status = 'registration'
                      then coalesce((p_data->>'is_private')::boolean, is_private) else is_private end
  where id = t.id;
end $$;

-- ========== INVITATIONS ==========
create or replace function public.invite_to_tournament(p_tournament_id uuid, p_pilot_ids uuid[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  v_new uuid[];
begin
  if auth.uid() is null or public.is_restricted(auth.uid()) then
    raise exception 'Account restricted';
  end if;
  select * into t from tournaments where id = p_tournament_id for update;
  if t.id is null then
    raise exception 'Tournament not found';
  end if;
  if t.status <> 'registration' then
    raise exception 'Registrations are closed';
  end if;
  if t.organizer_id <> auth.uid()
     and (t.is_private
          or not exists (select 1 from tournament_entries where tournament_id = t.id and pilot_id = auth.uid())) then
    raise exception 'Only the organizer can invite to this tournament';
  end if;

  -- Ni soi-même, ni un inscrit, ni un pilote déjà invité (même s'il a refusé), ni un pilote bloqué.
  select array_agg(distinct p.id) into v_new
    from unnest(p_pilot_ids) x
    join profiles p on p.id = x
   where p.id <> auth.uid()
     and not exists (select 1 from tournament_entries e where e.tournament_id = t.id and e.pilot_id = p.id)
     and not exists (select 1 from tournament_invites i where i.tournament_id = t.id and i.pilot_id = p.id)
     and not public.is_blocked_between(auth.uid(), p.id);
  if v_new is null then
    return 0;
  end if;
  if (select count(*) from tournament_invites where tournament_id = t.id and status = 'pending')
     + array_length(v_new, 1) > 64 then
    raise exception 'Too many pending invitations';
  end if;

  insert into tournament_invites (tournament_id, pilot_id, invited_by)
    select t.id, x, auth.uid() from unnest(v_new) x;
  perform send_push(v_new, '🏆 Invitation à un tournoi',
    pilot_name(auth.uid()) || ' t’invite à ' || t.name || ' (' || track_name(t.track_id) || ')',
    '/tournament/' || t.id);
  return array_length(v_new, 1);
end $$;

create or replace function public.decline_tournament_invite(p_tournament_id uuid)
returns void
language sql security definer set search_path = public as $$
  update tournament_invites set status = 'declined'
   where tournament_id = p_tournament_id and pilot_id = auth.uid() and status = 'pending';
$$;

-- Retirer une invitation en attente : l'organisateur, ou celui qui l'a envoyée.
create or replace function public.revoke_tournament_invite(p_tournament_id uuid, p_pilot_id uuid)
returns void
language sql security definer set search_path = public as $$
  delete from tournament_invites i
   where i.tournament_id = p_tournament_id and i.pilot_id = p_pilot_id
     and (i.invited_by = auth.uid()
          or exists (select 1 from tournaments t where t.id = i.tournament_id and t.organizer_id = auth.uid()));
$$;

revoke execute on function public.invite_to_tournament(uuid, uuid[]), public.decline_tournament_invite(uuid),
  public.revoke_tournament_invite(uuid, uuid) from public, anon;
grant execute on function public.invite_to_tournament(uuid, uuid[]), public.decline_tournament_invite(uuid),
  public.revoke_tournament_invite(uuid, uuid) to authenticated;

-- Inscription : un tournoi privé demande une invitation (même refusée : on peut changer d'avis).
create or replace function public.join_tournament(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  v_count int;
begin
  if auth.uid() is null or public.is_restricted(auth.uid()) then
    raise exception 'Account restricted';
  end if;
  select * into t from tournaments where id = p_tournament_id for update;
  if t.id is null then
    raise exception 'Tournament not found';
  end if;
  if t.status <> 'registration' then
    raise exception 'Registrations are closed';
  end if;
  if exists (select 1 from tournament_entries where tournament_id = t.id and pilot_id = auth.uid()) then
    raise exception 'Already registered';
  end if;
  if t.is_private
     and not exists (select 1 from tournament_invites where tournament_id = t.id and pilot_id = auth.uid()) then
    raise exception 'Invitation required';
  end if;
  if exists (select 1 from tournament_entries e
              where e.tournament_id = t.id and public.is_blocked_between(e.pilot_id, auth.uid())) then
    raise exception 'Pilot unavailable';
  end if;
  select count(*) into v_count from tournament_entries where tournament_id = t.id;
  if v_count >= t.size then
    raise exception 'Tournament is full';
  end if;

  insert into tournament_entries (tournament_id, pilot_id) values (t.id, auth.uid());
  delete from tournament_invites where tournament_id = t.id and pilot_id = auth.uid();
  if v_count + 1 = t.size then
    perform tournament_launch(t.id); -- Tableau complet : le tirage se fait tout seul.
  end if;
end $$;

-- Quitter un tournoi privé garde la porte ouverte : l'invitation revient, en « refusée ».
create or replace function public.leave_tournament(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
begin
  select * into t from tournaments where id = p_tournament_id for update;
  if t.id is null then
    raise exception 'Tournament not found';
  end if;
  if t.status <> 'registration' then
    raise exception 'Registrations are closed';
  end if;
  if t.organizer_id = auth.uid() then
    raise exception 'The organizer cannot leave: cancel the tournament instead';
  end if;
  delete from tournament_entries where tournament_id = t.id and pilot_id = auth.uid();
  if found and t.is_private then
    insert into tournament_invites (tournament_id, pilot_id, invited_by, status)
    values (t.id, auth.uid(), t.organizer_id, 'declined') on conflict do nothing;
  end if;
end $$;

-- Tableau lancé ou tournoi annulé : les invitations en attente n'ont plus d'objet.
create or replace function public.clear_tournament_invites()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from tournament_invites where tournament_id = new.id and status = 'pending';
  return new;
end $$;
drop trigger if exists tournaments_clear_invites on public.tournaments;
create trigger tournaments_clear_invites after update of status on public.tournaments
  for each row when (old.status = 'registration' and new.status <> 'registration')
  execute function public.clear_tournament_invites();
