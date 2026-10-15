-- Kart Rivals : installation complète de la base (à coller tel quel dans Supabase > SQL Editor > Run).
-- Généré à partir de supabase/migrations/ ; à n'exécuter qu'une seule fois sur un projet vide.

-- Kart Rivals : schéma initial (circuits, licences pilotes, défis, matchs, historique ELO)

create extension if not exists postgis with schema extensions;

-- ========== ENUMS ==========
create type public.rank_tier as enum ('novice', 'bronze', 'argent', 'or', 'platine', 'diamant', 'legende');
create type public.challenge_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'completed');
create type public.match_status as enum ('awaiting_confirmation', 'confirmed', 'disputed');
create type public.race_format as enum ('position', 'lap_time');

-- ========== TRACKS ==========
create table public.tracks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text not null,
  region      text,
  address     text,
  location    extensions.geography(Point, 4326) not null,
  length_m    int check (length_m > 0),
  is_indoor   boolean not null default false,
  website     text,
  is_verified boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index tracks_location_idx on public.tracks using gist (location);

-- ========== PROFILES (licence de pilote) ==========
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  username            text unique not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  avatar_url          text,
  kart_number         smallint check (kart_number between 1 and 999),
  home_track_id       uuid references public.tracks (id) on delete set null,
  elo                 int not null default 1000,
  rank                public.rank_tier generated always as (
                        case
                          when elo < 1100 then 'novice'::public.rank_tier
                          when elo < 1250 then 'bronze'::public.rank_tier
                          when elo < 1400 then 'argent'::public.rank_tier
                          when elo < 1550 then 'or'::public.rank_tier
                          when elo < 1700 then 'platine'::public.rank_tier
                          when elo < 1850 then 'diamant'::public.rank_tier
                          else 'legende'::public.rank_tier
                        end
                      ) stored,
  wins                int not null default 0,
  losses              int not null default 0,
  draws               int not null default 0,
  matches_played      int generated always as (wins + losses + draws) stored,
  -- Position approximative (arrondie ~1 km côté client), jamais exposée directement.
  location            extensions.geography(Point, 4326),
  location_updated_at timestamptz,
  is_discoverable     boolean not null default true,
  expo_push_token     text,
  created_at          timestamptz not null default now()
);
create index profiles_location_idx on public.profiles using gist (location);
create index profiles_elo_idx on public.profiles (elo desc);
create index profiles_home_track_idx on public.profiles (home_track_id);

-- ========== CHALLENGES ==========
create table public.challenges (
  id            uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  opponent_id   uuid not null references public.profiles (id) on delete cascade,
  track_id      uuid not null references public.tracks (id),
  scheduled_at  timestamptz,
  format        public.race_format not null default 'position',
  message       text check (char_length(message) <= 280),
  status        public.challenge_status not null default 'pending',
  responded_at  timestamptz,
  expires_at    timestamptz not null default now() + interval '72 hours',
  created_at    timestamptz not null default now(),
  check (challenger_id <> opponent_id)
);
create index challenges_opponent_idx on public.challenges (opponent_id, status);
create index challenges_challenger_idx on public.challenges (challenger_id, status);

-- ========== MATCHES (feuille de temps) ==========
create table public.matches (
  id                      uuid primary key default gen_random_uuid(),
  challenge_id            uuid unique not null references public.challenges (id) on delete cascade,
  submitted_by            uuid not null references public.profiles (id),
  challenger_position     smallint check (challenger_position > 0),
  opponent_position       smallint check (opponent_position > 0),
  challenger_best_lap_ms  int check (challenger_best_lap_ms > 0),
  opponent_best_lap_ms    int check (opponent_best_lap_ms > 0),
  winner_id               uuid references public.profiles (id), -- null = égalité
  status                  public.match_status not null default 'awaiting_confirmation',
  challenger_confirmed_at timestamptz,
  opponent_confirmed_at   timestamptz,
  dispute_reason          text check (char_length(dispute_reason) <= 500),
  confirmed_at            timestamptz,
  created_at              timestamptz not null default now()
);

