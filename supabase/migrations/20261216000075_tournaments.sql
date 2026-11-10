-- Kart Rivals : tournois à élimination directe (tableau de 8 ou 16 pilotes sur un circuit).
-- Inscriptions ouvertes ; le tableau est tiré par ELO (tête de série 1 contre la dernière) au lancement.
-- Chaque duel du tableau est un défi ordinaire, déjà accepté : saisie, validation, contestation et ELO
-- passent par les fonctions existantes. Le vainqueur validé monte automatiquement au tour suivant.
-- Pas d'égalité possible en tournoi. Trophée et points garage pour le vainqueur et le finaliste.

alter type public.point_reason add value if not exists 'tournament';

create type public.tournament_status as enum ('registration', 'running', 'completed', 'cancelled');

create table public.tournaments (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  track_id     uuid not null references public.tracks (id),
  name         text not null check (char_length(name) between 3 and 60),
  size         smallint not null check (size in (8, 16)),
  format       public.race_format not null default 'position',
  starts_at    timestamptz,
  message      text check (char_length(message) <= 280),
  status       public.tournament_status not null default 'registration',
  champion_id  uuid references public.profiles (id) on delete set null,
  runner_up_id uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  completed_at timestamptz
);
create index tournaments_status_idx on public.tournaments (status, created_at desc);
create index tournaments_track_idx on public.tournaments (track_id, status);
create index tournaments_champion_idx on public.tournaments (champion_id) where champion_id is not null;

create table public.tournament_entries (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  pilot_id      uuid not null references public.profiles (id) on delete cascade,
  seed          smallint,
  elo_at_start  int,
  joined_at     timestamptz not null default now(),
  primary key (tournament_id, pilot_id)
);
create index tournament_entries_pilot_idx on public.tournament_entries (pilot_id);

-- Une ligne par case du tableau, créées toutes au lancement (round 1 = premier tour, le dernier = finale).
create table public.tournament_matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round         smallint not null check (round between 1 and 4),
  slot          smallint not null check (slot >= 0),
  pilot_a       uuid references public.profiles (id) on delete set null,
  pilot_b       uuid references public.profiles (id) on delete set null,
  challenge_id  uuid unique references public.challenges (id) on delete set null,
  winner_id     uuid references public.profiles (id) on delete set null,
  -- race : duel validé ; forfeit : abandon ou forfait prononcé ; bye : qualifié d'office (case vide).
  outcome       text check (outcome in ('race', 'forfeit', 'bye')),
  decided_at    timestamptz,
  unique (tournament_id, round, slot)
);

-- Le défi garde la trace de son tournoi (affichage, et garde-fous ci-dessous).
alter table public.challenges add column tournament_id uuid references public.tournaments (id) on delete set null;
create index challenges_tournament_idx on public.challenges (tournament_id) where tournament_id is not null;

-- ========== SÉCURITÉ : lecture pour tous les pilotes connectés, écritures via les fonctions ==========
alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_matches enable row level security;
revoke all on public.tournaments, public.tournament_entries, public.tournament_matches from anon, authenticated;
grant select on public.tournaments, public.tournament_entries, public.tournament_matches to authenticated;

create policy "pilots read tournaments" on public.tournaments for select to authenticated using (true);
create policy "pilots read tournament entries" on public.tournament_entries for select to authenticated using (true);
create policy "pilots read tournament brackets" on public.tournament_matches for select to authenticated using (true);

-- ========== MOTEUR DU TABLEAU (interne) ==========
create or replace function public.tournament_rounds(p_size int)
returns int language sql immutable as $$
  select case p_size when 16 then 4 else 3 end;
$$;

create or replace function public.tournament_round_label(p_round int, p_rounds int)
returns text language sql immutable as $$
  select case p_rounds - p_round
    when 0 then 'Finale'
    when 1 then 'Demi-finale'
    when 2 then 'Quart de finale'
    else 'Huitième de finale'
  end;
$$;

-- Ordre des têtes de série sur le tableau : 8 → {1,8,4,5,2,7,3,6}. Les deux meilleurs ne se croisent qu'en finale.
create or replace function public.tournament_seed_order(p_size int)
returns int[] language plpgsql immutable as $$
declare
  v int[] := array[1, 2];
  n int := 2;
  nxt int[];
  s int;
begin
  while n < p_size loop
    n := n * 2;
    nxt := '{}';
    foreach s in array v loop
      nxt := nxt || array[s, n + 1 - s];
    end loop;
    v := nxt;
  end loop;
  return v;
end $$;

