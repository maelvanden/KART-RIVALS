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
