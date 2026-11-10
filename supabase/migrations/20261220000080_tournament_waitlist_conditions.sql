-- Kart Rivals : liste d'attente et conditions d'entrée des tournois.
--   - auto_start : le tableau se lance tout seul quand il est plein (comme avant), ou l'organisateur le lance lui-même.
--     Dans ce second cas, un tableau plein accepte des remplaçants : le premier de la liste prend la place d'un pilote
--     qui se désiste.
--   - min_elo / max_elo : tournoi réservé à une fourchette d'ELO (le rang découle de l'ELO : « Bronze à Or » se traduit
--     en ELO côté appli). Vérifié à l'inscription ; un pilote qui progresse ensuite garde sa place.

alter table public.tournaments
  add column if not exists auto_start boolean not null default true,
  add column if not exists min_elo int check (min_elo >= 0),
  add column if not exists max_elo int check (max_elo >= 0);
alter table public.tournaments drop constraint if exists tournaments_elo_range_check;
alter table public.tournaments add constraint tournaments_elo_range_check
  check (min_elo is null or max_elo is null or min_elo <= max_elo);

create table public.tournament_waitlist (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  pilot_id      uuid not null references public.profiles (id) on delete cascade,
  joined_at     timestamptz not null default now(),
  primary key (tournament_id, pilot_id)
);
create index tournament_waitlist_pilot_idx on public.tournament_waitlist (pilot_id);

alter table public.tournament_waitlist enable row level security;
revoke all on public.tournament_waitlist from anon, authenticated;
grant select on public.tournament_waitlist to authenticated;

-- Un remplaçant d'un tournoi privé continue de le voir.
create or replace function public.can_see_tournament(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tournaments t
     where t.id = p_tournament_id
       and (not t.is_private
            or t.organizer_id = auth.uid()
            or exists (select 1 from tournament_entries e where e.tournament_id = t.id and e.pilot_id = auth.uid())
            or exists (select 1 from tournament_invites i where i.tournament_id = t.id and i.pilot_id = auth.uid())
            or exists (select 1 from tournament_waitlist w where w.tournament_id = t.id and w.pilot_id = auth.uid())
            or public.is_app_admin())
  );
$$;

create policy "pilots read tournament waitlists" on public.tournament_waitlist
  for select to authenticated using (public.can_see_tournament(tournament_id));

-- Le pilote remplit-il les conditions d'entrée ?
create or replace function public.tournament_accepts(p_tournament_id uuid, p_pilot_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tournaments t join profiles p on p.id = p_pilot_id
     where t.id = p_tournament_id
       and (t.min_elo is null or p.elo >= t.min_elo)
       and (t.max_elo is null or p.elo <= t.max_elo)
  );
$$;
revoke execute on function public.tournament_accepts(uuid, uuid) from public, anon, authenticated;

-- ========== CRÉATION ==========
drop function if exists
  public.create_tournament(uuid, text, int, public.race_format, timestamptz, text, boolean, text, boolean, boolean);
