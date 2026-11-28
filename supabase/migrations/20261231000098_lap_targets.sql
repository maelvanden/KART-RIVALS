-- Kart Rivals : objectifs de chrono et notification « Tu t'es fait doubler ».
--
-- 1. my_lap_targets() : pour chaque circuit où le pilote connecté a un chrono validé, sa place au classement des
--    meilleurs tours, le pilote juste devant lui (« il te manque 0,322 s pour battre Lucas ») et le record du circuit.
--    Même classement que la fiche circuit (lap_records_private : défis, courses et Time Attack validés, démo exclue).
--
-- 2. Notification « 🏁 Lucas t'a doublé » : quand un nouveau chrono fait passer un pilote devant d'autres au classement
--    d'un circuit, chaque pilote doublé qui reste dans le top 10 est prévenu. L'ancien détenteur du record reçoit
--    déjà « 👑 Ton record est tombé » et n'est pas prévenu deux fois. Au-delà du top 10 (la liste de la fiche
--    circuit), rien n'est envoyé : un premier chrono rapide sur un circuit très fréquenté ne notifie pas tout le monde.

-- ========== OBJECTIFS ==========
create or replace function public.my_lap_targets()
returns table (
  track_id uuid, track_name text, lap_ms int, "position" bigint, pilots bigint,
  target_id uuid, target_username text, target_lap_ms int, target_position bigint,
  record_id uuid, record_username text, record_lap_ms int
)
language sql stable security definer set search_path = public as $$
  with board as materialized (
    select r.* from lap_records_private r
     where r.track_id in (select m.track_id from lap_records_private m where m.pilot_id = auth.uid())
  )
  select me.track_id, t.name, me.lap_ms, me.position,
         (select count(*) from board o where o.track_id = me.track_id),
         ahead.pilot_id, ap.username, ahead.lap_ms, ahead.position,
         rec.pilot_id, rp.username, rec.lap_ms
    from board me
    join tracks t on t.id = me.track_id
    -- Le pilote juste devant : le plus lent de ceux qui sont plus rapides.
    left join lateral (
      select o.pilot_id, o.lap_ms, o.position from board o
       where o.track_id = me.track_id and o.lap_ms < me.lap_ms
       order by o.lap_ms desc, o.set_at
       limit 1
    ) ahead on true
    left join profiles ap on ap.id = ahead.pilot_id
    -- Le record : le plus ancien en cas d'égalité, comme sur la fiche circuit.
    left join lateral (
      select o.pilot_id, o.lap_ms from board o where o.track_id = me.track_id order by o.lap_ms, o.set_at limit 1
    ) rec on true
    left join profiles rp on rp.id = rec.pilot_id
   where me.pilot_id = auth.uid()
   -- Objectifs les plus proches d'abord, records détenus à la fin.
   order by (me.lap_ms - ahead.lap_ms) nulls last, t.name;
$$;
revoke execute on function public.my_lap_targets() from public, anon;
grant execute on function public.my_lap_targets() to authenticated;

-- ========== « TU T'ES FAIT DOUBLER » ==========
-- Pilotes doublés par les chronos d'un événement (défi, course ou Time Attack), déjà inscrit dans lap_times_private.
-- Un pilote X est doublé par P quand X était devant P (ou à égalité, ou P n'avait pas de chrono) avant l'événement,
-- et qu'il est derrière le nouveau chrono de P après.
create or replace function public.notify_lap_overtakes(p_track uuid, p_source text, p_source_id uuid, p_skip uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c_top constant int := 10;
  v_track text := track_name(p_track);
  o record;
begin
  for o in
    with before as (
      select pilot_id, min(lap_ms) as lap_ms from lap_times_private
       where track_id = p_track and not (source = p_source and source_id = p_source_id)
       group by pilot_id
    ),
    after as (
      select pilot_id, min(lap_ms) as lap_ms from lap_times_private where track_id = p_track group by pilot_id
    ),
    movers as (
      select e.pilot_id, min(e.lap_ms) as lap_ms from lap_times_private e
       where e.track_id = p_track and e.source = p_source and e.source_id = p_source_id
       group by e.pilot_id
    )
    select distinct on (x.pilot_id)
           x.pilot_id as overtaken, m.pilot_id as mover, m.lap_ms as mover_lap, xa.lap_ms as overtaken_lap,
           1 + (select count(*) from after a where a.lap_ms < xa.lap_ms) as new_position
      from movers m
      left join before mb on mb.pilot_id = m.pilot_id
      join before x on x.pilot_id <> m.pilot_id and (mb.lap_ms is null or x.lap_ms <= mb.lap_ms)
      join after xa on xa.pilot_id = x.pilot_id and xa.lap_ms > m.lap_ms
     where x.pilot_id is distinct from p_skip
     -- Doublé par plusieurs pilotes d'une même course : une seule notification, pour le plus rapide.
     order by x.pilot_id, m.lap_ms
  loop
    continue when o.new_position > c_top;
    perform send_push(array[o.overtaken], '🏁 ' || pilot_name(o.mover) || ' t’a doublé',
      pilot_name(o.mover) || ' passe devant toi sur ' || v_track || ' : ' || format_lap_ms(o.mover_lap) || ', ' || format_gap_ms(o.overtaken_lap - o.mover_lap)
        || ' de mieux que toi. Tu es maintenant ' || o.new_position || 'e. À toi de jouer !',
      '/track/' || p_track);
  end loop;
end $$;
revoke execute on function public.notify_lap_overtakes(uuid, text, uuid, uuid) from public, anon, authenticated;

-- Reprise de notify_lap_record (migration …_lap_records_all_sources.sql) : même notification « Ton record est
-- tombé », puis celles des pilotes doublés.
create or replace function public.notify_lap_record(p_track uuid, p_source text, p_source_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_new_pilot uuid;
  v_new_lap int;
  v_old_pilot uuid;
  v_old_lap int;
  v_dethroned uuid;
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

  if v_old_pilot is not null and v_new_lap < v_old_lap and v_old_pilot <> v_new_pilot then
    v_dethroned := v_old_pilot;
    perform send_push(array[v_old_pilot], '👑 Ton record est tombé',
      pilot_name(v_new_pilot) || ' t’a pris le record '
        -- Élision : « d’Inwall Kart », « de SpeedPark ».
        || case when v_track ~* '^[aeiouyhàâäéèêëîïôöùûü]' then 'd’' else 'de ' end
        || v_track || ' : ' || format_lap_ms(v_new_lap)
        || ', ' || format_gap_ms(v_old_lap - v_new_lap) || ' de mieux que toi. À toi de le reprendre !',
      '/track/' || p_track);
  end if;

  perform notify_lap_overtakes(p_track, p_source, p_source_id, v_dethroned);
exception when others then
  -- Une notification ne doit jamais bloquer une validation.
  raise warning 'notify_lap_record: %', sqlerrm;
end $$;
revoke execute on function public.notify_lap_record(uuid, text, uuid) from public, anon, authenticated;
