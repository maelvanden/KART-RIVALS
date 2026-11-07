-- Kart Rivals : progression par circuit. Tous les chronos validés du pilote connecté, circuit par circuit, pour
-- tracer sa courbe (« −1,2 s en 2 mois sur Inwall »).
-- Sources : défis validés (quel que soit le format, dès qu'un meilleur tour a été saisi), courses de groupe validées
-- et sessions Time Attack validées. Date retenue : celle où le pilote a roulé (date prévue ou heure du ticket),
-- à défaut celle de la validation.
-- Réservé au pilote lui-même : l'historique détaillé révèle quand il roule, seuls ses records sont publics.

create or replace function public.my_lap_progress()
returns table (track_id uuid, track_name text, lap_ms int, driven_at timestamptz, source text)
language sql stable security definer set search_path = public as $$
  with laps as (
    select c.track_id,
           case when c.challenger_id = auth.uid() then m.challenger_best_lap_ms else m.opponent_best_lap_ms end as lap_ms,
           coalesce(least(c.scheduled_at, m.confirmed_at), m.confirmed_at) as driven_at,
           'challenge'::text as source
    from matches m
    join challenges c on c.id = m.challenge_id
    where m.status = 'confirmed' and auth.uid() in (c.challenger_id, c.opponent_id)

    union all
    select r.track_id, e.best_lap_ms, coalesce(least(r.scheduled_at, r.confirmed_at), r.confirmed_at), 'race'
    from race_entries e
    join races r on r.id = e.race_id
    where r.status = 'confirmed' and e.pilot_id = auth.uid()

    union all
    select s.track_id, s.best_lap_ms, coalesce(s.ticket_at, s.validated_at, s.check_in_at), 'time_attack'
    from time_attack_sessions s
    where s.status = 'validated' and s.pilot_id = auth.uid()
  )
  select l.track_id, t.name, l.lap_ms, l.driven_at, l.source
  from laps l
  join tracks t on t.id = l.track_id
  where l.lap_ms is not null and l.lap_ms > 0 and l.driven_at is not null
  order by l.driven_at
  limit 1000;
$$;

revoke execute on function public.my_lap_progress() from public, anon;
grant execute on function public.my_lap_progress() to authenticated;
