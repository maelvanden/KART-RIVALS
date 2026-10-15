-- Kart Rivals : statistiques servant au calcul des badges d'un pilote.
-- Rien n'est stocké : tout est recalculé à partir des matchs validés, donc toujours exact et non falsifiable.
create or replace function public.pilot_badge_stats(p_profile_id uuid)
returns table (
  matches int,
  wins int,
  best_streak int,
  current_streak int,
  tracks_raced int,
  lap_time_matches int,
  peak_elo int,
  giant_kills int,
  crowned_tracks text[]
)
language sql stable security definer set search_path = public as $$
  with games as (
    select m.id, m.confirmed_at, c.track_id, c.format,
           case when m.winner_id = p_profile_id then 1 else 0 end as won,
           case when c.challenger_id = p_profile_id then c.opponent_id else c.challenger_id end as opponent
    from matches m
    join challenges c on c.id = m.challenge_id
    where m.status = 'confirmed'
      and p_profile_id in (c.challenger_id, c.opponent_id)
  ),
  -- Séries de victoires : technique « gaps and islands » sur l'ordre chronologique.
  ordered as (
    select *, row_number() over (order by confirmed_at, id) as rn,
              row_number() over (partition by won order by confirmed_at, id) as rn_by_result
    from games
  ),
  streaks as (
    select count(*) as len, max(rn) as last_rn
    from ordered where won = 1
    group by rn - rn_by_result
  ),
  -- Victoire contre un pilote qui avait au moins 100 ELO de plus avant le match.
  kills as (
    select count(*) as n
    from games g
    join elo_history me on me.match_id = g.id and me.profile_id = p_profile_id
    join elo_history opp on opp.match_id = g.id and opp.profile_id = g.opponent
    where g.won = 1 and opp.elo_before >= me.elo_before + 100
  ),
  -- Victoires par pilote et par circuit, pour les couronnes (n°1 seul avec au moins 3 victoires).
  track_wins as (
    select c.track_id, p.id as pilot, count(*) filter (where m.winner_id = p.id) as w
    from matches m
    join challenges c on c.id = m.challenge_id
    join profiles p on p.id in (c.challenger_id, c.opponent_id)
    where m.status = 'confirmed'
    group by c.track_id, p.id
  ),
  crowned as (
    select t.name
    from track_wins tw
    join tracks t on t.id = tw.track_id
    where tw.pilot = p_profile_id
      and tw.w >= 3
      and tw.w > all (select o.w from track_wins o where o.track_id = tw.track_id and o.pilot <> p_profile_id)
  )
  select
    (select count(*) from games)::int,
    (select coalesce(sum(won), 0) from games)::int,
    (select coalesce(max(len), 0) from streaks)::int,
    coalesce((select len from streaks where last_rn = (select max(rn) from ordered)), 0)::int,
    (select count(distinct track_id) from games)::int,
    (select count(*) from games where format = 'lap_time')::int,
    greatest(
      (select elo from profiles where id = p_profile_id),
      coalesce((select max(elo_after) from elo_history where profile_id = p_profile_id), 0)
    )::int,
    (select n from kills)::int,
    coalesce((select array_agg(name order by name) from crowned), '{}');
$$;

revoke execute on function public.pilot_badge_stats(uuid) from public, anon;
grant execute on function public.pilot_badge_stats(uuid) to authenticated;
