-- Kart Rivals : petite finale, dates limites et tournoi sur place.
--   - third_place : duel pour la 3e place entre les deux demi-finalistes battus (case « finale, slot 1 » du tableau).
--   - round_days : délai pour jouer chaque duel. Rappel aux deux pilotes la veille ; passé le délai, l'organisateur est
--     prévenu et peut prononcer un forfait.
--   - registration_closes_at : clôture des inscriptions. Rappel la veille aux inscrits, puis tirage automatique
--     (s'il y a assez de pilotes ; sinon l'organisateur est prévenu et les inscriptions restent ouvertes).
--   - on_site : tournoi sur place, l'organisateur saisit lui-même le résultat de chaque duel et le tableau avance
--     aussitôt. Ces duels ne comptent pour l'ELO que dans un tournoi officiel (tenu par le karting) : ailleurs, un
--     résultat saisi par une seule personne ne doit pas pouvoir toucher au classement d'un autre pilote.

alter table public.tournaments
  add column if not exists third_place boolean not null default false,
  add column if not exists round_days smallint check (round_days between 1 and 30),
  add column if not exists registration_closes_at timestamptz,
  add column if not exists closing_reminded_at timestamptz,
  add column if not exists on_site boolean not null default false,
  add column if not exists third_place_id uuid references public.profiles (id) on delete set null;

alter table public.tournament_matches
  add column if not exists deadline_at timestamptz,
  add column if not exists reminded_at timestamptz,
  add column if not exists overdue_notified_at timestamptz;

create or replace function public.tournament_match_label(p_round int, p_slot int, p_rounds int)
returns text language sql immutable as $$
  select case when p_round = p_rounds and p_slot = 1 then 'Petite finale'
              else public.tournament_round_label(p_round, p_rounds) end;
$$;

