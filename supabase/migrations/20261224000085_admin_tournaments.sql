-- Kart Rivals : outils des admins appli pour les tournois.
--   - admin_tournaments : tous les tournois (privés compris) avec inscrits, duels en cours, duels bloqués et litiges.
--     Un duel est « bloqué » quand son délai est dépassé depuis plus de 3 jours, ou, sans délai, quand il attend
--     depuis plus de 21 jours : l'organisateur a été prévenu et n'a rien fait.
--   - admin_tournament_detail : inscrits, liste d'attente, duels à jouer et historique admin d'un tournoi.
--   - admin_cancel_tournament : annulation motivée (journal + raison envoyée à l'organisateur).
--   - admin_remove_tournament_pilot : retrait d'un inscrit pendant les inscriptions (le premier remplaçant monte).
--   - admin_tournament_walkover : forfait prononcé sur un duel en cours, tracé au journal.
--   - admin_set_tournament_official : attribue ou retire le statut officiel, pendant les inscriptions seulement
--     (dans un tournoi sur place, ce statut décide si les duels comptent pour l'ELO).

-- Duels à jouer d'un tournoi, avec depuis quand ils sont bloqués (null = dans les temps).
create or replace function public.tournament_open_duels(p_tournament_id uuid)
returns table (match_id uuid, round smallint, slot smallint, pilot_a uuid, pilot_b uuid, challenge_id uuid,
               deadline_at timestamptz, opened_at timestamptz, stuck_since timestamptz, disputed boolean,
               awaiting boolean)
language sql stable security definer set search_path = public as $$
  select tm.id, tm.round, tm.slot, tm.pilot_a, tm.pilot_b, tm.challenge_id, tm.deadline_at, c.created_at,
         case when tm.deadline_at is not null and tm.deadline_at < now() - interval '3 days'
                then tm.deadline_at + interval '3 days'
              when tm.deadline_at is null and c.created_at < now() - interval '21 days'
                then c.created_at + interval '21 days' end,
         exists (select 1 from matches m where m.challenge_id = c.id and m.status = 'disputed'),
         exists (select 1 from matches m where m.challenge_id = c.id and m.status = 'awaiting_confirmation')
    from tournament_matches tm
    join challenges c on c.id = tm.challenge_id
   where tm.tournament_id = p_tournament_id and tm.decided_at is null;
$$;
revoke execute on function public.tournament_open_duels(uuid) from public, anon, authenticated;

create or replace function public.admin_tournaments(p_filter text default 'watch')
returns table (id uuid, name text, status public.tournament_status, track_id uuid, track_name text, track_city text,
               organizer_id uuid, organizer text, size smallint, entries int, waitlist int, is_official boolean,
               is_private boolean, on_site boolean, created_at timestamptz, starts_at timestamptz,
               started_at timestamptz, completed_at timestamptz, champion text, playing int, stuck int,
               disputed int, stuck_since timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  if p_filter not in ('watch', 'registration', 'running', 'done') then
    raise exception 'Invalid filter';
  end if;
  return query
    select t.id, t.name, t.status, t.track_id, tr.name, tr.city, t.organizer_id, o.username, t.size,
           (select count(*)::int from tournament_entries e where e.tournament_id = t.id),
           (select count(*)::int from tournament_waitlist w where w.tournament_id = t.id),
           t.is_official, t.is_private, t.on_site, t.created_at, t.starts_at, t.started_at, t.completed_at,
           ch.username, d.playing, d.stuck, d.disputed, d.stuck_since
      from tournaments t
      join tracks tr on tr.id = t.track_id
      left join profiles o on o.id = t.organizer_id
      left join profiles ch on ch.id = t.champion_id
      left join lateral (
        select count(*)::int as playing,
               count(*) filter (where x.stuck_since is not null)::int as stuck,
               count(*) filter (where x.disputed)::int as disputed,
               min(x.stuck_since) as stuck_since
          from public.tournament_open_duels(t.id) x
         where t.status = 'running'
      ) d on true
     where case p_filter
             when 'watch' then t.status = 'running' and (d.stuck > 0 or d.disputed > 0)
             when 'registration' then t.status = 'registration'
             when 'running' then t.status = 'running'
             else t.status in ('completed', 'cancelled')
           end
     order by case when p_filter = 'watch' then d.stuck_since end nulls last,
              coalesce(t.completed_at, t.started_at, t.created_at) desc
     limit 100;
end $$;

create or replace function public.admin_tournament_detail(p_tournament_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t tournaments;
  v_rounds int;
begin
  perform public.require_app_admin();
  select * into t from tournaments where id = p_tournament_id;
  if t.id is null then
    raise exception 'Tournament not found';
  end if;
  v_rounds := tournament_rounds(t.size);
  return jsonb_build_object(
    'id', t.id, 'name', t.name, 'status', t.status, 'size', t.size, 'format', t.format,
    'track_id', t.track_id, 'track_name', track_name(t.track_id),
    'organizer_id', t.organizer_id, 'organizer', pilot_name(t.organizer_id),
    'is_official', t.is_official, 'is_private', t.is_private, 'on_site', t.on_site, 'prize', t.prize,
    'created_at', t.created_at, 'starts_at', t.starts_at, 'started_at', t.started_at, 'completed_at', t.completed_at,
    'registration_closes_at', t.registration_closes_at,
    'champion', pilot_name(t.champion_id),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url, 'elo', p.elo, 'rank', p.rank,
                           'seed', e.seed, 'joined_at', e.joined_at,
                           'restricted', public.is_restricted(p.id))
                           order by e.seed nulls last, e.joined_at)
                           from tournament_entries e join profiles p on p.id = e.pilot_id
                          where e.tournament_id = t.id), '[]'::jsonb),
    'waitlist', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url, 'elo', p.elo, 'rank', p.rank,
                            'joined_at', w.joined_at) order by w.joined_at)
                            from tournament_waitlist w join profiles p on p.id = w.pilot_id
                           where w.tournament_id = t.id), '[]'::jsonb),
    'duels', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', d.match_id, 'label', tournament_match_label(d.round, d.slot, v_rounds),
                         'challenge_id', d.challenge_id,
                         'a', jsonb_build_object('id', d.pilot_a, 'username', pilot_name(d.pilot_a)),
                         'b', jsonb_build_object('id', d.pilot_b, 'username', pilot_name(d.pilot_b)),
                         'deadline_at', d.deadline_at, 'opened_at', d.opened_at, 'stuck_since', d.stuck_since,
                         'disputed', d.disputed, 'awaiting', d.awaiting)
                         order by d.round, d.slot)
                         from public.tournament_open_duels(t.id) d
                        where t.status = 'running'), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', a.id, 'action', a.action, 'details', a.details, 'created_at', a.created_at,
                           'admin', ap.username, 'pilot', pp.username) order by a.created_at desc)
                           from admin_actions a
                           left join profiles ap on ap.id = a.admin_id
                           left join profiles pp on pp.id = a.profile_id
                          where a.details->>'tournament_id' = t.id::text), '[]'::jsonb));
