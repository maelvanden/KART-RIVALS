-- Kart League : schéma initial (circuits, licences pilotes, défis, matchs, historique ELO)

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
