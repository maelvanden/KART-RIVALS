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
