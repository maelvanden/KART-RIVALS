-- Kart Rivals : arbitrage des résultats par les admins appli.
--   - Litiges : défis et courses contestés (ou en attente de confirmation depuis plus de 3 jours). L'admin valide le
--     résultat déclaré, le corrige (défis) ou annule ; l'ELO est calculé comme lors d'une confirmation normale.
--   - Time Attack suspects : chronos validés à plus de 3 % sous le meilleur temps précédent du circuit, à revoir avec
--     la photo du ticket. Refusé, le chrono sort des records et du badge vérifié, ses points sont repris.
--   - Annuler un résultat validé (triche) : l'ELO gagné ou perdu est rendu aux pilotes, compteurs et points repris.
--   Chaque décision est notée dans le journal, sur la fiche de chaque pilote concerné.

alter type public.time_attack_status add value if not exists 'rejected';
alter type public.point_reason add value if not exists 'admin_adjustment';

alter table public.time_attack_sessions
  add column if not exists admin_reviewed_at timestamptz,
  add column if not exists rejected_reason   text check (char_length(rejected_reason) <= 300);

-- Les admins appli voient les photos de tickets (bucket privé).
drop policy if exists "app admins read tickets" on storage.objects;
create policy "app admins read tickets" on storage.objects for select to authenticated
  using (bucket_id = 'time-attack-tickets' and public.is_app_admin());

