-- Kart Rivals : statistiques avancées pour les admins appli.
--   - Carte d'activité par département : pilotes (département du circuit favori, sinon du circuit le plus proche de
--     leur position approximative), actifs sur 30 jours, nouveaux, circuits, et pilotes « éloignés » (circuit le plus
--     proche à plus de 40 km) pour repérer où il manque des kartings.
--   - Fidélité : pilotes encore actifs 1 semaine et 1 mois après leur inscription, part ayant fait un défi, délai avant
--     le premier défi, par mois d'inscription.

-- Toutes les traces d'activité d'un pilote (une ligne par action).
create or replace function public.pilot_activity()
returns table (profile_id uuid, at timestamptz)
language sql stable security definer set search_path = public as $$
  select profile_id, created_at from elo_history
  union all select author_id, created_at from feed_posts
  union all select author_id, created_at from post_comments
  union all select profile_id, created_at from post_reactions
  union all select sender_id, created_at from messages
  union all select pilot_id, check_in_at from time_attack_sessions
  union all select challenger_id, created_at from challenges
  union all select opponent_id, responded_at from challenges where responded_at is not null
  union all select profile_id, joined_at from session_participants
  union all select author_id, created_at from track_reviews;
$$;
revoke execute on function public.pilot_activity() from public, anon, authenticated;

create or replace function public.admin_activity_map()
returns table (dept text, pilots int, active_30d int, new_30d int, far_pilots int, tracks int,
               lat double precision, lng double precision)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_app_admin();
  return query
    with active as (
      select distinct a.profile_id from public.pilot_activity() a where a.at > now() - interval '30 days'
    ), located as (
      select p.id, p.created_at,
             coalesce(left(ht.postal_code, 2), left(nt.postal_code, 2)) as d,
             nt.km
        from profiles p
        left join tracks ht on ht.id = p.home_track_id
        left join lateral (
          select t.postal_code, st_distance(t.location, p.location) / 1000 as km
            from tracks t
           where p.location is not null and t.hidden_at is null
           order by t.location <-> p.location
           limit 1
        ) nt on true
       where p.banned_at is null
    ), by_dept as (
      select l.d,
             count(*)::int as pilots,
             count(*) filter (where l.id in (select profile_id from active))::int as active_30d,
             count(*) filter (where l.created_at > now() - interval '30 days')::int as new_30d,
             count(*) filter (where l.km > 40)::int as far_pilots
        from located l
       group by l.d
    ), track_dept as (
      select left(t.postal_code, 2) as d, count(*)::int as n,
             avg(st_y(t.location::geometry)) as lat, avg(st_x(t.location::geometry)) as lng
        from tracks t
       where t.hidden_at is null and t.postal_code is not null
       group by 1
    )
    select coalesce(b.d, t.d), coalesce(b.pilots, 0), coalesce(b.active_30d, 0), coalesce(b.new_30d, 0),
           coalesce(b.far_pilots, 0), coalesce(t.n, 0), t.lat, t.lng
      from by_dept b
      full join track_dept t on t.d = b.d
     order by coalesce(b.pilots, 0) desc, coalesce(b.d, t.d);
end $$;

create or replace function public.admin_retention()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return (
    with p as (
      select id, created_at from profiles where banned_at is null
    ), last_seen as (
      select a.profile_id, max(a.at) as last_at from public.pilot_activity() a group by a.profile_id
    ), first_challenge as (
      select x.pid, min(x.at) as at from (
        select challenger_id as pid, created_at as at from challenges
        union all select opponent_id, created_at from challenges
      ) x group by x.pid
    ), pilots as (
      select p.id, p.created_at, ls.last_at, fc.at as first_challenge_at,
             date_trunc('month', p.created_at) as cohort,
             extract(epoch from (fc.at - p.created_at)) / 3600 as hours_to_challenge
        from p
        left join last_seen ls on ls.profile_id = p.id
        left join first_challenge fc on fc.pid = p.id
    )
    select jsonb_build_object(
      'pilots', (select count(*) from pilots),
      'eligible_7d', (select count(*) from pilots where created_at <= now() - interval '7 days'),
      'returned_7d', (select count(*) from pilots where created_at <= now() - interval '7 days'
                                                    and last_at >= created_at + interval '7 days'),
      'eligible_30d', (select count(*) from pilots where created_at <= now() - interval '30 days'),
      'returned_30d', (select count(*) from pilots where created_at <= now() - interval '30 days'
                                                     and last_at >= created_at + interval '30 days'),
      'with_challenge', (select count(*) from pilots where first_challenge_at is not null),
      'avg_hours_to_challenge', (select round(avg(greatest(hours_to_challenge, 0))::numeric, 1) from pilots
                                  where first_challenge_at is not null),
      'median_hours_to_challenge', (select round((percentile_cont(0.5) within group (order by greatest(hours_to_challenge, 0)))::numeric, 1)
                                      from pilots where first_challenge_at is not null),
      'cohorts', coalesce((select jsonb_agg(c order by c->>'month' desc) from (
          select jsonb_build_object(
                   'month', to_char(cohort, 'YYYY-MM'),
                   'signups', count(*),
                   'eligible_7d', count(*) filter (where created_at <= now() - interval '7 days'),
                   'returned_7d', count(*) filter (where created_at <= now() - interval '7 days'
                                                     and last_at >= created_at + interval '7 days'),
                   'eligible_30d', count(*) filter (where created_at <= now() - interval '30 days'),
                   'returned_30d', count(*) filter (where created_at <= now() - interval '30 days'
                                                      and last_at >= created_at + interval '30 days'),
                   'with_challenge', count(*) filter (where first_challenge_at is not null),
                   'median_hours_to_challenge', round((percentile_cont(0.5) within group (order by greatest(hours_to_challenge, 0))
                                                         filter (where first_challenge_at is not null))::numeric, 1)) c
            from pilots
           where cohort >= date_trunc('month', now()) - interval '11 months'
           group by cohort) q), '[]'::jsonb)));
end $$;

revoke execute on function public.admin_activity_map(), public.admin_retention() from public, anon;
grant execute on function public.admin_activity_map(), public.admin_retention() to authenticated;
