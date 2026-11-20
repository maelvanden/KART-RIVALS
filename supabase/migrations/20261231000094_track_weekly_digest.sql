-- Kart Rivals : récapitulatif hebdomadaire envoyé aux exploitants (admins karting) en notification.
-- Chaque lundi à 9 h (heure de Paris), chaque admin karting reçoit pour chacun de ses circuits : visites de la fiche,
-- pilotes venus rouler, intérêt pour ses événements, codes promo affichés et nouveaux avis, sur les 7 derniers jours,
-- avec l'évolution par rapport aux 7 jours d'avant. Un circuit sans aucune activité ne déclenche rien.
--   - Un récapitulatif par circuit et par semaine, même si la tâche tourne plusieurs fois.
--   - Chaque exploitant peut le couper pour lui seul (my_track_digest / set_my_track_digest).
--   - Un compte suspendu ou banni ne reçoit rien ; les admins appli ne sont pas destinataires (sauf s'ils gèrent
--     aussi un circuit). Les visites des gérants et les comptes de démonstration ne comptent pas, comme dans
--     track_stats.

create table public.track_digest_prefs (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.track_digest_prefs enable row level security;
revoke all on public.track_digest_prefs from anon, authenticated;

create or replace function public.my_track_digest()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from track_admins where profile_id = auth.uid()) then
    raise exception 'Only the track admins can edit this page';
  end if;
  return coalesce((select enabled from track_digest_prefs where profile_id = auth.uid()), true);
end $$;

create or replace function public.set_my_track_digest(p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from track_admins where profile_id = auth.uid()) then
    raise exception 'Only the track admins can edit this page';
  end if;
  insert into track_digest_prefs (profile_id, enabled) values (auth.uid(), coalesce(p_enabled, true))
  on conflict (profile_id) do update set enabled = excluded.enabled, updated_at = now();
end $$;
revoke execute on function public.my_track_digest(), public.set_my_track_digest(boolean) from public, anon;
grant execute on function public.my_track_digest(), public.set_my_track_digest(boolean) to authenticated;

-- « 12 visites », « 1 visite », « 0 visite » : le singulier jusqu'à 1 en français.
create or replace function public.plural_fr(p_n int, p_one text, p_many text)
returns text language sql immutable as $$
  select p_n::text || ' ' || case when p_n > 1 then p_many else p_one end;
$$;

-- ' (+22 %)' ou ' (−8 %)' ; rien quand il n'y a pas de base de comparaison ou pas de changement.
create or replace function public.trend_fr(p_current int, p_previous int)
returns text language sql immutable as $$
  select case when p_previous > 0 and p_current <> p_previous
              then ' (' || case when p_current > p_previous then '+' else '−' end
                   || round(abs(p_current - p_previous) * 100.0 / p_previous)::int || ' %)'
              else '' end;
$$;
revoke execute on function public.plural_fr(int, text, text), public.trend_fr(int, int) from public, anon, authenticated;