-- ========== OUTILS INTERNES ==========
-- Reprend des points (jamais sous zéro).
create or replace function public.admin_claw_back_points(p_profile uuid, p_amount int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v int;
begin
  select least(coalesce(p_amount, 0), points) into v from profiles where id = p_profile;
  if v > 0 then
    insert into point_transactions (profile_id, amount, reason) values (p_profile, -v, 'admin_adjustment');
  end if;
end $$;

-- ELO d'un défi, identique à confirm_match quand les deux pilotes ont confirmé.
create or replace function public.apply_match_elo(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m matches;
  c challenges;
  a profiles;
  b profiles;
  ea numeric;
  sa numeric;
  ka int;
  kb int;
  new_a int;
  new_b int;
begin
  select * into m from matches where id = p_match_id for update;
  select * into c from challenges where id = m.challenge_id;
  perform 1 from profiles where id in (c.challenger_id, c.opponent_id) order by id for update;
  select * into a from profiles where id = c.challenger_id;
  select * into b from profiles where id = c.opponent_id;

  ea := 1 / (1 + power(10, (b.elo - a.elo) / 400.0));
  sa := case when m.winner_id = a.id then 1 when m.winner_id = b.id then 0 else 0.5 end;
  ka := case when a.matches_played < 10 then 40 when a.elo >= 1850 then 16 else 24 end;
  kb := case when b.matches_played < 10 then 40 when b.elo >= 1850 then 16 else 24 end;
  new_a := round(a.elo + ka * (sa - ea));
  new_b := round(b.elo + kb * ((1 - sa) - (1 - ea)));

  update profiles set elo = new_a, wins = wins + (sa = 1)::int, losses = losses + (sa = 0)::int,
                      draws = draws + (sa = 0.5)::int
   where id = a.id;
  update profiles set elo = new_b, wins = wins + (sa = 0)::int, losses = losses + (sa = 1)::int,
                      draws = draws + (sa = 0.5)::int
   where id = b.id;
  insert into elo_history (match_id, profile_id, elo_before, elo_after, k_factor)
  values (m.id, a.id, a.elo, new_a, ka), (m.id, b.id, b.elo, new_b, kb);

  update matches set status = 'confirmed', confirmed_at = now(), dispute_reason = null,
                     challenger_confirmed_at = coalesce(challenger_confirmed_at, now()),
                     opponent_confirmed_at = coalesce(opponent_confirmed_at, now())
   where id = m.id;
  update challenges set status = 'completed' where id = c.id;
end $$;

-- ELO d'une course, identique à confirm_race quand la majorité a confirmé.
create or replace function public.apply_race_elo(p_race_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_n int;
  e record;
  o record;
  v_sum numeric;
begin
  perform 1 from races where id = p_race_id for update;
  select count(*) into v_n from race_entries where race_id = p_race_id and status = 'accepted';
  perform 1 from profiles p join race_entries re on re.pilot_id = p.id
   where re.race_id = p_race_id and re.status = 'accepted' order by p.id for update of p;

  drop table if exists admin_race_snapshot;
  create temp table admin_race_snapshot on commit drop as
    select re.pilot_id, re.position, p.elo,
           case when p.matches_played + p.race_count < 10 then 40 when p.elo >= 1850 then 16 else 24 end as k
    from race_entries re join profiles p on p.id = re.pilot_id
    where re.race_id = p_race_id and re.status = 'accepted';

  for e in select * from admin_race_snapshot loop
    v_sum := 0;
    for o in select * from admin_race_snapshot where pilot_id <> e.pilot_id loop
      v_sum := v_sum
        + (case when e.position < o.position then 1 when e.position = o.position then 0.5 else 0 end)
        - 1 / (1 + power(10, (o.elo - e.elo) / 400.0));
    end loop;
    insert into elo_history (race_id, profile_id, elo_before, elo_after, k_factor)
    values (p_race_id, e.pilot_id, e.elo, e.elo + round(e.k * v_sum / (v_n - 1)), e.k);
  end loop;

  update profiles p
     set elo = h.elo_after,
         race_count = race_count + 1,
         race_wins = race_wins + (s.position = 1)::int,
         race_podiums = race_podiums + (s.position <= 3)::int
    from elo_history h join admin_race_snapshot s on s.pilot_id = h.profile_id
   where h.race_id = p_race_id and p.id = h.profile_id;

  update race_entries set confirmed_at = coalesce(confirmed_at, now()) where race_id = p_race_id and status = 'accepted';
  update races set status = 'confirmed', confirmed_at = now(), dispute_reason = null where id = p_race_id;
end $$;

revoke execute on function public.admin_claw_back_points(uuid, int), public.apply_match_elo(uuid), public.apply_race_elo(uuid)
  from public, anon, authenticated;

-- ========== LITIGES ==========
create or replace function public.admin_disputes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
    select jsonb_build_object(
             'kind', 'match', 'id', m.id, 'created_at', m.created_at, 'status', m.status, 'format', c.format,
             'track', t.name, 'track_id', t.id,
             'challenger', jsonb_build_object('id', a.id, 'username', a.username, 'elo', a.elo),
             'opponent', jsonb_build_object('id', b.id, 'username', b.username, 'elo', b.elo),
             'submitted_by', s.username, 'winner', w.username,
             'challenger_position', m.challenger_position, 'opponent_position', m.opponent_position,
             'challenger_best_lap_ms', m.challenger_best_lap_ms, 'opponent_best_lap_ms', m.opponent_best_lap_ms,
             'dispute_reason', m.dispute_reason) as x
      from matches m
      join challenges c on c.id = m.challenge_id
      join tracks t on t.id = c.track_id
      join profiles a on a.id = c.challenger_id
      join profiles b on b.id = c.opponent_id
      left join profiles s on s.id = m.submitted_by
      left join profiles w on w.id = m.winner_id
     where m.status = 'disputed' or (m.status = 'awaiting_confirmation' and m.created_at < now() - interval '3 days')
    union all
    select jsonb_build_object(
             'kind', 'race', 'id', r.id, 'created_at', coalesce(r.submitted_at, r.created_at), 'status', r.status,
             'format', r.format, 'track', t.name, 'track_id', t.id, 'organizer', o.username,
             'dispute_reason', r.dispute_reason,
             'entries', (select jsonb_agg(jsonb_build_object('pilot_id', p.id, 'username', p.username, 'elo', p.elo,
                                                             'position', re.position, 'best_lap_ms', re.best_lap_ms,
                                                             'confirmed', re.confirmed_at is not null)
                                          order by re.position nulls last)
                           from race_entries re join profiles p on p.id = re.pilot_id
                          where re.race_id = r.id and re.status = 'accepted'))
      from races r
      join tracks t on t.id = r.track_id
      join profiles o on o.id = r.organizer_id
     where r.status = 'disputed' or (r.status = 'awaiting_confirmation' and r.submitted_at < now() - interval '3 days')
  ) q), '[]'::jsonb);
