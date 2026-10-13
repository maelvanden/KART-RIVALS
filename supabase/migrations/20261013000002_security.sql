-- Kart League : droits par colonne + RLS.
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