-- Activité d'un circuit sur les 7 derniers jours et les 7 d'avant. Interne : appelée par le récapitulatif.
create or replace function public.track_week_summary(p_track uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  return (
    with rides as (
      select x.pilot_id, x.at
        from (
          select c.challenger_id as pilot_id, m.confirmed_at as at
            from matches m join challenges c on c.id = m.challenge_id
           where c.track_id = p_track and m.status = 'confirmed' and m.confirmed_at is not null
          union all
          select c.opponent_id, m.confirmed_at
            from matches m join challenges c on c.id = m.challenge_id
           where c.track_id = p_track and m.status = 'confirmed' and m.confirmed_at is not null
          union all
          select e.pilot_id, r.confirmed_at
            from race_entries e join races r on r.id = e.race_id
           where r.track_id = p_track and r.status = 'confirmed' and e.status = 'accepted' and r.confirmed_at is not null
          union all
          select s.pilot_id, coalesce(s.validated_at, s.ticket_at, s.check_in_at)
            from time_attack_sessions s
           where s.track_id = p_track and s.status = 'validated'
        ) x
        join profiles p on p.id = x.pilot_id
       where not p.is_demo
    ), views as (
      select v.day from track_views v join profiles p on p.id = v.profile_id
       where v.track_id = p_track and not p.is_demo
    )
    select jsonb_build_object(
      'views', (select count(*) from views where day > v_today - 7),
      'views_prev', (select count(*) from views where day > v_today - 14 and day <= v_today - 7),
      'pilots', (select count(distinct pilot_id) from rides where at > now() - interval '7 days'),
      'pilots_prev', (select count(distinct pilot_id) from rides
                       where at > now() - interval '14 days' and at <= now() - interval '7 days'),
      'interests', (select count(*) from event_interests i join track_events e on e.id = i.event_id
                     where e.track_id = p_track and i.created_at > now() - interval '7 days'),
      'reveals', (select count(*) from promo_reveals r join track_events e on e.id = r.event_id
                   where e.track_id = p_track and r.created_at > now() - interval '7 days'),
      'reviews', (select count(*) from track_reviews rv
                   where rv.track_id = p_track and rv.hidden_at is null and rv.created_at > now() - interval '7 days')));
end $$;
revoke execute on function public.track_week_summary(uuid) from public, anon, authenticated;

-- Appelée toutes les heures par pg_cron ; n'envoie rien en dehors du lundi 9 h (Paris), sauf avec p_force (essais).
create or replace function public.track_weekly_digest(p_force boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  t record;
  s jsonb;
  v_key text;
  v_parts text[];
  v_views int;
  v_pilots int;
  v_interests int;
  v_reveals int;
  v_reviews int;
begin
  if not p_force and not (extract(isodow from now() at time zone 'Europe/Paris') = 1
                          and extract(hour from now() at time zone 'Europe/Paris') = 9) then
    return;
  end if;

  for t in
    select tr.id, tr.name
      from tracks tr
     where tr.hidden_at is null and exists (select 1 from track_admins ta where ta.track_id = tr.id)
  loop
    begin
      s := public.track_week_summary(t.id);
      v_views := (s ->> 'views')::int;
      v_pilots := (s ->> 'pilots')::int;
      v_interests := (s ->> 'interests')::int;
      v_reveals := (s ->> 'reveals')::int;
      v_reviews := (s ->> 'reviews')::int;
      -- Rien ne s'est passé cette semaine : pas de notification vide.
      continue when v_views + v_pilots + v_interests + v_reveals + v_reviews = 0;

      insert into team_alert_log (key)
      values ('digest:' || t.id || ':' || to_char(now() at time zone 'Europe/Paris', 'IYYY-IW'))
      on conflict do nothing;
      continue when not found;

      v_parts := array[
        public.plural_fr(v_views, 'visite', 'visites') || public.trend_fr(v_views, (s ->> 'views_prev')::int),
        public.plural_fr(v_pilots, 'pilote venu rouler', 'pilotes venus rouler') || public.trend_fr(v_pilots, (s ->> 'pilots_prev')::int)
      ];
      if v_interests > 0 then v_parts := v_parts || public.plural_fr(v_interests, 'intéressé par vos événements', 'intéressés par vos événements'); end if;
      if v_reveals > 0 then v_parts := v_parts || public.plural_fr(v_reveals, 'code promo affiché', 'codes promo affichés'); end if;
      if v_reviews > 0 then v_parts := v_parts || public.plural_fr(v_reviews, 'nouvel avis', 'nouveaux avis'); end if;

      perform send_push(
        array(select ta.profile_id from track_admins ta
               where ta.track_id = t.id
                 and not exists (select 1 from track_digest_prefs p where p.profile_id = ta.profile_id and not p.enabled)
                 and not public.is_restricted(ta.profile_id)),
        '📊 ' || t.name || ' · cette semaine',
        array_to_string(v_parts, ' · '),
        '/admin/track/stats?id=' || t.id);
    exception when others then
      -- Un circuit en échec ne bloque pas les autres.
      raise warning 'track_weekly_digest %: %', t.id, sqlerrm;
    end;
  end loop;
end $$;
revoke execute on function public.track_weekly_digest(boolean) from public, anon, authenticated;

select cron.schedule('track-weekly-digest', '0 * * * *', 'select public.track_weekly_digest()');