end $$;

create or replace function public.admin_cancel_tournament(p_tournament_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 280), '');
begin
  perform public.require_app_admin();
  select * into t from tournaments where id = p_tournament_id;
  -- Mêmes règles et mêmes notifications que l'annulation ordinaire (un admin peut annuler un tournoi lancé).
  perform public.cancel_tournament(p_tournament_id);
  insert into admin_actions (action, profile_id, track_id, details)
  values ('cancel_tournament', t.organizer_id, t.track_id,
          jsonb_build_object('tournament_id', t.id, 'name', t.name, 'reason', v_reason));
  if v_reason is not null and t.organizer_id <> auth.uid() then
    perform send_push(array[t.organizer_id], '🏆 Tournoi annulé par l’équipe Kart Rivals',
      t.name || ' : ' || v_reason, '/tournament/' || t.id);
  end if;
end $$;

create or replace function public.admin_remove_tournament_pilot(p_tournament_id uuid, p_pilot_id uuid,
                                                                p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  v_next uuid;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 280), '');
begin
  perform public.require_app_admin();
  select * into t from tournaments where id = p_tournament_id for update;
  if t.id is null then
    raise exception 'Tournament not found';
  end if;
  if t.status <> 'registration' then
    raise exception 'Registrations are closed';
  end if;

  delete from tournament_waitlist where tournament_id = t.id and pilot_id = p_pilot_id;
  if not found then
    if t.organizer_id = p_pilot_id and not t.is_official then
      raise exception 'The organizer cannot leave: cancel the tournament instead';
    end if;
    delete from tournament_entries where tournament_id = t.id and pilot_id = p_pilot_id;
    if not found then
      raise exception 'Pilot is not registered';
    end if;
    -- Premier remplaçant (hors pilote bloqué avec un inscrit), comme pour un désistement.
    select w.pilot_id into v_next
      from tournament_waitlist w
     where w.tournament_id = t.id
       and not exists (select 1 from tournament_entries e
                        where e.tournament_id = t.id and public.is_blocked_between(e.pilot_id, w.pilot_id))
     order by w.joined_at
     limit 1;
    if v_next is not null then
      delete from tournament_waitlist where tournament_id = t.id and pilot_id = v_next;
      insert into tournament_entries (tournament_id, pilot_id) values (t.id, v_next);
      perform send_push(array[v_next], '🏆 Une place s’est libérée',
        'Tu es inscrit à ' || t.name || ' (' || track_name(t.track_id) || ').', '/tournament/' || t.id);
    end if;
  end if;

  -- Tournoi privé : l'invitation est close, le pilote ne se réinscrit pas seul.
  if t.is_private then
    insert into tournament_invites (tournament_id, pilot_id, invited_by, status)
    values (t.id, p_pilot_id, t.organizer_id, 'declined')
    on conflict (tournament_id, pilot_id) do update set status = 'declined';
  end if;

  insert into admin_actions (action, profile_id, track_id, details)
  values ('remove_tournament_pilot', p_pilot_id, t.track_id,
          jsonb_build_object('tournament_id', t.id, 'name', t.name, 'reason', v_reason));
  perform send_push(array[p_pilot_id], '🏆 Inscription retirée',
    'L’équipe Kart Rivals a retiré ton inscription à ' || t.name || coalesce(' : ' || v_reason, '.'),
    '/tournament/' || t.id);