end $$;

-- Défi : validate (résultat déclaré), correct (résultat saisi par l'admin), cancel.
create or replace function public.admin_resolve_match(p_match_id uuid, p_decision text,
                                                      p_challenger_position smallint default null,
                                                      p_opponent_position smallint default null,
                                                      p_challenger_lap_ms int default null,
                                                      p_opponent_lap_ms int default null,
                                                      p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  m matches;
  c challenges;
  v_winner uuid;
begin
  perform public.require_app_admin();
  select * into m from matches where id = p_match_id for update;
  if m.id is null then
    raise exception 'Result not found';
  end if;
  if m.status = 'confirmed' then
    raise exception 'Result already confirmed';
  end if;
  select * into c from challenges where id = m.challenge_id;

  case p_decision
    when 'validate' then
      perform public.apply_match_elo(m.id);
    when 'correct' then
      if c.format = 'position' then
        if p_challenger_position is null or p_opponent_position is null
           or p_challenger_position < 1 or p_opponent_position < 1 then
          raise exception 'Both positions are required';
        end if;
        v_winner := case when p_challenger_position < p_opponent_position then c.challenger_id
                         when p_opponent_position < p_challenger_position then c.opponent_id end;
      else
        if p_challenger_lap_ms is null or p_opponent_lap_ms is null or p_challenger_lap_ms <= 0 or p_opponent_lap_ms <= 0 then
          raise exception 'Both lap times are required';
        end if;
        v_winner := case when p_challenger_lap_ms < p_opponent_lap_ms then c.challenger_id
                         when p_opponent_lap_ms < p_challenger_lap_ms then c.opponent_id end;
      end if;
      update matches set challenger_position = p_challenger_position, opponent_position = p_opponent_position,
                         challenger_best_lap_ms = p_challenger_lap_ms, opponent_best_lap_ms = p_opponent_lap_ms,
                         winner_id = v_winner
       where id = m.id;
      perform public.apply_match_elo(m.id);
    when 'cancel' then
      delete from matches where id = m.id;
      update challenges set status = 'cancelled' where id = c.id;
    else
      raise exception 'Unknown decision';
  end case;

  insert into admin_actions (action, profile_id, track_id, details)
  select 'resolve_match', pid, c.track_id,
         jsonb_strip_nulls(jsonb_build_object('decision', p_decision, 'reason', nullif(btrim(p_note), '')))
    from unnest(array[c.challenger_id, c.opponent_id]) pid;
end $$;

-- Course : validate (classement déclaré) ou cancel.
create or replace function public.admin_resolve_race(p_race_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r races;
begin
  perform public.require_app_admin();
  select * into r from races where id = p_race_id for update;
  if r.id is null then
    raise exception 'Result not found';
  end if;
  if r.status not in ('disputed', 'awaiting_confirmation') then
    raise exception 'Result already confirmed';
  end if;

  case p_decision
    when 'validate' then
      if exists (select 1 from race_entries where race_id = r.id and status = 'accepted' and position is null) then
        raise exception 'Race has no complete result';
      end if;
      perform public.apply_race_elo(r.id);
    when 'cancel' then
      update races set status = 'cancelled' where id = r.id;
    else
      raise exception 'Unknown decision';
  end case;

  insert into admin_actions (action, profile_id, track_id, details)
  select 'resolve_race', re.pilot_id, r.track_id,
         jsonb_strip_nulls(jsonb_build_object('decision', p_decision, 'reason', nullif(btrim(p_note), '')))
    from race_entries re where re.race_id = r.id and re.status = 'accepted';
end $$;

-- ========== ANNULER UN RÉSULTAT VALIDÉ ==========
-- L'ELO gagné ou perdu est rendu (on retire le delta, même si d'autres résultats ont suivi), les compteurs
-- et les points du résultat sont repris.
create or replace function public.admin_cancel_result(p_kind text, p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  h record;
  m matches;
  c challenges;
  r races;
  v_track uuid;
  v_pilots uuid[];
begin
  perform public.require_app_admin();
  if p_kind = 'match' then
    select * into m from matches where id = p_id for update;
    if m.id is null or m.status <> 'confirmed' then
      raise exception 'Only a confirmed result can be cancelled';
    end if;
    select * into c from challenges where id = m.challenge_id;
    v_track := c.track_id;
    v_pilots := array[c.challenger_id, c.opponent_id];
    perform 1 from profiles where id = any(v_pilots) order by id for update;
    for h in select eh.*, (select amount from point_transactions pt where pt.elo_history_id = eh.id) as pts
               from elo_history eh where eh.match_id = m.id loop
      update profiles set
        elo = elo - h.delta,
        wins = greatest(0, wins - (m.winner_id = h.profile_id)::int),
        losses = greatest(0, losses - (m.winner_id is not null and m.winner_id <> h.profile_id)::int),
        draws = greatest(0, draws - (m.winner_id is null)::int)
       where id = h.profile_id;
      perform public.admin_claw_back_points(h.profile_id, h.pts);
    end loop;
    delete from matches where id = m.id;
    update challenges set status = 'cancelled' where id = c.id;
  elsif p_kind = 'race' then
    select * into r from races where id = p_id for update;
    if r.id is null or r.status <> 'confirmed' then
      raise exception 'Only a confirmed result can be cancelled';
    end if;
    v_track := r.track_id;
    select array_agg(pilot_id) into v_pilots from race_entries where race_id = r.id and status = 'accepted';
    perform 1 from profiles where id = any(v_pilots) order by id for update;
    for h in select eh.*, re.position, (select amount from point_transactions pt where pt.elo_history_id = eh.id) as pts
               from elo_history eh join race_entries re on re.race_id = eh.race_id and re.pilot_id = eh.profile_id
              where eh.race_id = r.id loop
      update profiles set
        elo = elo - h.delta,
        race_count = greatest(0, race_count - 1),
        race_wins = greatest(0, race_wins - (h.position = 1)::int),
        race_podiums = greatest(0, race_podiums - (h.position <= 3)::int)
       where id = h.profile_id;
      perform public.admin_claw_back_points(h.profile_id, h.pts);
    end loop;
    delete from elo_history where race_id = r.id;
    update races set status = 'cancelled' where id = r.id;
  else
    raise exception 'Unknown result type';
  end if;

  insert into admin_actions (action, profile_id, track_id, details)
  select 'cancel_' || p_kind, pid, v_track, jsonb_strip_nulls(jsonb_build_object('reason', nullif(btrim(p_note), '')))
    from unnest(v_pilots) pid;
end $$;

-- Derniers résultats validés d'un pilote (fiche admin), annulables.
create or replace function public.admin_pilot_results(p_profile uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return coalesce((select jsonb_agg(x order by (x->>'date') desc) from (
    (select jsonb_build_object('kind', 'match', 'id', m.id, 'date', m.confirmed_at, 'track', t.name,
                               'label', 'Défi contre ' || o.username, 'delta', h.delta,
                               'outcome', case when m.winner_id = p_profile then 'win' when m.winner_id is null then 'draw' else 'loss' end) x
       from elo_history h
       join matches m on m.id = h.match_id
       join challenges c on c.id = m.challenge_id
       join tracks t on t.id = c.track_id
       join profiles o on o.id = case when c.challenger_id = p_profile then c.opponent_id else c.challenger_id end
      where h.profile_id = p_profile
      order by m.confirmed_at desc limit 15)
    union all
    (select jsonb_build_object('kind', 'race', 'id', r.id, 'date', r.confirmed_at, 'track', t.name,
                               'label', 'Course · ' || re.position || 'e sur ' ||
                                        (select count(*) from race_entries x where x.race_id = r.id and x.status = 'accepted'),
                               'delta', h.delta, 'outcome', case when re.position = 1 then 'win' else 'loss' end)
       from elo_history h
       join races r on r.id = h.race_id
       join race_entries re on re.race_id = r.id and re.pilot_id = p_profile
       join tracks t on t.id = r.track_id
      where h.profile_id = p_profile
      order by r.confirmed_at desc limit 15)
    union all
    (select jsonb_build_object('kind', 'time_attack', 'id', s.id, 'date', s.validated_at, 'track', t.name,
                               'label', 'Time Attack', 'lap_ms', s.best_lap_ms, 'outcome', 'validated')
       from time_attack_sessions s join tracks t on t.id = s.track_id
      where s.pilot_id = p_profile and s.status = 'validated'
      order by s.validated_at desc limit 15)
  ) q), '[]'::jsonb);
end $$;

-- ========== TIME ATTACK SUSPECTS ==========
-- p_filter : suspect (> 3 % sous le meilleur temps précédent du circuit, non revus), recent (30 derniers validés).
create or replace function public.admin_time_attacks(p_filter text default 'suspect')
returns table (id uuid, pilot_id uuid, username text, track_id uuid, track_name text, best_lap_ms int,
               previous_best_ms int, gap_pct numeric, check_in_at timestamptz, ticket_at timestamptz,
               validated_at timestamptz, ticket_path text, ticket_name text, ocr_text text, reviewed boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return query
    select s.id, s.pilot_id, p.username, s.track_id, t.name, s.best_lap_ms, prev.best,
           case when prev.best > 0 then round((1 - s.best_lap_ms::numeric / prev.best) * 100, 1) end,
           s.check_in_at, s.ticket_at, s.validated_at, s.ticket_path, s.ticket_name, s.ocr_text,
           s.admin_reviewed_at is not null
      from time_attack_sessions s
      join profiles p on p.id = s.pilot_id
      join tracks t on t.id = s.track_id
      left join lateral (
        select min(x.best_lap_ms) as best from time_attack_sessions x
         where x.track_id = s.track_id and x.status = 'validated' and x.id <> s.id and x.validated_at < s.validated_at
      ) prev on true
     where s.status = 'validated'
       and case when p_filter = 'suspect'
                then s.admin_reviewed_at is null and prev.best is not null and s.best_lap_ms < prev.best * 0.97
                else true end
     order by s.validated_at desc
     limit case when p_filter = 'suspect' then 100 else 30 end;
end $$;

-- Chrono valide (revu) ou refusé : refusé, il sort des records et du badge, ses 30 points sont repris.
create or replace function public.admin_review_time_attack(p_id uuid, p_valid boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  s time_attack_sessions;
begin
  perform public.require_app_admin();
  select * into s from time_attack_sessions where id = p_id for update;
  if s.id is null or s.status <> 'validated' then
    raise exception 'Only a validated session can be reviewed';
  end if;
  if p_valid then
    update time_attack_sessions set admin_reviewed_at = now() where id = s.id;
  else
    update time_attack_sessions set status = 'rejected', admin_reviewed_at = now(),
                                    rejected_reason = nullif(btrim(p_reason), '')
     where id = s.id;
    perform public.admin_claw_back_points(s.pilot_id,
      (select amount from point_transactions where time_attack_id = s.id and reason = 'time_attack'));
    update feed_posts set certified = false, is_record = false where session_id = s.id;
  end if;
  insert into admin_actions (action, profile_id, track_id, details)
  values (case when p_valid then 'approve_time_attack' else 'reject_time_attack' end, s.pilot_id, s.track_id,
          jsonb_strip_nulls(jsonb_build_object('lap_ms', s.best_lap_ms, 'reason', nullif(btrim(p_reason), ''))));
end $$;

revoke execute on function public.admin_disputes(),
  public.admin_resolve_match(uuid, text, smallint, smallint, int, int, text),
  public.admin_resolve_race(uuid, text, text), public.admin_cancel_result(text, uuid, text),
  public.admin_pilot_results(uuid), public.admin_time_attacks(text), public.admin_review_time_attack(uuid, boolean, text)
  from public, anon;
grant execute on function public.admin_disputes(),
  public.admin_resolve_match(uuid, text, smallint, smallint, int, int, text),
  public.admin_resolve_race(uuid, text, text), public.admin_cancel_result(text, uuid, text),
  public.admin_pilot_results(uuid), public.admin_time_attacks(text), public.admin_review_time_attack(uuid, boolean, text)
  to authenticated;