create or replace function public.tournament_resolve(p_match_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  tm tournament_matches;
  t tournaments;
  v_challenge uuid;
begin
  select * into tm from tournament_matches where id = p_match_id for update;
  if tm.decided_at is not null or tm.challenge_id is not null then
    return;
  end if;
  select * into t from tournaments where id = tm.tournament_id;
  if t.status <> 'running' then
    return;
  end if;

  if tm.pilot_a is not null and tm.pilot_b is not null then
    insert into challenges (challenger_id, opponent_id, track_id, scheduled_at, format, message, status, responded_at, tournament_id)
    values (tm.pilot_a, tm.pilot_b, t.track_id, t.starts_at, t.format,
            left('🏆 ' || t.name || ' · ' || tournament_round_label(tm.round, tournament_rounds(t.size)), 280),
            'accepted', now(), t.id)
    returning id into v_challenge;
    update tournament_matches set challenge_id = v_challenge where id = tm.id;
    perform send_push(array[tm.pilot_a, tm.pilot_b],
      '🏆 ' || tournament_round_label(tm.round, tournament_rounds(t.size)),
      pilot_name(tm.pilot_a) || ' contre ' || pilot_name(tm.pilot_b) || ' · ' || t.name || ' à ' || track_name(t.track_id),
      '/challenge/' || v_challenge);
  else
    -- Case vide en face : qualifié d'office (ou case vide qui remonte, si personne).
    perform tournament_decide(tm.id, coalesce(tm.pilot_a, tm.pilot_b), 'bye');
  end if;
end $$;

create or replace function public.tournament_decide(p_match_id uuid, p_winner uuid, p_outcome text) returns void
language plpgsql security definer set search_path = public as $$
declare
  tm tournament_matches;
  t tournaments;
  v_rounds int;
  v_loser uuid;
  v_next uuid;
  v_sibling_done boolean;
begin
  select * into t from tournaments
   where id = (select tournament_id from tournament_matches where id = p_match_id) for update;
  if t.status is distinct from 'running' then
    return; -- Tournoi annulé entre-temps : plus rien ne bouge.
  end if;
  update tournament_matches
     set winner_id = p_winner, outcome = p_outcome, decided_at = now()
   where id = p_match_id and decided_at is null
  returning * into tm;
  if tm.id is null then
    return;
  end if;
  v_rounds := tournament_rounds(t.size);

  if tm.round = v_rounds then
    v_loser := case when p_winner = tm.pilot_a then tm.pilot_b else tm.pilot_a end;
    update tournaments
       set status = 'completed', champion_id = p_winner, runner_up_id = v_loser, completed_at = now()
     where id = t.id;
    if p_winner is not null then
      insert into point_transactions (profile_id, amount, reason) values (p_winner, 300, 'tournament');
    end if;
    if v_loser is not null then
      insert into point_transactions (profile_id, amount, reason) values (v_loser, 100, 'tournament');
    end if;
    perform send_push(array(select pilot_id from tournament_entries where tournament_id = t.id),
      '🏆 ' || pilot_name(p_winner) || ' remporte le tournoi',
      t.name || ' à ' || track_name(t.track_id) || ' : le trophée est attribué.',
      '/tournament/' || t.id);
    return;
  end if;

  -- Le vainqueur prend sa place au tour suivant (case paire = pilote A, impaire = pilote B).
  update tournament_matches
     set pilot_a = case when tm.slot % 2 = 0 then p_winner else pilot_a end,
         pilot_b = case when tm.slot % 2 = 1 then p_winner else pilot_b end
   where tournament_id = t.id and round = tm.round + 1 and slot = tm.slot / 2
  returning id into v_next;

  select decided_at is not null into v_sibling_done
    from tournament_matches
   where tournament_id = t.id and round = tm.round and slot = (tm.slot # 1);
  if v_sibling_done then
    perform tournament_resolve(v_next);
  end if;
end $$;

create or replace function public.tournament_launch(p_tournament_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  v_order int[];
  v_rounds int;
  v_pilots uuid[];
  r int;
  s int;
  m record;
begin
  select * into t from tournaments where id = p_tournament_id for update;
  if t.status <> 'registration' then
    return;
  end if;
  v_rounds := tournament_rounds(t.size);
  v_order := tournament_seed_order(t.size);

  -- Têtes de série par ELO au lancement (à égalité : premier inscrit).
  with ranked as (
    select e.pilot_id, p.elo, row_number() over (order by p.elo desc, e.joined_at) as seed
      from tournament_entries e join profiles p on p.id = e.pilot_id
     where e.tournament_id = t.id
  )
  update tournament_entries e set seed = r2.seed, elo_at_start = r2.elo
    from ranked r2
   where e.tournament_id = t.id and e.pilot_id = r2.pilot_id;

  select array_agg(pilot_id order by seed) into v_pilots from tournament_entries where tournament_id = t.id;

  update tournaments set status = 'running', started_at = now() where id = t.id;

  for r in 1..v_rounds loop
    for s in 0..(t.size / power(2, r)::int - 1) loop
      insert into tournament_matches (tournament_id, round, slot, pilot_a, pilot_b)
      values (t.id, r, s,
              case when r = 1 then v_pilots[v_order[2 * s + 1]] end,
              case when r = 1 then v_pilots[v_order[2 * s + 2]] end);
    end loop;
  end loop;

  for m in select id from tournament_matches where tournament_id = t.id and round = 1 order by slot loop
    perform tournament_resolve(m.id);
  end loop;
end $$;

revoke execute on function public.tournament_resolve(uuid), public.tournament_decide(uuid, uuid, text),
  public.tournament_launch(uuid) from public, anon, authenticated;

-- ========== ACTIONS DES PILOTES ==========
create or replace function public.create_tournament(
  p_track_id uuid,
  p_name text,
  p_size int,
  p_format public.race_format default 'position',
  p_starts_at timestamptz default null,
  p_message text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or public.is_restricted(auth.uid()) then
    raise exception 'Account restricted';
  end if;
  if p_size not in (8, 16) then
    raise exception 'A tournament has 8 or 16 pilots';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 3 and 60 then
    raise exception 'Tournament name must be 3 to 60 characters';
  end if;
  if (select count(*) from tournaments
       where organizer_id = auth.uid() and status in ('registration', 'running')) >= 3 then
    raise exception 'Too many open tournaments';
  end if;

  insert into tournaments (organizer_id, track_id, name, size, format, starts_at, message)
  values (auth.uid(), p_track_id, trim(p_name), p_size, p_format, p_starts_at, nullif(trim(p_message), ''))
  returning id into v_id;
  insert into tournament_entries (tournament_id, pilot_id) values (v_id, auth.uid());
  return v_id;
end $$;

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
  if exists (select 1 from tournament_entries e
              where e.tournament_id = t.id and public.is_blocked_between(e.pilot_id, auth.uid())) then
    raise exception 'Pilot unavailable';
  end if;
  select count(*) into v_count from tournament_entries where tournament_id = t.id;
  if v_count >= t.size then
    raise exception 'Tournament is full';
  end if;

  insert into tournament_entries (tournament_id, pilot_id) values (t.id, auth.uid());
  if v_count + 1 = t.size then
    perform tournament_launch(t.id); -- Tableau complet : le tirage se fait tout seul.
  end if;
end $$;

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
end $$;

-- Lancement anticipé par l'organisateur : au moins 4 pilotes sur 8, ou 9 sur 16 (sinon, un tableau de 8 suffit).
create or replace function public.start_tournament(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  v_count int;
begin
  select * into t from tournaments where id = p_tournament_id for update;
  if t.id is null then
    raise exception 'Tournament not found';
  end if;
  if t.organizer_id <> auth.uid() then
    raise exception 'Only the organizer can start the tournament';
  end if;
  if t.status <> 'registration' then
    raise exception 'Registrations are closed';
  end if;
  select count(*) into v_count from tournament_entries where tournament_id = t.id;
  if v_count < (case t.size when 16 then 9 else 4 end) then
    raise exception 'Not enough pilots to start';
  end if;
  perform tournament_launch(t.id);
end $$;

-- Annulation : l'organisateur pendant les inscriptions, un admin à tout moment. Les duels en cours sont annulés.
create or replace function public.cancel_tournament(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
begin
  select * into t from tournaments where id = p_tournament_id for update;
  if t.id is null then
    raise exception 'Tournament not found';
  end if;
  if not public.is_app_admin() then
    if t.organizer_id <> auth.uid() then
      raise exception 'Only the organizer can cancel the tournament';
    end if;
    if t.status <> 'registration' then
      raise exception 'A running tournament cannot be cancelled';
    end if;
  end if;
  if t.status in ('completed', 'cancelled') then
    raise exception 'Tournament is over';
  end if;

  update tournaments set status = 'cancelled' where id = t.id;
  update challenges c set status = 'cancelled'
   where c.tournament_id = t.id and c.status in ('pending', 'accepted')
     and not exists (select 1 from matches m where m.challenge_id = c.id and m.status = 'awaiting_confirmation');
  perform send_push(array(select pilot_id from tournament_entries where tournament_id = t.id and pilot_id <> auth.uid()),
    '🏆 Tournoi annulé', t.name || ' à ' || track_name(t.track_id) || ' est annulé.', '/tournament/' || t.id);
end $$;

-- Abandon d'un duel du tableau : l'adversaire est qualifié.
create or replace function public.forfeit_tournament_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  tm tournament_matches;
begin
  select * into tm from tournament_matches where id = p_match_id for update;
  if tm.id is null or auth.uid() not in (tm.pilot_a, tm.pilot_b) then
    raise exception 'Tournament match not found';
  end if;
  if tm.decided_at is not null or tm.challenge_id is null then
    raise exception 'This duel is not being played';
  end if;
  if exists (select 1 from matches where challenge_id = tm.challenge_id and status = 'awaiting_confirmation') then
    raise exception 'A result is awaiting confirmation';
  end if;
  perform tournament_decide(tm.id, case when auth.uid() = tm.pilot_a then tm.pilot_b else tm.pilot_a end, 'forfeit');
  update challenges set status = 'cancelled' where id = tm.challenge_id;
end $$;

-- Forfait prononcé par l'organisateur (s'il ne joue pas ce duel) ou un admin, quand un pilote ne se présente pas.
create or replace function public.award_tournament_walkover(p_match_id uuid, p_winner_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  tm tournament_matches;
  t tournaments;
begin
  select * into tm from tournament_matches where id = p_match_id for update;
  select * into t from tournaments where id = tm.tournament_id;
  if tm.id is null then
    raise exception 'Tournament match not found';
  end if;
  if not public.is_app_admin()
     and (t.organizer_id <> auth.uid() or auth.uid() in (tm.pilot_a, tm.pilot_b)) then
    raise exception 'Only the organizer can award a walkover';
  end if;
  if tm.decided_at is not null or tm.challenge_id is null then
    raise exception 'This duel is not being played';
  end if;
  if p_winner_id not in (tm.pilot_a, tm.pilot_b) then
    raise exception 'Tournament match not found';
  end if;
  if exists (select 1 from matches where challenge_id = tm.challenge_id and status = 'awaiting_confirmation') then
    raise exception 'A result is awaiting confirmation';
  end if;
  perform tournament_decide(tm.id, p_winner_id, 'forfeit');
  update challenges set status = 'cancelled' where id = tm.challenge_id;
end $$;

revoke execute on function public.create_tournament(uuid, text, int, public.race_format, timestamptz, text),
  public.join_tournament(uuid), public.leave_tournament(uuid), public.start_tournament(uuid),
  public.cancel_tournament(uuid), public.forfeit_tournament_match(uuid), public.award_tournament_walkover(uuid, uuid)
  from public, anon;
grant execute on function public.create_tournament(uuid, text, int, public.race_format, timestamptz, text),
  public.join_tournament(uuid), public.leave_tournament(uuid), public.start_tournament(uuid),
  public.cancel_tournament(uuid), public.forfeit_tournament_match(uuid), public.award_tournament_walkover(uuid, uuid)
  to authenticated;

-- ========== LIEN AVEC LES DÉFIS ==========
-- Pas d'égalité en tournoi : il faut un vainqueur pour monter au tour suivant.
create or replace function public.tournament_match_needs_winner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.winner_id is null
     and exists (select 1 from challenges where id = new.challenge_id and tournament_id is not null) then
    raise exception 'A tournament duel cannot end in a tie';
  end if;
  return new;
end $$;
drop trigger if exists matches_tournament_winner on public.matches;
create trigger matches_tournament_winner before insert or update of winner_id on public.matches
  for each row execute function public.tournament_match_needs_winner();

-- Un duel de tableau ne s'annule pas comme un défi : on abandonne (forfeit_tournament_match).
-- Seuls un admin, un tournoi annulé ou un duel déjà tranché passent.
create or replace function public.guard_tournament_challenge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and new.tournament_id is not null
     and not public.is_app_admin()
     and exists (select 1 from tournaments where id = new.tournament_id and status = 'running')
     and exists (select 1 from tournament_matches where challenge_id = new.id and decided_at is null) then
    raise exception 'Tournament duels cannot be cancelled: forfeit instead';
  end if;
  return new;
end $$;
drop trigger if exists challenges_tournament_guard on public.challenges;
create trigger challenges_tournament_guard before update of status on public.challenges
  for each row execute function public.guard_tournament_challenge();

-- Duel validé : le vainqueur monte. Duel annulé par un admin (résultat annulé) : on le rejoue.
create or replace function public.advance_tournament_on_challenge()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tm tournament_matches;
  v_winner uuid;
begin
  if new.tournament_id is null then
    return new;
  end if;
  select * into tm from tournament_matches where challenge_id = new.id and decided_at is null;
  if tm.id is null then
    return new;
  end if;

  if new.status = 'completed' then
    select winner_id into v_winner from matches where challenge_id = new.id and status = 'confirmed';
    if v_winner is not null then
      perform tournament_decide(tm.id, v_winner, 'race');
    end if;
  elsif new.status = 'cancelled' then
    update tournament_matches set challenge_id = null where id = tm.id;
    perform tournament_resolve(tm.id);
  end if;
  return new;
end $$;
drop trigger if exists challenges_tournament_advance on public.challenges;
create trigger challenges_tournament_advance after update of status on public.challenges
  for each row when (new.status is distinct from old.status)
  execute function public.advance_tournament_on_challenge();

-- Les duels de tableau restent « accepted » sans réponse attendue : rien à expirer.
