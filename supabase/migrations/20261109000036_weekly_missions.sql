-- Kart Rivals : missions de la semaine.
--   - Chaque semaine (lundi → dimanche, heure de Paris) : 3 missions fixes + 1 mission bonus qui tourne.
--   - La progression est calculée à partir de l'activité réelle (courses et défis validés, Time Attack, sessions,
--     actu, avis) : rien à déclarer. Une mission accomplie se récupère une fois par semaine contre des points.

alter type public.point_reason add value if not exists 'mission';

create table public.mission_claims (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  mission    text not null,
  points     int not null check (points > 0),
  claimed_at timestamptz not null default now(),
  primary key (profile_id, week_start, mission)
);
alter table public.mission_claims enable row level security;
revoke all on public.mission_claims from anon, authenticated;
grant select on public.mission_claims to authenticated;
create policy "pilots read their claims" on public.mission_claims for select to authenticated using (profile_id = auth.uid());

-- Lundi de la semaine en cours (heure de Paris).
create or replace function public.mission_week_start()
returns date language sql stable as $$
  select date_trunc('week', now() at time zone 'Europe/Paris')::date;
$$;

-- Missions de la semaine du pilote connecté, avec progression et état.
create or replace function public.my_missions()
returns table (key text, title text, description text, target int, progress int, points int, claimed boolean, bonus boolean,
               week_start date, week_end date)
language plpgsql stable security definer set search_path = public as $$
declare
  u uuid := auth.uid();
  ws date := public.mission_week_start();
  t0 timestamptz := (ws::timestamp at time zone 'Europe/Paris');
  t1 timestamptz := ((ws + 7)::timestamp at time zone 'Europe/Paris');
  v_tracks int;
  v_pb int;
  v_joined int;
  v_bonus int := (extract(week from ws)::int) % 4;
  v_bonus_progress int;
begin
  -- Circuits roulés : défis et courses validés, Time Attack validés.
  select count(distinct track_id) into v_tracks from (
    select c.track_id from elo_history e join matches m on m.id = e.match_id join challenges c on c.id = m.challenge_id
     where e.profile_id = u and e.created_at >= t0 and e.created_at < t1
    union
    select r.track_id from elo_history e join races r on r.id = e.race_id
     where e.profile_id = u and e.created_at >= t0 and e.created_at < t1
    union
    select s.track_id from time_attack_sessions s
     where s.pilot_id = u and s.status = 'validated' and s.validated_at >= t0 and s.validated_at < t1
  ) x;

  -- Record perso : un Time Attack validé cette semaine plus rapide que tous mes précédents sur ce circuit.
  select count(*) into v_pb from time_attack_sessions s
   where s.pilot_id = u and s.status = 'validated' and s.validated_at >= t0 and s.validated_at < t1
     and s.best_lap_ms < (select min(p.best_lap_ms) from time_attack_sessions p
                           where p.pilot_id = u and p.track_id = s.track_id and p.status = 'validated'
                             and p.validated_at < s.validated_at);

  -- Session rejointe (organisée par quelqu'un d'autre).
  select count(*) into v_joined from session_participants sp join open_sessions o on o.id = sp.session_id
   where sp.profile_id = u and o.host_id <> u and sp.joined_at >= t0 and sp.joined_at < t1 and o.status <> 'cancelled';

  v_bonus_progress := case v_bonus
    when 0 then (select count(*) from matches m join challenges c on c.id = m.challenge_id
                  where m.winner_id = u and m.status = 'confirmed' and m.confirmed_at >= t0 and m.confirmed_at < t1)
    when 1 then (select count(*) from elo_history e where e.profile_id = u and (e.match_id is not null or e.race_id is not null)
                  and e.created_at >= t0 and e.created_at < t1)
    when 2 then (select count(*) from feed_posts f where f.author_id = u and f.lap_ms is not null
                  and f.created_at >= t0 and f.created_at < t1)
    else (select count(*) from track_reviews r where r.author_id = u and r.created_at >= t0 and r.created_at < t1)
  end;

  return query
    with m(key, title, description, target, progress, points, bonus) as (
      values
        ('two_tracks', 'Roule sur 2 circuits', 'Défi, course ou Time Attack validé sur 2 circuits différents.', 2, v_tracks, 60, false),
        ('personal_best', 'Bats ton record perso', 'Un Time Attack validé plus rapide que ton meilleur temps sur ce circuit.', 1, v_pb, 80, false),
        ('join_session', 'Rejoins une session', 'Inscris-toi à une session ouverte organisée par un autre pilote.', 1, v_joined, 40, false),
        (case v_bonus when 0 then 'win_challenge' when 1 then 'three_results' when 2 then 'post_chrono' else 'review' end,
         case v_bonus when 0 then 'Gagne un défi' when 1 then 'Enchaîne 3 résultats'
                      when 2 then 'Partage un chrono' else 'Donne ton avis' end,
         case v_bonus when 0 then 'Remporte un défi en face-à-face validé par ton adversaire.'
                      when 1 then 'Fais valider 3 défis ou courses dans la semaine.'
                      when 2 then 'Publie un chrono dans l’actu.'
                      else 'Note un circuit où tu as roulé.' end,
         case v_bonus when 1 then 3 else 1 end,
         v_bonus_progress,
         case v_bonus when 0 then 50 when 1 then 70 else 25 end,
         true)
    )
    select m.key, m.title, m.description, m.target, least(m.progress, m.target), m.points,
           exists (select 1 from mission_claims c where c.profile_id = u and c.week_start = ws and c.mission = m.key),
           m.bonus, ws, ws + 6
      from m;
end $$;

-- Récupère les points d'une mission accomplie (une fois par semaine).
create or replace function public.claim_mission(p_key text)
returns int language plpgsql security definer set search_path = public as $$
declare
  m record;
begin
  select * into m from public.my_missions() x where x.key = p_key;
  if m.key is null then
    raise exception 'Mission not found';
  end if;
  if m.claimed then
    raise exception 'Mission already claimed';
  end if;
  if m.progress < m.target then
    raise exception 'Mission not completed';
  end if;
  insert into mission_claims (profile_id, week_start, mission, points) values (auth.uid(), m.week_start, m.key, m.points);
  insert into point_transactions (profile_id, amount, reason) values (auth.uid(), m.points, 'mission');
  return m.points;
end $$;

revoke execute on function public.my_missions(), public.claim_mission(text) from public, anon;
grant execute on function public.my_missions(), public.claim_mission(text) to authenticated;