end $$;

create or replace function public.admin_tournament_walkover(p_match_id uuid, p_winner_id uuid,
                                                            p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  tm tournament_matches;
  t tournaments;
  v_loser uuid;
begin
  perform public.require_app_admin();
  select * into tm from tournament_matches where id = p_match_id;
  if tm.id is null then
    raise exception 'Tournament match not found';
  end if;
  select * into t from tournaments where id = tm.tournament_id;
  -- Contrôles et avancée du tableau : ceux du forfait prononcé par l'organisateur.
  perform public.award_tournament_walkover(p_match_id, p_winner_id);
  v_loser := case when p_winner_id = tm.pilot_a then tm.pilot_b else tm.pilot_a end;
  insert into admin_actions (action, profile_id, track_id, details)
  values ('tournament_walkover', v_loser, t.track_id,
          jsonb_build_object('tournament_id', t.id, 'name', t.name, 'winner', pilot_name(p_winner_id),
                             'label', tournament_match_label(tm.round, tm.slot, tournament_rounds(t.size)),
                             'reason', nullif(left(trim(coalesce(p_reason, '')), 280), '')));
  perform send_push(array[tm.pilot_a, tm.pilot_b], '🏆 Forfait prononcé · ' || t.name,
    pilot_name(p_winner_id) || ' est qualifié : l’équipe Kart Rivals a prononcé le forfait de ' || pilot_name(v_loser) || '.',
    '/tournament/' || t.id);
end $$;

create or replace function public.admin_set_tournament_official(p_tournament_id uuid, p_official boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
begin
  perform public.require_app_admin();
  select * into t from tournaments where id = p_tournament_id for update;
  if t.id is null then
    raise exception 'Tournament not found';
  end if;
  if t.status <> 'registration' then
    raise exception 'Registrations are closed';
  end if;
  if p_official and t.is_private then
    raise exception 'An official tournament must be public';
  end if;
  if t.is_official = p_official then
    return;
  end if;
  update tournaments set is_official = p_official where id = t.id;
  insert into admin_actions (action, profile_id, track_id, details)
  values (case when p_official then 'tournament_official' else 'tournament_unofficial' end, t.organizer_id, t.track_id,
          jsonb_build_object('tournament_id', t.id, 'name', t.name));
end $$;

revoke execute on function public.admin_tournaments(text), public.admin_tournament_detail(uuid),
  public.admin_cancel_tournament(uuid, text), public.admin_remove_tournament_pilot(uuid, uuid, text),
  public.admin_tournament_walkover(uuid, uuid, text), public.admin_set_tournament_official(uuid, boolean)
  from public, anon;
grant execute on function public.admin_tournaments(text), public.admin_tournament_detail(uuid),
  public.admin_cancel_tournament(uuid, text), public.admin_remove_tournament_pilot(uuid, uuid, text),
  public.admin_tournament_walkover(uuid, uuid, text), public.admin_set_tournament_official(uuid, boolean)
  to authenticated;
