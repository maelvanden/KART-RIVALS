-- Kart Rivals : série par jour des statistiques d'un circuit, pour l'export CSV de l'exploitant (visites de la fiche et
-- résultats validés, jour par jour). Même périmètre que track_stats : admins du circuit et admins appli, gérants et
-- comptes de démonstration exclus. Jusqu'à 365 jours ; les jours sans activité sont renvoyés à zéro, pour que le
-- tableur n'ait pas de trous.

create or replace function public.track_stats_daily(p_track uuid, p_days int default 90)
returns table (day date, views int, pilots int, matches int, races int, time_attacks int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_days int := least(greatest(coalesce(p_days, 90), 1), 365);
begin
  if auth.uid() is null or not public.is_track_manager(p_track) then
    raise exception 'Only the track admins can edit this page';
  end if;

  return query
    with rides as (
      select x.pilot_id, x.kind, x.ref, (x.at at time zone 'Europe/Paris')::date as d
        from (
          select c.challenger_id as pilot_id, m.confirmed_at as at, 'match'::text as kind, m.id as ref
            from matches m join challenges c on c.id = m.challenge_id
           where c.track_id = p_track and m.status = 'confirmed' and m.confirmed_at is not null
          union all
          select c.opponent_id, m.confirmed_at, 'match', m.id
            from matches m join challenges c on c.id = m.challenge_id
           where c.track_id = p_track and m.status = 'confirmed' and m.confirmed_at is not null
          union all
          select e.pilot_id, r.confirmed_at, 'race', r.id
            from race_entries e join races r on r.id = e.race_id
           where r.track_id = p_track and r.status = 'confirmed' and e.status = 'accepted' and r.confirmed_at is not null
          union all
          select s.pilot_id, coalesce(s.validated_at, s.ticket_at, s.check_in_at), 'time_attack', s.id
            from time_attack_sessions s
           where s.track_id = p_track and s.status = 'validated'
        ) x
        join profiles p on p.id = x.pilot_id
       where not p.is_demo and (x.at at time zone 'Europe/Paris')::date > v_today - v_days
    ), seen as (
      select v.day as d, count(*)::int as n
        from track_views v join profiles p on p.id = v.profile_id
       where v.track_id = p_track and not p.is_demo and v.day > v_today - v_days
       group by v.day
    ), per_day as (
      select r.d, count(distinct r.pilot_id)::int as pilots, count(distinct r.ref) filter (where r.kind = 'match')::int as matches,
             count(distinct r.ref) filter (where r.kind = 'race')::int as races,
             count(distinct r.ref) filter (where r.kind = 'time_attack')::int as time_attacks
        from rides r group by r.d
    )
    select g.d, coalesce(s.n, 0), coalesce(p.pilots, 0), coalesce(p.matches, 0), coalesce(p.races, 0), coalesce(p.time_attacks, 0)
      from generate_series(v_today - (v_days - 1), v_today, interval '1 day') as gs (d0)
      cross join lateral (select gs.d0::date as d) g
      left join seen s on s.d = g.d
      left join per_day p on p.d = g.d
     order by g.d;
end $$;

revoke execute on function public.track_stats_daily(uuid, int) from public, anon;
grant execute on function public.track_stats_daily(uuid, int) to authenticated;