-- ========== ELO HISTORY ==========
create table public.elo_history (
  id         bigint generated always as identity primary key,
  match_id   uuid not null references public.matches (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  elo_before int not null,
  elo_after  int not null,
  delta      int generated always as (elo_after - elo_before) stored,
  k_factor   smallint not null,
  created_at timestamptz not null default now(),
  unique (match_id, profile_id)
);
create index elo_history_profile_idx on public.elo_history (profile_id, created_at desc);

-- Kart Rivals : droits par colonne + RLS.
-- Principe : les colonnes de classement (elo, wins, losses, draws) et les statuts de
-- défis/matchs ne sont jamais modifiables directement par le client ; seules les
-- fonctions RPC (security definer) les font évoluer.

alter table public.tracks enable row level security;
alter table public.profiles enable row level security;
alter table public.challenges enable row level security;
alter table public.matches enable row level security;
alter table public.elo_history enable row level security;

revoke all on public.tracks, public.profiles, public.challenges, public.matches, public.elo_history
  from anon, authenticated;

-- ========== TRACKS ==========
grant select on public.tracks to authenticated;
grant insert (name, city, region, address, location, length_m, is_indoor, website)
  on public.tracks to authenticated;

create policy "tracks readable by signed-in users" on public.tracks
  for select to authenticated using (true);
create policy "signed-in users can propose tracks" on public.tracks
  for insert to authenticated with check (created_by = auth.uid());

-- ========== PROFILES ==========
-- location et expo_push_token ne sont pas lisibles : la proximité passe par nearby_pilots().
grant select (id, username, avatar_url, kart_number, home_track_id, elo, rank, wins, losses,
              draws, matches_played, is_discoverable, created_at)
  on public.profiles to authenticated;
grant insert (id, username, avatar_url, kart_number, home_track_id, location,
              location_updated_at, is_discoverable, expo_push_token)
  on public.profiles to authenticated;
grant update (username, avatar_url, kart_number, home_track_id, location,
              location_updated_at, is_discoverable, expo_push_token)
  on public.profiles to authenticated;

create policy "profiles readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "users create their own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "users update their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ========== CHALLENGES ==========
-- Création directe ; réponse / annulation via respond_challenge() et cancel_challenge().
grant select on public.challenges to authenticated;
grant insert (opponent_id, track_id, scheduled_at, format, message)
  on public.challenges to authenticated;

create policy "participants read their challenges" on public.challenges
  for select to authenticated
  using (auth.uid() in (challenger_id, opponent_id));
create policy "users send challenges as themselves" on public.challenges
  for insert to authenticated
  with check (challenger_id = auth.uid() and status = 'pending');

-- ========== MATCHES ==========
-- Lecture seule ; saisie / validation via submit_match_result(), confirm_match(), dispute_match().
grant select on public.matches to authenticated;

create policy "participants read their matches" on public.matches
  for select to authenticated
  using (exists (
    select 1 from public.challenges c
    where c.id = challenge_id and auth.uid() in (c.challenger_id, c.opponent_id)
  ));

-- ========== ELO HISTORY ==========
grant select on public.elo_history to authenticated;

create policy "elo history is public to signed-in users" on public.elo_history
  for select to authenticated using (true);

-- Kart Rivals : fonctions RPC (défis, feuille de temps, moteur ELO, proximité, classements)

-- ========== DÉFIS ==========
create or replace function public.respond_challenge(p_challenge_id uuid, p_accept boolean)
returns public.challenges
language plpgsql security definer set search_path = public as $$
declare
  c challenges;
begin
  select * into c from challenges where id = p_challenge_id for update;
  if c.id is null or c.opponent_id <> auth.uid() then
    raise exception 'Challenge not found';
  end if;
  if c.status <> 'pending' then
    raise exception 'Challenge is no longer pending';
  end if;
  if c.expires_at < now() then
    update challenges set status = 'expired' where id = c.id returning * into c;
    return c;
  end if;

  update challenges
     set status = case when p_accept then 'accepted' else 'declined' end::challenge_status,
         responded_at = now()
   where id = c.id
  returning * into c;
  return c;
end $$;

create or replace function public.cancel_challenge(p_challenge_id uuid)
returns public.challenges
language plpgsql security definer set search_path = public as $$
declare
  c challenges;
begin
  select * into c from challenges where id = p_challenge_id for update;
  if c.id is null or auth.uid() not in (c.challenger_id, c.opponent_id) then
    raise exception 'Challenge not found';
  end if;
  if c.status not in ('pending', 'accepted') then
    raise exception 'Challenge cannot be cancelled';
  end if;
  if exists (select 1 from matches where challenge_id = c.id and status = 'awaiting_confirmation') then
    raise exception 'A result is awaiting confirmation';
  end if;

  update challenges set status = 'cancelled' where id = c.id returning * into c;
  return c;
end $$;

-- ========== FEUILLE DE TEMPS ==========
-- Saisit (ou ressaisit après contestation) le résultat. Le déclarant est réputé l'avoir confirmé.
create or replace function public.submit_match_result(
  p_challenge_id uuid,
  p_challenger_position smallint default null,
  p_opponent_position smallint default null,
  p_challenger_best_lap_ms int default null,
  p_opponent_best_lap_ms int default null
)
returns public.matches
language plpgsql security definer set search_path = public as $$
declare
  c challenges;
  m matches;
  v_winner uuid;
begin
  select * into c from challenges where id = p_challenge_id for update;
  if c.id is null or auth.uid() not in (c.challenger_id, c.opponent_id) then
    raise exception 'Challenge not found';
  end if;
  if c.status <> 'accepted' then
    raise exception 'Challenge must be accepted before submitting a result';
  end if;

  if c.format = 'position' then
    if p_challenger_position is null or p_opponent_position is null then
      raise exception 'Both positions are required';
    end if;
    v_winner := case
      when p_challenger_position < p_opponent_position then c.challenger_id
      when p_opponent_position < p_challenger_position then c.opponent_id
    end;
  else
    if p_challenger_best_lap_ms is null or p_opponent_best_lap_ms is null then
      raise exception 'Both lap times are required';
    end if;
    v_winner := case
      when p_challenger_best_lap_ms < p_opponent_best_lap_ms then c.challenger_id
      when p_opponent_best_lap_ms < p_challenger_best_lap_ms then c.opponent_id
    end;
  end if;

  select * into m from matches where challenge_id = c.id for update;
  if m.id is not null and m.status <> 'disputed' then
    raise exception 'A result has already been submitted';
  end if;

  insert into matches (
    challenge_id, submitted_by,
    challenger_position, opponent_position, challenger_best_lap_ms, opponent_best_lap_ms,
    winner_id, status, challenger_confirmed_at, opponent_confirmed_at, dispute_reason
  ) values (
    c.id, auth.uid(),
    p_challenger_position, p_opponent_position, p_challenger_best_lap_ms, p_opponent_best_lap_ms,
    v_winner, 'awaiting_confirmation',
    case when auth.uid() = c.challenger_id then now() end,
    case when auth.uid() = c.opponent_id then now() end,
    null
  )
  on conflict (challenge_id) do update set
    submitted_by = excluded.submitted_by,
    challenger_position = excluded.challenger_position,
    opponent_position = excluded.opponent_position,
    challenger_best_lap_ms = excluded.challenger_best_lap_ms,
    opponent_best_lap_ms = excluded.opponent_best_lap_ms,
    winner_id = excluded.winner_id,
    status = excluded.status,
    challenger_confirmed_at = excluded.challenger_confirmed_at,
    opponent_confirmed_at = excluded.opponent_confirmed_at,
    dispute_reason = null
  returning * into m;
  return m;
end $$;

create or replace function public.dispute_match(p_match_id uuid, p_reason text default null)
returns public.matches
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  c challenges;
begin
  select * into m from matches where id = p_match_id for update;
  select * into c from challenges where id = m.challenge_id;
  if m.id is null or auth.uid() not in (c.challenger_id, c.opponent_id) then
    raise exception 'Match not found';
  end if;
  if m.status <> 'awaiting_confirmation' then
    raise exception 'Match is not awaiting confirmation';
  end if;

  update matches
     set status = 'disputed', dispute_reason = p_reason,
         challenger_confirmed_at = null, opponent_confirmed_at = null
   where id = m.id
  returning * into m;
  return m;
end $$;

-- ========== MOTEUR ELO ==========
-- Enregistre la confirmation de l'appelant. Quand les deux pilotes ont confirmé, recalcule
-- l'ELO des deux dans la même transaction.
create or replace function public.confirm_match(p_match_id uuid)
returns public.matches
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  c challenges;
  a profiles;
  b profiles;
  ea numeric;
  sa numeric;
  ka int;
  kb int;
  new_a int;
  new_b int;
begin
  select * into m from matches where id = p_match_id for update;
  select * into c from challenges where id = m.challenge_id;
  if m.id is null or auth.uid() not in (c.challenger_id, c.opponent_id) then
    raise exception 'Match not found';
  end if;
  if m.status <> 'awaiting_confirmation' then
    raise exception 'Match is not awaiting confirmation';
  end if;

  if auth.uid() = c.challenger_id then
    update matches set challenger_confirmed_at = coalesce(challenger_confirmed_at, now())
     where id = m.id returning * into m;
  else
    update matches set opponent_confirmed_at = coalesce(opponent_confirmed_at, now())
     where id = m.id returning * into m;
  end if;

  if m.challenger_confirmed_at is null or m.opponent_confirmed_at is null then
    return m;
  end if;

  -- Verrouille les deux profils dans un ordre stable pour éviter les interblocages.
  perform 1 from profiles where id in (c.challenger_id, c.opponent_id) order by id for update;
  select * into a from profiles where id = c.challenger_id;
  select * into b from profiles where id = c.opponent_id;

  ea := 1 / (1 + power(10, (b.elo - a.elo) / 400.0));
  sa := case when m.winner_id = a.id then 1 when m.winner_id = b.id then 0 else 0.5 end;
  ka := case when a.matches_played < 10 then 40 when a.elo >= 1850 then 16 else 24 end;
  kb := case when b.matches_played < 10 then 40 when b.elo >= 1850 then 16 else 24 end;
  new_a := round(a.elo + ka * (sa - ea));
  new_b := round(b.elo + kb * ((1 - sa) - (1 - ea)));

  update profiles
     set elo = new_a,
         wins = wins + (sa = 1)::int,
         losses = losses + (sa = 0)::int,
         draws = draws + (sa = 0.5)::int
   where id = a.id;
  update profiles
     set elo = new_b,
         wins = wins + (sa = 0)::int,
         losses = losses + (sa = 1)::int,
         draws = draws + (sa = 0.5)::int
   where id = b.id;

  insert into elo_history (match_id, profile_id, elo_before, elo_after, k_factor)
  values (m.id, a.id, a.elo, new_a, ka), (m.id, b.id, b.elo, new_b, kb);

  update matches set status = 'confirmed', confirmed_at = now() where id = m.id returning * into m;
  update challenges set status = 'completed' where id = c.id;
  return m;
end $$;

-- ========== PROXIMITÉ ==========
create or replace function public.nearby_pilots(lat float, lng float, radius_km int default 30)
returns table (
  id uuid, username text, avatar_url text, elo int, rank public.rank_tier,
  wins int, losses int, distance_km numeric
)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.username, p.avatar_url, p.elo, p.rank, p.wins, p.losses,
         round((st_distance(p.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) / 1000)::numeric, 1)
  from profiles p
  where p.is_discoverable
    and p.location is not null
    and p.id <> auth.uid()
    and st_dwithin(p.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography,
                   least(greatest(radius_km, 1), 200) * 1000)
  order by 8
  limit 50;
$$;

-- ========== CLASSEMENTS ==========
create view public.leaderboard_global with (security_invoker = true) as
  select id, username, avatar_url, home_track_id, elo, rank, wins, losses, draws, matches_played,
         rank() over (order by elo desc) as position
  from public.profiles
  where matches_played > 0;

grant select on public.leaderboard_global to authenticated;

-- Classement local : pilotes dans un rayon autour d'un point (sans exposer leur distance).
create or replace function public.leaderboard_near(lat float, lng float, radius_km int default 50)
returns table (
  id uuid, username text, avatar_url text, elo int, rank public.rank_tier,
  wins int, losses int, "position" bigint
)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.username, p.avatar_url, p.elo, p.rank, p.wins, p.losses,
         rank() over (order by p.elo desc)
  from profiles p
  where p.matches_played > 0
    and p.location is not null
    and st_dwithin(p.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography,
                   least(greatest(radius_km, 1), 200) * 1000)
  order by p.elo desc
  limit 100;
$$;

-- Les fonctions ne sont appelables que par des utilisateurs connectés.
revoke execute on function
  public.respond_challenge(uuid, boolean),
  public.cancel_challenge(uuid),
  public.submit_match_result(uuid, smallint, smallint, int, int),
  public.dispute_match(uuid, text),
  public.confirm_match(uuid),
  public.nearby_pilots(float, float, int),
  public.leaderboard_near(float, float, int)
from public, anon;
grant execute on function
  public.respond_challenge(uuid, boolean),
  public.cancel_challenge(uuid),
  public.submit_match_result(uuid, smallint, smallint, int, int),
  public.dispute_match(uuid, text),
  public.confirm_match(uuid),
  public.nearby_pilots(float, float, int),
  public.leaderboard_near(float, float, int)
to authenticated;


-- Kart Rivals : diffusion temps réel des défis et des matchs (les règles RLS s'appliquent aussi
-- au temps réel : chaque pilote ne reçoit que les changements des défis auxquels il participe).
alter publication supabase_realtime add table public.challenges, public.matches;

-- Kart Rivals : historique public des matchs validés d'un pilote (fiche pilote, licence).
-- Les tables matches/challenges restent privées aux participants ; cette fonction n'expose que
-- les matchs validés, sans message ni contestation.
create or replace function public.pilot_recent_matches(p_profile_id uuid, p_limit int default 10)
returns table (
  match_id uuid,
  confirmed_at timestamptz,
  opponent_id uuid,
  opponent_username text,
  track_name text,
  format public.race_format,
  outcome text,
  elo_delta int
)
language sql stable security definer set search_path = public as $$
  select m.id,
         m.confirmed_at,
         o.id,
         o.username,
         t.name,
         c.format,
         case when m.winner_id is null then 'draw'
              when m.winner_id = p_profile_id then 'win'
              else 'loss' end,
         h.delta
  from matches m
  join challenges c on c.id = m.challenge_id
  join profiles o on o.id = case when c.challenger_id = p_profile_id then c.opponent_id else c.challenger_id end
  join tracks t on t.id = c.track_id
  left join elo_history h on h.match_id = m.id and h.profile_id = p_profile_id
  where m.status = 'confirmed'
    and p_profile_id in (c.challenger_id, c.opponent_id)
  order by m.confirmed_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function public.pilot_recent_matches(uuid, int) from public, anon;
grant execute on function public.pilot_recent_matches(uuid, int) to authenticated;

-- Kart Rivals : fermeture automatique des défis restés sans réponse après leur échéance (72 h).
create or replace function public.expire_stale_challenges()
returns int
language sql security definer set search_path = public as $$
  with expired as (
    update challenges
       set status = 'expired'
     where status = 'pending'
       and expires_at < now()
    returning 1
  )
  select count(*)::int from expired;
$$;

-- Réservée au planificateur : ni l'app ni les visiteurs ne l'appellent.
revoke execute on function public.expire_stale_challenges() from public, anon, authenticated;

-- Toutes les 15 minutes (extension pg_cron, disponible sur Supabase).
create extension if not exists pg_cron;
select cron.schedule('expire-stale-challenges', '*/15 * * * *', 'select public.expire_stale_challenges()');

-- Kart Rivals : circuits de karting du Maine-et-Loire (et Loudun, à 15 min de Saumur),
-- vue cartographique et classement par circuit.

alter table public.tracks add column if not exists postal_code text;
alter table public.tracks add column if not exists kart_power text;
grant insert (postal_code, kart_power) on public.tracks to authenticated;

-- Un même circuit ne peut pas être ajouté deux fois dans la même ville.
create unique index if not exists tracks_name_city_key on public.tracks (lower(name), lower(city));

insert into public.tracks (name, address, postal_code, city, region, is_indoor, length_m, kart_power, is_verified, location, created_by)
values
  ('Inwall Kart', '17 Rue Joseph Cugnot', '49130', 'Les Ponts-de-Cé', 'Maine-et-Loire', true, 600, '270cc', true,
   extensions.st_setsrid(extensions.st_makepoint(-0.5415, 47.4177), 4326)::extensions.geography, null),
  ('L''Autre Usine', '88 rue Bourgneuf', '49300', 'Cholet', 'Maine-et-Loire', true, 400, 'Électrique RTX', true,
   extensions.st_setsrid(extensions.st_makepoint(-0.8586, 47.0579), 4326)::extensions.geography, null),
  ('MK Racing', 'La Malmongère', '49280', 'Saint-Christophe-du-Bois', 'Maine-et-Loire', false, 816, '270cc', true,
   extensions.st_setsrid(extensions.st_makepoint(-0.9416, 47.0164), 4326)::extensions.geography, null),
  ('SpeedPark Angers', 'Centre commercial L''Atoll, 1 avenue de l''Europe', '49070', 'Beaucouzé', 'Maine-et-Loire', true, 300, '270cc', true,
   extensions.st_setsrid(extensions.st_makepoint(-0.6201, 47.4846), 4326)::extensions.geography, null),
  ('Karting de Loudun', 'Route de Saumur (RD 147)', '86120', 'Bournand', 'Vienne', false, 1150, '270 / 390cc', true,
   extensions.st_setsrid(extensions.st_makepoint(0.0841, 47.0873), 4326)::extensions.geography, null)
on conflict ((lower(name)), (lower(city))) do nothing;

-- Circuits avec latitude / longitude lisibles par l'app (la colonne geography ne l'est pas directement).
create or replace view public.tracks_map with (security_invoker = true) as
  select id, name, address, postal_code, city, region, is_indoor, length_m, kart_power, is_verified,
         extensions.st_y(location::extensions.geometry) as lat,
         extensions.st_x(location::extensions.geometry) as lng
  from public.tracks;

