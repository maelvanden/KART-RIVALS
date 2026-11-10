-- Kart Rivals : tournois officiels et lot du vainqueur.
--   - prize : le lot affiché sur le tournoi (tout organisateur peut en indiquer un).
--   - is_official : tournoi organisé par le karting lui-même (admin de la fiche circuit ou admin appli). Toujours
--     public, mis en avant dans les listes, annoncé aux pilotes du circuit qui ont accepté les notifications promo.
--     L'organisateur n'est pas inscrit d'office : il arbitre, et peut s'inscrire comme les autres s'il veut rouler.

alter table public.tournaments
  add column if not exists prize text check (char_length(prize) <= 120),
  add column if not exists is_official boolean not null default false;
alter table public.tournaments drop constraint if exists tournaments_official_public_check;
alter table public.tournaments add constraint tournaments_official_public_check check (not (is_official and is_private));
create index if not exists tournaments_track_open_idx on public.tournaments (track_id) where status in ('registration', 'running');

-- ========== CRÉATION ==========
-- Les anciennes signatures sont retirées : les appels sans les nouveaux paramètres tombent sur celle-ci (valeurs par défaut).
drop function if exists public.create_tournament(uuid, text, int, public.race_format, timestamptz, text, boolean);
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
  p_participate boolean default true
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
  if v_official and not public.is_track_manager(p_track_id) then
    raise exception 'Only the track admins can organize an official tournament';
  end if;
  if (select count(*) from tournaments
       where organizer_id = auth.uid() and status in ('registration', 'running')) >= (case when v_official then 10 else 3 end) then
    raise exception 'Too many open tournaments';
  end if;

  insert into tournaments (organizer_id, track_id, name, size, format, starts_at, message, is_private, prize, is_official)
  values (auth.uid(), p_track_id, trim(p_name), p_size, p_format, p_starts_at, nullif(trim(p_message), ''),
          coalesce(p_is_private, false) and not v_official, nullif(left(trim(p_prize), 120), ''), v_official)
  returning id into v_id;
  -- Un tournoi ordinaire inscrit toujours son organisateur ; le karting choisit.
  if not v_official or coalesce(p_participate, true) then
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
               and public.is_track_pilot(p_track_id, p.id)),
      '🏆 Tournoi officiel · ' || track_name(p_track_id),
      trim(p_name) || coalesce(' · à gagner : ' || nullif(left(trim(p_prize), 120), ''), '') || '. Inscriptions ouvertes.',
      '/tournament/' || v_id);
  end if;
  return v_id;
end $$;
revoke execute on function
  public.create_tournament(uuid, text, int, public.race_format, timestamptz, text, boolean, text, boolean, boolean)
  from public, anon;
grant execute on function
  public.create_tournament(uuid, text, int, public.race_format, timestamptz, text, boolean, text, boolean, boolean)
  to authenticated;

-- ========== MODIFICATION : le lot en plus ; un tournoi officiel reste public ==========
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
    prize      = case when p_data ? 'prize' then nullif(left(btrim(p_data->>'prize'), 120), '') else prize end,
    is_private = case when p_data ? 'is_private' and t.status = 'registration' and not t.is_official
                      then coalesce((p_data->>'is_private')::boolean, is_private) else is_private end
  where id = t.id;
end $$;

-- ========== ORGANISATEUR NON INSCRIT ==========
-- Il reste dans la discussion même s'il s'inscrit puis se désinscrit.
create or replace function public.sync_tournament_chat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into conversation_members (conversation_id, profile_id)
      select c.id, new.pilot_id from conversations c where c.tournament_id = new.tournament_id
    on conflict do nothing;
    return new;
  end if;
  delete from conversation_members m using conversations c
   where c.tournament_id = old.tournament_id and m.conversation_id = c.id and m.profile_id = old.pilot_id
     and not exists (select 1 from tournaments t where t.id = old.tournament_id and t.organizer_id = old.pilot_id);
  return old;
end $$;

-- Le karting qui s'était inscrit à son propre tournoi officiel peut se désinscrire (il reste organisateur).
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
  if t.organizer_id = auth.uid() and not t.is_official then
    raise exception 'The organizer cannot leave: cancel the tournament instead';
  end if;
  delete from tournament_entries where tournament_id = t.id and pilot_id = auth.uid();
  if found and t.is_private then
    insert into tournament_invites (tournament_id, pilot_id, invited_by, status)
    values (t.id, auth.uid(), t.organizer_id, 'declined') on conflict do nothing;
  end if;
end $$;
