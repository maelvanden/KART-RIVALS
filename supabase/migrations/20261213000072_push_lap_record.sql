-- Kart Rivals : notification « Ton record est tombé ».
-- Quand un défi au format « meilleur tour » est validé et qu'un des deux pilotes bat le record du circuit (celui de la
-- fiche circuit, calculé comme lap_times_private : défis validés, comptes de démo exclus), l'ancien détenteur reçoit :
--   « 👑 Ton record est tombé — Lucas t'a pris le record d'Inwall Kart : 34.255, 0,2 s de mieux que toi. »
-- Toucher la notification ouvre la fiche du circuit. Rien n'est envoyé si le record ne change pas de main
-- (le détenteur améliore son propre temps) ou s'il n'y avait pas encore de record.

-- 62345 → « 1:02.345 », 34255 → « 34.255 » (même format que l'appli).
create or replace function public.format_lap_ms(p_ms int)
returns text language sql immutable as $$
  select case when p_ms >= 60000
              then (p_ms / 60000) || ':' || lpad(((p_ms % 60000) / 1000)::text, 2, '0') || '.' || lpad((p_ms % 1000)::text, 3, '0')
              else (p_ms / 1000) || '.' || lpad((p_ms % 1000)::text, 3, '0') end;
$$;

-- 1234 → « 1,2 s », 456 → « 0,46 s », 45 → « 0,045 s » (même arrondi que la progression par circuit).
create or replace function public.format_gap_ms(p_ms int)
returns text language sql immutable as $$
  select replace(to_char(abs(p_ms) / 1000.0,
                         case when abs(p_ms) >= 1000 then 'FM9990.0' when abs(p_ms) >= 100 then 'FM0.00' else 'FM0.000' end),
                 '.', ',') || ' s';
$$;
revoke execute on function public.format_lap_ms(int), public.format_gap_ms(int) from public, anon, authenticated;

create or replace function public.push_on_lap_record()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c challenges;
  v_new_pilot uuid;
  v_new_lap int;
  v_old_pilot uuid;
  v_old_lap int;
begin
  if new.status <> 'confirmed' or old.status = 'confirmed' then
    return new;
  end if;
  select * into c from challenges where id = new.challenge_id;
  if c.format <> 'lap_time' then
    return new;
  end if;

  -- Meilleur tour de ce défi (pilotes de démo exclus, comme le classement des tours).
  select pilot_id, lap_ms into v_new_pilot, v_new_lap
    from (values (c.challenger_id, new.challenger_best_lap_ms), (c.opponent_id, new.opponent_best_lap_ms)) as v (pilot_id, lap_ms)
   where lap_ms is not null
     and not exists (select 1 from profiles d where d.id = v.pilot_id and d.is_demo)
   order by lap_ms
   limit 1;
  if v_new_pilot is null then
    return new;
  end if;

  -- Record du circuit avant ce défi : le plus ancien en cas d'égalité, comme sur la fiche circuit.
  select pilot_id, lap_ms into v_old_pilot, v_old_lap
    from (
      select oc.challenger_id as pilot_id, om.challenger_best_lap_ms as lap_ms, om.confirmed_at
        from matches om join challenges oc on oc.id = om.challenge_id
       where om.status = 'confirmed' and om.id <> new.id and oc.format = 'lap_time' and oc.track_id = c.track_id
         and om.challenger_best_lap_ms is not null
      union all
      select oc.opponent_id, om.opponent_best_lap_ms, om.confirmed_at
        from matches om join challenges oc on oc.id = om.challenge_id
       where om.status = 'confirmed' and om.id <> new.id and oc.format = 'lap_time' and oc.track_id = c.track_id
         and om.opponent_best_lap_ms is not null
    ) laps
   where not exists (select 1 from profiles d where d.id = laps.pilot_id and d.is_demo)
   order by lap_ms, confirmed_at
   limit 1;

  if v_old_pilot is null or v_new_lap >= v_old_lap or v_old_pilot = v_new_pilot then
    return new;
  end if;

  perform send_push(array[v_old_pilot], '👑 Ton record est tombé',
    pilot_name(v_new_pilot) || ' t’a pris le record '
      -- Élision : « d’Inwall Kart », « de SpeedPark ».
      || case when track_name(c.track_id) ~* '^[aeiouyhàâäéèêëîïôöùûü]' then 'd’' else 'de ' end
      || track_name(c.track_id) || ' : ' || format_lap_ms(v_new_lap)
      || ', ' || format_gap_ms(v_old_lap - v_new_lap) || ' de mieux que toi. À toi de le reprendre !',
    '/track/' || c.track_id);
  return new;
exception when others then
  -- Une notification ne doit jamais bloquer la validation du résultat.
  raise warning 'push_on_lap_record: %', sqlerrm;
  return new;
end $$;
revoke execute on function public.push_on_lap_record() from public, anon, authenticated;

drop trigger if exists matches_push_lap_record on public.matches;
create trigger matches_push_lap_record after update of status on public.matches
  for each row execute function public.push_on_lap_record();