grant select on public.tracks_map to authenticated;

-- Classement d'un circuit : pilotes ayant couru des matchs validés sur ce circuit.
create or replace function public.track_leaderboard(p_track_id uuid, p_limit int default 20)
returns table (id uuid, username text, elo int, rank public.rank_tier, wins bigint, matches bigint)
language sql stable security definer set search_path = public as $$
  with results as (
    select p.id as pilot_id, (m.winner_id = p.id) as won
    from matches m
    join challenges c on c.id = m.challenge_id
    join profiles p on p.id in (c.challenger_id, c.opponent_id)
    where m.status = 'confirmed'
      and c.track_id = p_track_id
  )
  select p.id, p.username, p.elo, p.rank,
         count(*) filter (where r.won),
         count(*)
  from results r
  join profiles p on p.id = r.pilot_id
  group by p.id
  order by count(*) filter (where r.won) desc, p.elo desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke execute on function public.track_leaderboard(uuid, int) from public, anon;
grant execute on function public.track_leaderboard(uuid, int) to authenticated;

-- Kart Rivals : stockage des photos de profil (bucket public « avatars »).
-- Chaque pilote n'écrit que dans son dossier : avatars/<son id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "avatars are public" on storage.objects;
create policy "avatars are public"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "pilots upload their own avatar" on storage.objects;
create policy "pilots upload their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pilots update their own avatar" on storage.objects;
create policy "pilots update their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pilots delete their own avatar" on storage.objects;
create policy "pilots delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Kart Rivals : bilan du pilote connecté face à un autre pilote (matchs validés uniquement).
create or replace function public.head_to_head(p_other uuid)
returns table (
  my_wins int,
  their_wins int,
  draws int,
  matches int,
  elo_net int,
  last_played_at timestamptz,
  last_outcome text,
  last_track text
)
language sql stable security definer set search_path = public as $$
  with h as (
    select m.confirmed_at, m.winner_id, t.name as track, e.delta
    from matches m
    join challenges c on c.id = m.challenge_id
    join tracks t on t.id = c.track_id
    left join elo_history e on e.match_id = m.id and e.profile_id = auth.uid()
    where m.status = 'confirmed'
      and p_other <> auth.uid()
      and auth.uid() in (c.challenger_id, c.opponent_id)
      and p_other in (c.challenger_id, c.opponent_id)
  ),
  last as (select * from h order by confirmed_at desc limit 1)
  select
    (count(*) filter (where winner_id = auth.uid()))::int,
    (count(*) filter (where winner_id = p_other))::int,
    (count(*) filter (where winner_id is null))::int,
    count(*)::int,
    coalesce(sum(delta), 0)::int,
    (select confirmed_at from last),
    (select case when winner_id is null then 'draw' when winner_id = auth.uid() then 'win' else 'loss' end from last),
    (select track from last)
  from h;
$$;

revoke execute on function public.head_to_head(uuid) from public, anon;
grant execute on function public.head_to_head(uuid) to authenticated;
