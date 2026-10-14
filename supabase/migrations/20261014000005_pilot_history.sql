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