-- ========== MOTEUR DU TABLEAU ==========
create or replace function public.tournament_resolve(p_match_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  tm tournament_matches;
  t tournaments;
  v_challenge uuid;
  v_label text;
  v_deadline timestamptz;
begin
  select * into tm from tournament_matches where id = p_match_id for update;
  if tm.decided_at is not null or tm.challenge_id is not null then
    return;
  end if;
  select * into t from tournaments where id = tm.tournament_id;
  if t.status <> 'running' then
    return;
  end if;

  if tm.pilot_a is not null and tm.pilot_b is not null then
    v_label := tournament_match_label(tm.round, tm.slot, tournament_rounds(t.size));
    v_deadline := case when t.round_days is not null and not t.on_site then now() + make_interval(days => t.round_days) end;
    insert into challenges (challenger_id, opponent_id, track_id, scheduled_at, format, message, status, responded_at, tournament_id)
    values (tm.pilot_a, tm.pilot_b, t.track_id, t.starts_at, t.format,
            left('🏆 ' || t.name || ' · ' || v_label, 280), 'accepted', now(), t.id)
    returning id into v_challenge;
    update tournament_matches
       set challenge_id = v_challenge, deadline_at = v_deadline, reminded_at = null, overdue_notified_at = null
     where id = tm.id;
    perform send_push(array[tm.pilot_a, tm.pilot_b],
      '🏆 ' || v_label,
      pilot_name(tm.pilot_a) || ' contre ' || pilot_name(tm.pilot_b) || ' · ' || t.name || ' à ' || track_name(t.track_id)
        || coalesce(' · à jouer avant le ' || to_char(v_deadline at time zone 'Europe/Paris', 'DD/MM'), ''),
      case when t.on_site then '/tournament/' || t.id else '/challenge/' || v_challenge end);
  else
    -- Case vide en face : qualifié d'office (ou case vide qui remonte, si personne).
    perform tournament_decide(tm.id, coalesce(tm.pilot_a, tm.pilot_b), 'bye');
  end if;
end $$;

create or replace function public.tournament_decide(p_match_id uuid, p_winner uuid, p_outcome text) returns void
language plpgsql security definer set search_path = public as $$
declare
  tm tournament_matches;
  t tournaments;
  v_rounds int;
  v_loser uuid;
  v_next uuid;
  v_third uuid;
  v_sibling_done boolean;
begin
  select * into t from tournaments
   where id = (select tournament_id from tournament_matches where id = p_match_id) for update;
  if t.status is distinct from 'running' then
    return; -- Tournoi annulé entre-temps : plus rien ne bouge.
  end if;
  update tournament_matches
     set winner_id = p_winner, outcome = p_outcome, decided_at = now()
   where id = p_match_id and decided_at is null
  returning * into tm;
  if tm.id is null then
    return;
  end if;
  v_rounds := tournament_rounds(t.size);
  v_loser := case when p_winner = tm.pilot_a then tm.pilot_b else tm.pilot_a end;

  if tm.round = v_rounds then
    if tm.slot = 0 then
      update tournaments set champion_id = p_winner, runner_up_id = v_loser where id = t.id;
    else
      update tournaments set third_place_id = p_winner where id = t.id;
    end if;
    -- Terminé quand la finale et, s'il y en a une, la petite finale sont jouées.
    if not exists (select 1 from tournament_matches
                    where tournament_id = t.id and round = v_rounds and decided_at is null) then
      update tournaments set status = 'completed', completed_at = now() where id = t.id returning * into t;
      insert into point_transactions (profile_id, amount, reason)
        select x.pilot, x.amount, 'tournament'
          from (values (t.champion_id, 300), (t.runner_up_id, 100), (t.third_place_id, 50)) as x (pilot, amount)
         where x.pilot is not null;
      perform send_push(array(select pilot_id from tournament_entries where tournament_id = t.id),
        '🏆 ' || pilot_name(t.champion_id) || ' remporte le tournoi',
        t.name || ' à ' || track_name(t.track_id) || ' : le trophée est attribué.',
        '/tournament/' || t.id);
    end if;
    return;
  end if;

  -- Le vainqueur prend sa place au tour suivant (case paire = pilote A, impaire = pilote B).
  update tournament_matches
     set pilot_a = case when tm.slot % 2 = 0 then p_winner else pilot_a end,
         pilot_b = case when tm.slot % 2 = 1 then p_winner else pilot_b end
   where tournament_id = t.id and round = tm.round + 1 and slot = tm.slot / 2
  returning id into v_next;

  -- Demi-finale : le battu va en petite finale.
  if tm.round = v_rounds - 1 and t.third_place then
    update tournament_matches
       set pilot_a = case when tm.slot = 0 then v_loser else pilot_a end,
           pilot_b = case when tm.slot = 1 then v_loser else pilot_b end
     where tournament_id = t.id and round = v_rounds and slot = 1
    returning id into v_third;
  end if;

  select decided_at is not null into v_sibling_done
    from tournament_matches
   where tournament_id = t.id and round = tm.round and slot = (tm.slot # 1);
  if v_sibling_done then
    perform tournament_resolve(v_next);
    if v_third is not null then
      perform tournament_resolve(v_third);
    end if;
  end if;
end $$;

create or replace function public.tournament_launch(p_tournament_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  v_order int[];
  v_rounds int;
  v_pilots uuid[];
  r int;
  s int;
  m record;
begin
  select * into t from tournaments where id = p_tournament_id for update;
  if t.status <> 'registration' then
    return;
  end if;
  v_rounds := tournament_rounds(t.size);
  v_order := tournament_seed_order(t.size);

  -- Têtes de série par ELO au lancement (à égalité : premier inscrit).
  with ranked as (
    select e.pilot_id, p.elo, row_number() over (order by p.elo desc, e.joined_at) as seed
      from tournament_entries e join profiles p on p.id = e.pilot_id
     where e.tournament_id = t.id
  )
  update tournament_entries e set seed = r2.seed, elo_at_start = r2.elo
    from ranked r2
   where e.tournament_id = t.id and e.pilot_id = r2.pilot_id;

  select array_agg(pilot_id order by seed) into v_pilots from tournament_entries where tournament_id = t.id;

  update tournaments set status = 'running', started_at = now() where id = t.id;

  for r in 1..v_rounds loop
    for s in 0..(t.size / power(2, r)::int - 1) loop
      insert into tournament_matches (tournament_id, round, slot, pilot_a, pilot_b)
      values (t.id, r, s,
              case when r = 1 then v_pilots[v_order[2 * s + 1]] end,
              case when r = 1 then v_pilots[v_order[2 * s + 2]] end);
    end loop;
  end loop;
  -- Petite finale : à côté de la finale (slot 1), remplie par les battus des demi-finales.
  if t.third_place then
    insert into tournament_matches (tournament_id, round, slot) values (t.id, v_rounds, 1);
  end if;

  for m in select id from tournament_matches where tournament_id = t.id and round = 1 order by slot loop
    perform tournament_resolve(m.id);
  end loop;
end $$;

revoke execute on function public.tournament_resolve(uuid), public.tournament_decide(uuid, uuid, text),
  public.tournament_launch(uuid) from public, anon, authenticated;

-- ========== CRÉATION ==========
-- p_options : third_place, round_days, registration_closes_at, on_site (clés absentes = valeurs par défaut).
drop function if exists public.create_tournament(uuid, text, int, public.race_format, timestamptz, text, boolean, text,
  boolean, boolean, boolean, int, int);
create or replace function public.create_tournament(
  p_track_id uuid,
  p_name text,
  p_size int,
  p_format public.race_format default 'position',
  p_starts_at timestamptz default null,
  p_message text default null,
  p_is_private boolean default false,
  p_prize text default null,
  p_is_official boolean default false,
  p_participate boolean default true,
  p_auto_start boolean default true,
  p_min_elo int default null,
  p_max_elo int default null,
  p_options jsonb default '{}'
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_official boolean := coalesce(p_is_official, false);
  v_options jsonb := coalesce(p_options, '{}');
  v_closes timestamptz := nullif(v_options->>'registration_closes_at', '')::timestamptz;
begin
  if auth.uid() is null or public.is_restricted(auth.uid()) then
    raise exception 'Account restricted';
  end if;
  if p_size not in (4, 8, 16, 32) then
    raise exception 'A tournament has 4, 8, 16 or 32 pilots';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 3 and 60 then
    raise exception 'Tournament name must be 3 to 60 characters';
  end if;
  if p_min_elo is not null and p_max_elo is not null and p_min_elo > p_max_elo then
    raise exception 'Invalid ELO range';
  end if;
  if v_closes is not null and v_closes < now() then
    raise exception 'Registration deadline must be in the future';
  end if;
  if v_official and not public.is_track_manager(p_track_id) then
    raise exception 'Only the track admins can organize an official tournament';
  end if;
  if (select count(*) from tournaments
       where organizer_id = auth.uid() and status in ('registration', 'running')) >= (case when v_official then 10 else 3 end) then
    raise exception 'Too many open tournaments';
  end if;

  insert into tournaments (organizer_id, track_id, name, size, format, starts_at, message, is_private, prize, is_official,
                           auto_start, min_elo, max_elo, third_place, round_days, registration_closes_at, on_site)
  values (auth.uid(), p_track_id, trim(p_name), p_size, p_format, p_starts_at, nullif(trim(p_message), ''),
          coalesce(p_is_private, false) and not v_official, nullif(left(trim(p_prize), 120), ''), v_official,
          coalesce(p_auto_start, true), p_min_elo, p_max_elo,
          coalesce((v_options->>'third_place')::boolean, false),
          nullif(v_options->>'round_days', '')::smallint,
          v_closes,
          coalesce((v_options->>'on_site')::boolean, false))
  returning id into v_id;

  if (not v_official or coalesce(p_participate, true)) and public.tournament_accepts(v_id, auth.uid()) then
    insert into tournament_entries (tournament_id, pilot_id) values (v_id, auth.uid());
  else
    insert into conversation_members (conversation_id, profile_id)
      select c.id, auth.uid() from conversations c where c.tournament_id = v_id
    on conflict do nothing;
  end if;

  if v_official then
    perform send_push(
      array(select p.id from profiles p
             where p.promo_push is true and p.banned_at is null and not p.is_demo and p.id <> auth.uid()
               and public.is_track_pilot(p_track_id, p.id)
               and public.tournament_accepts(v_id, p.id)),
      '🏆 Tournoi officiel · ' || track_name(p_track_id),
      trim(p_name) || coalesce(' · à gagner : ' || nullif(left(trim(p_prize), 120), ''), '') || '. Inscriptions ouvertes.',
      '/tournament/' || v_id);
  end if;
  return v_id;
end $$;
revoke execute on function public.create_tournament(uuid, text, int, public.race_format, timestamptz, text, boolean, text,
  boolean, boolean, boolean, int, int, jsonb) from public, anon;
grant execute on function public.create_tournament(uuid, text, int, public.race_format, timestamptz, text, boolean, text,
  boolean, boolean, boolean, int, int, jsonb) to authenticated;

-- ========== MODIFICATION ==========
-- En plus : clôture des inscriptions (tant qu'elles sont ouvertes) et bascule « sur place ».
create or replace function public.update_tournament(p_tournament_id uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  v_name text;
  v_auto boolean;
begin
  select * into t from tournaments where id = p_tournament_id for update;
  if t.id is null then
    raise exception 'Tournament not found';
  end if;
  if t.organizer_id <> auth.uid() and not public.is_app_admin() then
    raise exception 'Only the organizer can edit the tournament';
  end if;
  if t.status in ('completed', 'cancelled') then
    raise exception 'Tournament is over';
  end if;
  v_name := case when p_data ? 'name' then btrim(p_data->>'name') else t.name end;
  if char_length(coalesce(v_name, '')) not between 3 and 60 then
    raise exception 'Tournament name must be 3 to 60 characters';
  end if;
  v_auto := case when p_data ? 'auto_start' and t.status = 'registration'
                 then coalesce((p_data->>'auto_start')::boolean, t.auto_start) else t.auto_start end;

  update tournaments set
    name       = v_name,
    starts_at  = case when p_data ? 'starts_at' then nullif(p_data->>'starts_at', '')::timestamptz else starts_at end,
    message    = case when p_data ? 'message' then nullif(left(btrim(p_data->>'message'), 280), '') else message end,
    banner_url = case when p_data ? 'banner_url' then nullif(p_data->>'banner_url', '') else banner_url end,
    prize      = case when p_data ? 'prize' then nullif(left(btrim(p_data->>'prize'), 120), '') else prize end,
    is_private = case when p_data ? 'is_private' and t.status = 'registration' and not t.is_official
                      then coalesce((p_data->>'is_private')::boolean, is_private) else is_private end,
    auto_start = v_auto,
    on_site    = case when p_data ? 'on_site' then coalesce((p_data->>'on_site')::boolean, on_site) else on_site end,
    registration_closes_at = case when p_data ? 'registration_closes_at' and t.status = 'registration'
                                  then nullif(p_data->>'registration_closes_at', '')::timestamptz
                                  else registration_closes_at end,
    closing_reminded_at = case when p_data ? 'registration_closes_at' then null else closing_reminded_at end
  where id = t.id;

  -- Repassé en lancement automatique alors que le tableau est déjà plein : il part tout de suite.
  if v_auto and not t.auto_start and t.status = 'registration'
     and (select count(*) from tournament_entries where tournament_id = t.id) >= t.size then
    perform tournament_launch(t.id);
  end if;
end $$;

-- ========== TOURNOI SUR PLACE : RÉSULTAT SAISI PAR L'ORGANISATEUR ==========
create or replace function public.record_tournament_result(
  p_match_id uuid,
  p_a_position smallint default null,
  p_b_position smallint default null,
  p_a_best_lap_ms int default null,
  p_b_best_lap_ms int default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  tm tournament_matches;
  t tournaments;
  c challenges;
  v_winner uuid;
  v_match uuid;
  v_a_is_challenger boolean;
begin
  select * into tm from tournament_matches where id = p_match_id for update;
  select * into t from tournaments where id = tm.tournament_id;
  if tm.id is null then
    raise exception 'Tournament match not found';
  end if;
  if t.organizer_id <> auth.uid() and not public.is_app_admin() then
    raise exception 'Only the organizer can record results';
  end if;
  if not t.on_site then
    raise exception 'Results are recorded by the organizer only in on-site tournaments';
  end if;
  if tm.decided_at is not null or tm.challenge_id is null or t.status <> 'running' then
    raise exception 'This duel is not being played';
  end if;

  if t.format = 'position' then
    if p_a_position is null or p_b_position is null or p_a_position < 1 or p_b_position < 1 then
      raise exception 'Both positions are required';
    end if;
    v_winner := case when p_a_position < p_b_position then tm.pilot_a when p_b_position < p_a_position then tm.pilot_b end;
  else
    if p_a_best_lap_ms is null or p_b_best_lap_ms is null or p_a_best_lap_ms < 1 or p_b_best_lap_ms < 1 then
      raise exception 'Both lap times are required';
    end if;
    v_winner := case when p_a_best_lap_ms < p_b_best_lap_ms then tm.pilot_a
                     when p_b_best_lap_ms < p_a_best_lap_ms then tm.pilot_b end;
  end if;
  if v_winner is null then
    raise exception 'A tournament duel cannot end in a tie';
  end if;

  if t.is_official then
    -- Tournoi tenu par le karting : le résultat vaut validation, ELO compris. Le karting ne juge pas son propre duel.
    if auth.uid() in (tm.pilot_a, tm.pilot_b) and not public.is_app_admin() then
      raise exception 'You cannot record your own duel';
    end if;
    select * into c from challenges where id = tm.challenge_id;
    v_a_is_challenger := c.challenger_id = tm.pilot_a;
    insert into matches (challenge_id, submitted_by, challenger_position, opponent_position,
                         challenger_best_lap_ms, opponent_best_lap_ms, winner_id, status,
                         challenger_confirmed_at, opponent_confirmed_at, dispute_reason)
    values (c.id, auth.uid(),
            case when v_a_is_challenger then p_a_position else p_b_position end,
            case when v_a_is_challenger then p_b_position else p_a_position end,
            case when v_a_is_challenger then p_a_best_lap_ms else p_b_best_lap_ms end,
            case when v_a_is_challenger then p_b_best_lap_ms else p_a_best_lap_ms end,
            v_winner, 'awaiting_confirmation', now(), now(), null)
    on conflict (challenge_id) do update set
      submitted_by = excluded.submitted_by,
      challenger_position = excluded.challenger_position,
      opponent_position = excluded.opponent_position,
      challenger_best_lap_ms = excluded.challenger_best_lap_ms,
      opponent_best_lap_ms = excluded.opponent_best_lap_ms,
      winner_id = excluded.winner_id,
      status = excluded.status,
      challenger_confirmed_at = excluded.challenger_confirmed_at,
      opponent_confirmed_at = excluded.opponent_confirmed_at,
      dispute_reason = null
    returning id into v_match;
    -- Applique l'ELO et clôt le défi : le déclencheur du tableau recopie le score et fait monter le vainqueur.
    perform apply_match_elo(v_match);
  else
    -- Entre pilotes : le tableau avance, sans toucher à l'ELO.
    update tournament_matches
       set a_position = p_a_position, b_position = p_b_position,
           a_best_lap_ms = p_a_best_lap_ms, b_best_lap_ms = p_b_best_lap_ms
     where id = tm.id;
    perform tournament_decide(tm.id, v_winner, 'race');
    delete from matches where challenge_id = tm.challenge_id and status <> 'confirmed';
    update challenges set status = 'cancelled' where id = tm.challenge_id;
  end if;
end $$;
revoke execute on function public.record_tournament_result(uuid, smallint, smallint, int, int) from public, anon;
grant execute on function public.record_tournament_result(uuid, smallint, smallint, int, int) to authenticated;

-- ========== HORLOGE : clôtures, rappels, retards (toutes les 15 minutes) ==========
create or replace function public.tournament_clock()
returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  m record;
begin
  -- Veille de la clôture : rappel aux inscrits.
  for t in
    select * from tournaments
     where status = 'registration' and closing_reminded_at is null
       and registration_closes_at > now() and registration_closes_at <= now() + interval '24 hours'
     for update skip locked
  loop
    update tournaments set closing_reminded_at = now() where id = t.id;
    perform send_push(array(select pilot_id from tournament_entries where tournament_id = t.id),
      '🏆 ' || t.name,
      'Clôture des inscriptions et tirage du tableau le '
        || to_char(t.registration_closes_at at time zone 'Europe/Paris', 'DD/MM à HH24hMI') || '.',
      '/tournament/' || t.id);
  end loop;

  -- Clôture : tirage s'il y a assez de pilotes, sinon l'organisateur décide.
  for t in
    select * from tournaments
     where status = 'registration' and registration_closes_at <= now()
     for update skip locked
  loop
    if (select count(*) from tournament_entries where tournament_id = t.id) >= tournament_min_pilots(t.size) then
      perform tournament_launch(t.id);
    else
      update tournaments set registration_closes_at = null where id = t.id;
      perform send_push(array[t.organizer_id], '🏆 ' || t.name,
        'Clôture des inscriptions atteinte, mais il manque des pilotes pour tirer le tableau ('
          || tournament_min_pilots(t.size) || ' minimum). Les inscriptions restent ouvertes.',
        '/tournament/' || t.id);
    end if;
  end loop;

  -- Duels : rappel la veille de l'échéance, puis alerte à l'organisateur une fois le délai passé.
  for m in
    select tm.id, tm.pilot_a, tm.pilot_b, tm.round, tm.slot, tm.deadline_at, tm.reminded_at,
           tr.id as tournament_id, tr.name, tr.size, tr.organizer_id, tm.challenge_id
      from tournament_matches tm join tournaments tr on tr.id = tm.tournament_id
     where tr.status = 'running' and tm.decided_at is null and tm.challenge_id is not null
       and tm.deadline_at is not null and tm.overdue_notified_at is null
       and tm.deadline_at <= now() + interval '24 hours'
     for update of tm skip locked
  loop
    if m.deadline_at <= now() then
      update tournament_matches set overdue_notified_at = now() where id = m.id;
      perform send_push(array[m.organizer_id], '⏰ Duel en retard · ' || m.name,
        tournament_match_label(m.round, m.slot, tournament_rounds(m.size)) || ' : ' || pilot_name(m.pilot_a)
          || ' contre ' || pilot_name(m.pilot_b) || ' n’a pas été joué à temps. Tu peux prononcer un forfait.',
        '/tournament/' || m.tournament_id);
      perform send_push(array[m.pilot_a, m.pilot_b], '⏰ Délai dépassé · ' || m.name,
        'Votre duel devait être joué : l’organisateur peut maintenant prononcer un forfait.',
        '/challenge/' || m.challenge_id);
    elsif m.reminded_at is null then
      update tournament_matches set reminded_at = now() where id = m.id;
      perform send_push(array[m.pilot_a, m.pilot_b], '⏰ Plus que 24 h · ' || m.name,
        tournament_match_label(m.round, m.slot, tournament_rounds(m.size)) || ' à jouer avant le '
          || to_char(m.deadline_at at time zone 'Europe/Paris', 'DD/MM à HH24hMI') || '.',
        '/challenge/' || m.challenge_id);
    end if;
  end loop;
end $$;
revoke execute on function public.tournament_clock() from public, anon, authenticated;

select cron.schedule('tournament-clock', '*/15 * * * *', 'select public.tournament_clock()');
