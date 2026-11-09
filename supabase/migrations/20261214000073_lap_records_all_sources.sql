-- Kart Rivals : records du tour, toutes sources confondues.
-- Jusqu'ici, seuls les défis validés au format « meilleur tour » comptaient pour les records (fiche circuit, profil,
-- liste des circuits), alors que le badge « Record » de l'Actu ne regardait que le Time Attack : un même chrono pouvait
-- être « record » dans l'Actu et absent de la fiche circuit. Désormais, un seul record par circuit, calculé sur :
--   - les défis validés (quel que soit le format, dès qu'un meilleur tour a été saisi) ;
--   - les courses de groupe validées (pilotes inscrits) ;
--   - les sessions Time Attack validées (ticket lu ou revue admin).
-- Comptes de démo toujours exclus. La notification « Ton record est tombé » suit ce même record, quelle que soit la
-- source du nouveau chrono.

-- ========== CHRONOS ==========
-- Colonnes ajoutées à la fin (source, source_id) : la vue lap_records_private, qui en dépend, reste inchangée.
create or replace view public.lap_times_private as
  select c.track_id, c.challenger_id as pilot_id, m.challenger_best_lap_ms as lap_ms, m.confirmed_at,
         'challenge'::text as source, m.id as source_id
  from public.matches m join public.challenges c on c.id = m.challenge_id
  where m.status = 'confirmed' and m.challenger_best_lap_ms is not null
    and not exists (select 1 from public.profiles d where d.id = c.challenger_id and d.is_demo)
  union all
  select c.track_id, c.opponent_id, m.opponent_best_lap_ms, m.confirmed_at, 'challenge', m.id
  from public.matches m join public.challenges c on c.id = m.challenge_id
  where m.status = 'confirmed' and m.opponent_best_lap_ms is not null
    and not exists (select 1 from public.profiles d where d.id = c.opponent_id and d.is_demo)
  union all
  select r.track_id, e.pilot_id, e.best_lap_ms, r.confirmed_at, 'race', r.id
  from public.race_entries e join public.races r on r.id = e.race_id
  where r.status = 'confirmed' and e.status = 'accepted' and e.best_lap_ms is not null and r.confirmed_at is not null
    and not exists (select 1 from public.profiles d where d.id = e.pilot_id and d.is_demo)
  union all
  select s.track_id, s.pilot_id, s.best_lap_ms, coalesce(s.validated_at, s.ticket_at), 'time_attack', s.id
  from public.time_attack_sessions s
  where s.status = 'validated' and s.best_lap_ms is not null
    and not exists (select 1 from public.profiles d where d.id = s.pilot_id and d.is_demo);

revoke all on public.lap_times_private from anon, authenticated;

-- ========== NOTIFICATION « TON RECORD EST TOMBÉ » ==========
-- Appelée après la validation d'un défi, d'une course ou d'un Time Attack (le nouveau chrono est déjà dans la vue).
-- Compare le meilleur tour de cet événement au record du circuit sans cet événement ; prévient l'ancien détenteur
-- si le record change de main.
create or replace function public.notify_lap_record(p_track uuid, p_source text, p_source_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_new_pilot uuid;
  v_new_lap int;
  v_old_pilot uuid;
  v_old_lap int;
  v_track text := track_name(p_track);
begin
  select pilot_id, lap_ms into v_new_pilot, v_new_lap
    from lap_times_private
   where track_id = p_track and source = p_source and source_id = p_source_id
   order by lap_ms
   limit 1;
  if v_new_pilot is null then
    return;
  end if;

  -- Record précédent : le plus ancien en cas d'égalité, comme sur la fiche circuit.
  select pilot_id, lap_ms into v_old_pilot, v_old_lap
    from lap_times_private
   where track_id = p_track and not (source = p_source and source_id = p_source_id)
   order by lap_ms, confirmed_at
   limit 1;

  if v_old_pilot is null or v_new_lap >= v_old_lap or v_old_pilot = v_new_pilot then
    return;
  end if;

  perform send_push(array[v_old_pilot], '👑 Ton record est tombé',
    pilot_name(v_new_pilot) || ' t’a pris le record '
      -- Élision : « d’Inwall Kart », « de SpeedPark ».
      || case when v_track ~* '^[aeiouyhàâäéèêëîïôöùûü]' then 'd’' else 'de ' end
      || v_track || ' : ' || format_lap_ms(v_new_lap)
      || ', ' || format_gap_ms(v_old_lap - v_new_lap) || ' de mieux que toi. À toi de le reprendre !',
    '/track/' || p_track);
exception when others then
  -- Une notification ne doit jamais bloquer une validation.
  raise warning 'notify_lap_record: %', sqlerrm;
end $$;
revoke execute on function public.notify_lap_record(uuid, text, uuid) from public, anon, authenticated;

-- Défis : tous formats désormais (un meilleur tour saisi compte, même en course à la position).
create or replace function public.push_on_lap_record()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    perform notify_lap_record((select track_id from challenges where id = new.challenge_id), 'challenge', new.id);
  end if;
  return new;
end $$;

create or replace function public.push_on_race_lap_record()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    perform notify_lap_record(new.track_id, 'race', new.id);
  end if;
  return new;
end $$;
drop trigger if exists races_push_lap_record on public.races;
create trigger races_push_lap_record after update of status on public.races
  for each row execute function public.push_on_race_lap_record();

create or replace function public.push_on_time_attack_lap_record()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'validated' and old.status is distinct from 'validated' then
    perform notify_lap_record(new.track_id, 'time_attack', new.id);
  end if;
  return new;
end $$;
drop trigger if exists time_attack_push_lap_record on public.time_attack_sessions;
create trigger time_attack_push_lap_record after update of status on public.time_attack_sessions
  for each row execute function public.push_on_time_attack_lap_record();

revoke execute on function public.push_on_lap_record(), public.push_on_race_lap_record(),
  public.push_on_time_attack_lap_record() from public, anon, authenticated;

-- ========== ACTU ==========
-- Badge « Record » : le chrono certifié égale le record du circuit (toutes sources), et non plus le seul meilleur
-- Time Attack. Reste du comportement inchangé.
create or replace function public.create_post(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_session time_attack_sessions;
  v_track uuid := nullif(p->>'track_id', '')::uuid;
  v_lap int := nullif(p->>'lap_ms', '')::int;
  v_certified boolean := false;
  v_record boolean := false;
  v_id uuid;
begin
  if (select count(*) from feed_posts where author_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many posts today';
  end if;
  if nullif(p->>'media_path', '') is not null and split_part(p->>'media_path', '/', 1) <> auth.uid()::text then
    raise exception 'Invalid media';
  end if;
  if nullif(p->>'session_id', '') is not null then
    select * into v_session from time_attack_sessions
     where id = (p->>'session_id')::uuid and pilot_id = auth.uid() and status = 'validated';
    if v_session.id is null then
      raise exception 'Time Attack session not found';
    end if;
    v_track := v_session.track_id;
    v_lap := v_session.best_lap_ms;
    v_certified := v_lap is not null;
    -- Compte de démo : ses chronos ne sont pas dans la vue, on le compare alors à lui-même.
    v_record := v_certified and v_lap <= coalesce(
      (select min(lap_ms) from lap_times_private where track_id = v_track), v_lap);
  end if;

  insert into feed_posts (author_id, track_id, caption, lap_ms, kart_category, conditions, weight_class, media_path,
                          media_type, media_width, media_height, session_id, certified, is_record)
  values (auth.uid(), v_track, nullif(btrim(p->>'caption'), ''), v_lap, nullif(btrim(p->>'kart_category'), ''),
          nullif(p->>'conditions', ''), nullif(btrim(p->>'weight_class'), ''), nullif(p->>'media_path', ''),
          nullif(p->>'media_type', ''), nullif(p->>'media_width', '')::int, nullif(p->>'media_height', '')::int,
          v_session.id, v_certified, v_record)
  returning id into v_id;
  return v_id;
end $$;