create or replace function public.create_tournament(
  p_track_id uuid,
  p_name text,
  p_size int,
  p_format public.race_format default 'position',
  p_starts_at timestamptz default null,
  p_message text default null,
  p_is_private boolean default false,
  p_prize text default null,
  p_is_official boolean default false,
  p_participate boolean default true,
  p_auto_start boolean default true,
  p_min_elo int default null,
  p_max_elo int default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_official boolean := coalesce(p_is_official, false);
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
  if p_min_elo is not null and p_max_elo is not null and p_min_elo > p_max_elo then
    raise exception 'Invalid ELO range';
  end if;
  if v_official and not public.is_track_manager(p_track_id) then
    raise exception 'Only the track admins can organize an official tournament';
  end if;
  if (select count(*) from tournaments
       where organizer_id = auth.uid() and status in ('registration', 'running')) >= (case when v_official then 10 else 3 end) then
    raise exception 'Too many open tournaments';
  end if;

  insert into tournaments (organizer_id, track_id, name, size, format, starts_at, message, is_private, prize, is_official,
                           auto_start, min_elo, max_elo)
  values (auth.uid(), p_track_id, trim(p_name), p_size, p_format, p_starts_at, nullif(trim(p_message), ''),
          coalesce(p_is_private, false) and not v_official, nullif(left(trim(p_prize), 120), ''), v_official,
          coalesce(p_auto_start, true), p_min_elo, p_max_elo)
  returning id into v_id;

  -- L'organisateur roule s'il le veut (tournoi officiel) et s'il remplit ses propres conditions ; sinon il arbitre,
  -- et reste dans la discussion.
  if (not v_official or coalesce(p_participate, true)) and public.tournament_accepts(v_id, auth.uid()) then
    insert into tournament_entries (tournament_id, pilot_id) values (v_id, auth.uid());
  else
    insert into conversation_members (conversation_id, profile_id)
      select c.id, auth.uid() from conversations c where c.tournament_id = v_id
    on conflict do nothing;
  end if;

  if v_official then
    perform send_push(
      array(select p.id from profiles p
             where p.promo_push is true and p.banned_at is null and not p.is_demo and p.id <> auth.uid()
               and public.is_track_pilot(p_track_id, p.id)
               and public.tournament_accepts(v_id, p.id)),
      '🏆 Tournoi officiel · ' || track_name(p_track_id),
      trim(p_name) || coalesce(' · à gagner : ' || nullif(left(trim(p_prize), 120), ''), '') || '. Inscriptions ouvertes.',
      '/tournament/' || v_id);
  end if;
  return v_id;
end $$;
revoke execute on function public.create_tournament(uuid, text, int, public.race_format, timestamptz, text, boolean, text,
  boolean, boolean, boolean, int, int) from public, anon;
grant execute on function public.create_tournament(uuid, text, int, public.race_format, timestamptz, text, boolean, text,
  boolean, boolean, boolean, int, int) to authenticated;

-- ========== INSCRIPTION ==========
-- Renvoie 'registered', ou 'waitlisted' si le tableau est plein et que l'organisateur le lance lui-même.
drop function if exists public.join_tournament(uuid);
create or replace function public.join_tournament(p_tournament_id uuid)
returns text
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
  if exists (select 1 from tournament_waitlist where tournament_id = t.id and pilot_id = auth.uid()) then
    raise exception 'Already on the waiting list';
  end if;
  if t.is_private
     and not exists (select 1 from tournament_invites where tournament_id = t.id and pilot_id = auth.uid()) then
    raise exception 'Invitation required';
  end if;
  if not public.tournament_accepts(t.id, auth.uid()) then
    raise exception 'Entry conditions not met';
  end if;
  if exists (select 1 from tournament_entries e
              where e.tournament_id = t.id and public.is_blocked_between(e.pilot_id, auth.uid())) then
    raise exception 'Pilot unavailable';
  end if;
  select count(*) into v_count from tournament_entries where tournament_id = t.id;

  if v_count >= t.size then
    if t.auto_start then
      raise exception 'Tournament is full';
    end if;
    if (select count(*) from tournament_waitlist where tournament_id = t.id) >= t.size then
      raise exception 'Waiting list is full';
    end if;
    insert into tournament_waitlist (tournament_id, pilot_id) values (t.id, auth.uid());
    delete from tournament_invites where tournament_id = t.id and pilot_id = auth.uid();
    return 'waitlisted';
  end if;

  insert into tournament_entries (tournament_id, pilot_id) values (t.id, auth.uid());
  delete from tournament_invites where tournament_id = t.id and pilot_id = auth.uid();
  if v_count + 1 = t.size then
    if t.auto_start then
      perform tournament_launch(t.id); -- Tableau complet : le tirage se fait tout seul.
    else
      perform send_push(array[t.organizer_id], '🏆 Tableau complet',
        t.name || ' affiche complet : tu peux lancer le tableau.', '/tournament/' || t.id);
    end if;
  end if;
  return 'registered';
end $$;
revoke execute on function public.join_tournament(uuid) from public, anon;
grant execute on function public.join_tournament(uuid) to authenticated;

-- Désistement : le premier remplaçant prend la place. Quitter la liste d'attente passe par la même fonction.
create or replace function public.leave_tournament(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  v_next uuid;
  v_left boolean;
begin
  select * into t from tournaments where id = p_tournament_id for update;
  if t.id is null then
    raise exception 'Tournament not found';
  end if;
  if t.status <> 'registration' then
    raise exception 'Registrations are closed';
  end if;

  delete from tournament_waitlist where tournament_id = t.id and pilot_id = auth.uid();
  if found then
    v_left := true;
  else
    if t.organizer_id = auth.uid() and not t.is_official then
      raise exception 'The organizer cannot leave: cancel the tournament instead';
    end if;
    delete from tournament_entries where tournament_id = t.id and pilot_id = auth.uid();
    v_left := found;
    if v_left then
      -- Premier remplaçant (hors pilote bloqué avec un inscrit).
      select w.pilot_id into v_next
        from tournament_waitlist w
       where w.tournament_id = t.id
         and not exists (select 1 from tournament_entries e
                          where e.tournament_id = t.id and public.is_blocked_between(e.pilot_id, w.pilot_id))
       order by w.joined_at
       limit 1;
      if v_next is not null then
        delete from tournament_waitlist where tournament_id = t.id and pilot_id = v_next;
        insert into tournament_entries (tournament_id, pilot_id) values (t.id, v_next);
        perform send_push(array[v_next], '🏆 Une place s’est libérée',
          'Tu es inscrit à ' || t.name || ' (' || track_name(t.track_id) || ').', '/tournament/' || t.id);
      end if;
    end if;
  end if;

  if v_left and t.is_private then
    insert into tournament_invites (tournament_id, pilot_id, invited_by, status)
    values (t.id, auth.uid(), t.organizer_id, 'declined') on conflict do nothing;
  end if;
end $$;

-- Tableau lancé ou tournoi annulé : la liste d'attente est vidée, les remplaçants sont prévenus.
create or replace function public.clear_tournament_invites()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_waiting uuid[];
begin
  delete from tournament_invites where tournament_id = new.id and status = 'pending';
  with gone as (delete from tournament_waitlist where tournament_id = new.id returning pilot_id)
  select array_agg(pilot_id) into v_waiting from gone;
  if v_waiting is not null and new.status = 'running' then
    perform send_push(v_waiting, '🏆 ' || new.name,
      'Le tableau est lancé sans désistement : pas de place cette fois.', '/tournament/' || new.id);
  end if;
  return new;
end $$;

-- Invitations : inutile d'inviter un pilote hors conditions.
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

  select array_agg(distinct p.id) into v_new
    from unnest(p_pilot_ids) x
    join profiles p on p.id = x
   where p.id <> auth.uid()
     and not exists (select 1 from tournament_entries e where e.tournament_id = t.id and e.pilot_id = p.id)
     and not exists (select 1 from tournament_waitlist w where w.tournament_id = t.id and w.pilot_id = p.id)
     and not exists (select 1 from tournament_invites i where i.tournament_id = t.id and i.pilot_id = p.id)
     and not public.is_blocked_between(auth.uid(), p.id)
     and public.tournament_accepts(t.id, p.id);
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

-- Modification : le mode de lancement se change tant que les inscriptions sont ouvertes.
create or replace function public.update_tournament(p_tournament_id uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  v_name text;
  v_auto boolean;
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
  v_auto := case when p_data ? 'auto_start' and t.status = 'registration'
                 then coalesce((p_data->>'auto_start')::boolean, t.auto_start) else t.auto_start end;

  update tournaments set
    name       = v_name,
    starts_at  = case when p_data ? 'starts_at' then nullif(p_data->>'starts_at', '')::timestamptz else starts_at end,
    message    = case when p_data ? 'message' then nullif(left(btrim(p_data->>'message'), 280), '') else message end,
    banner_url = case when p_data ? 'banner_url' then nullif(p_data->>'banner_url', '') else banner_url end,
    prize      = case when p_data ? 'prize' then nullif(left(btrim(p_data->>'prize'), 120), '') else prize end,
    is_private = case when p_data ? 'is_private' and t.status = 'registration' and not t.is_official
                      then coalesce((p_data->>'is_private')::boolean, is_private) else is_private end,
    auto_start = v_auto
  where id = t.id;

  -- Repassé en lancement automatique alors que le tableau est déjà plein : il part tout de suite.
  if v_auto and not t.auto_start and t.status = 'registration'
     and (select count(*) from tournament_entries where tournament_id = t.id) >= t.size then
    perform tournament_launch(t.id);
  end if;
end $$;
