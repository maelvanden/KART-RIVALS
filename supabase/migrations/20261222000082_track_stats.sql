-- Kart Rivals : statistiques de sa fiche pour l'exploitant d'un karting (admins du circuit et admins appli).
--   - track_views : une visite par pilote et par jour sur une fiche circuit (log_track_view, appelée à l'ouverture de
--     la fiche). Les gérants de la fiche ne sont pas comptés.
--   - track_stats : visites, pilotes venus rouler (défis et courses validés, Time Attack validés), nouveaux pilotes,
--     pilotes dont c'est le circuit favori, note et avis, activité par semaine, habitués, record du tour, intérêt
--     pour les événements et promos en cours. Les comptes de démonstration sont ignorés.

create table public.track_views (
  track_id   uuid not null references public.tracks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day        date not null default (now() at time zone 'Europe/Paris')::date,
  primary key (track_id, profile_id, day)
);
create index track_views_track_day_idx on public.track_views (track_id, day);

-- Lue et écrite uniquement par les fonctions ci-dessous.
alter table public.track_views enable row level security;
revoke all on public.track_views from anon, authenticated;

create or replace function public.log_track_view(p_track uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_track_manager(p_track) then
    return;
  end if;
  insert into track_views (track_id, profile_id)
  select p_track, auth.uid()
   where exists (select 1 from tracks where id = p_track)
  on conflict do nothing;
end $$;

create or replace function public.track_stats(p_track uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if auth.uid() is null or not public.is_track_manager(p_track) then
    raise exception 'Only the track admins can edit this page';
  end if;

  return (
    -- Une ligne par pilote et par résultat validé sur ce circuit.
    with rides as (
      select x.pilot_id, x.at, x.kind, x.ref
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
       where not p.is_demo
    ), firsts as (
      select pilot_id, min(at) as first_at from rides group by pilot_id
    ), views as (
      select v.profile_id, v.day
        from track_views v join profiles p on p.id = v.profile_id
       where v.track_id = p_track and not p.is_demo
    ), reviews as (
      select (track_score + karts_score + staff_score + price_score) / 4.0 as score, created_at
        from track_reviews
       where track_id = p_track and hidden_at is null
    ), live_events as (
      select e.id, e.kind, e.title, e.starts_at, e.ends_at,
             (select count(*) from event_interests i where i.event_id = e.id) as interests,
             (select count(*) from promo_reveals r where r.event_id = e.id) as reveals
        from track_events e
       where e.track_id = p_track and coalesce(e.ends_at, e.starts_at) > now()
    )
    select jsonb_build_object(
      'views_30d', (select count(*) from views where day > v_today - 30),
      'views_prev_30d', (select count(*) from views where day > v_today - 60 and day <= v_today - 30),
      'viewers_30d', (select count(distinct profile_id) from views where day > v_today - 30),
      'pilots_30d', (select count(distinct pilot_id) from rides where at > now() - interval '30 days'),
      'pilots_prev_30d', (select count(distinct pilot_id) from rides
                           where at > now() - interval '60 days' and at <= now() - interval '30 days'),
      'pilots_total', (select count(*) from firsts),
      'new_pilots_30d', (select count(*) from firsts where first_at > now() - interval '30 days'),
      'matches_30d', (select count(distinct ref) from rides where kind = 'match' and at > now() - interval '30 days'),
      'races_30d', (select count(distinct ref) from rides where kind = 'race' and at > now() - interval '30 days'),
      'time_attacks_30d', (select count(distinct ref) from rides
                            where kind = 'time_attack' and at > now() - interval '30 days'),
      'fans', (select count(*) from profiles where home_track_id = p_track and not is_demo and banned_at is null),
      'rating', (select round(avg(score), 1) from reviews),
      'reviews', (select count(*) from reviews),
      'reviews_30d', (select count(*) from reviews where created_at > now() - interval '30 days'),
      'photos', (select count(*) from track_photos where track_id = p_track and hidden_at is null),
      'corrections_open', (select count(*) from track_corrections where track_id = p_track and status = 'open'),
      'sessions_upcoming', (select count(*) from open_sessions
                             where track_id = p_track and status = 'open' and starts_at > now()),
      'tournaments_live', (select count(*) from tournaments
                            where track_id = p_track and status in ('registration', 'running')),
      'weeks', (select coalesce(jsonb_agg(jsonb_build_object('week', g.wk, 'pilots', w.pilots, 'views', w.views)
                                          order by g.wk), '[]'::jsonb)
                  from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()),
                                       interval '1 week') g(wk)
                 cross join lateral (
                   select (select count(distinct pilot_id) from rides
                            where at >= g.wk and at < g.wk + interval '7 days') as pilots,
                          (select count(*) from views
                            where day >= (g.wk at time zone 'Europe/Paris')::date
                              and day < (g.wk at time zone 'Europe/Paris')::date + 7) as views
                 ) w),
      'regulars', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username,
                                                                 'avatar_url', p.avatar_url, 'elo', p.elo,
                                                                 'rank', p.rank, 'count', q.n)
                                             order by q.n desc, p.username), '[]'::jsonb)
                     from (select pilot_id, count(distinct ref) as n from rides
                            where at > now() - interval '90 days'
                            group by pilot_id order by n desc, pilot_id limit 5) q
                     join profiles p on p.id = q.pilot_id),
      'record', (select jsonb_build_object('username', p.username, 'lap_ms', l.lap_ms, 'at', l.confirmed_at)
                   from lap_times_private l join profiles p on p.id = l.pilot_id
                  where l.track_id = p_track
                  order by l.lap_ms, l.confirmed_at
                  limit 1),
      'events_upcoming', (select count(*) from live_events where kind = 'event'),
      'promos_active', (select count(*) from live_events where kind = 'promo'),
      'interests_30d', (select count(*) from event_interests i join track_events e on e.id = i.event_id
                         where e.track_id = p_track and i.created_at > now() - interval '30 days'),
      'reveals_30d', (select count(*) from promo_reveals r join track_events e on e.id = r.event_id
                       where e.track_id = p_track and r.created_at > now() - interval '30 days'),
      'live', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'title', title,
                                                            'starts_at', starts_at, 'ends_at', ends_at,
                                                            'interests', interests, 'reveals', reveals)
                                         order by coalesce(starts_at, ends_at)), '[]'::jsonb)
                 from (select * from live_events order by coalesce(starts_at, ends_at) limit 8) le)));
end $$;

revoke execute on function public.log_track_view(uuid), public.track_stats(uuid) from public, anon;
grant execute on function public.log_track_view(uuid), public.track_stats(uuid) to authenticated;
