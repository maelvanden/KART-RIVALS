-- Kart Rivals : notifications push.
--   - push_tokens : un jeton Expo par appareil (register_push_token à la connexion, unregister_push_token à la déconnexion).
--   - send_push : envoi au service de push d'Expo (pg_net, asynchrone) ; jamais à l'auteur de l'action, ni à un pilote qui
--     l'a bloqué. Une erreur d'envoi ne bloque jamais l'action qui l'a déclenchée.
--   - Déclencheurs : défis (reçu, accepté, refusé), résultats (à confirmer, validé, contesté), invitations de course et
--     résultats de course à confirmer, messages Radio et support (seulement le premier non lu, pas une rafale),
--     demandes de coéquipier, invitations et candidatures d'écurie, pilote qui rejoint ma session, commentaire sur ma
--     publication.
--   - data.url : écran ouvert quand on touche la notification.

create extension if not exists pg_net with schema extensions;

-- ========== APPAREILS ==========
create table if not exists public.push_tokens (
  token      text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_profile_idx on public.push_tokens (profile_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

-- Un appareil appartient au dernier pilote connecté dessus.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_token !~ '^Expo(nent)?PushToken\[.+\]$' or p_platform not in ('ios', 'android') then
    raise exception 'Invalid push token';
  end if;
  insert into push_tokens (token, profile_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set profile_id = auth.uid(), platform = excluded.platform, updated_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and profile_id = auth.uid();
$$;

revoke execute on function public.register_push_token(text, text), public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text), public.unregister_push_token(text) to authenticated;

-- ========== ENVOI ==========
-- Envoie une notification à des pilotes (tous leurs appareils), par lots de 100 (limite du service d'Expo).
create or replace function public.send_push(p_profiles uuid[], p_title text, p_body text, p_url text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_batch jsonb;
begin
  for v_batch in
    select jsonb_agg(msg)
      from (
        select jsonb_build_object(
                 'to', t.token,
                 'title', left(p_title, 80),
                 'body', left(coalesce(p_body, ''), 180),
                 'sound', 'default',
                 'data', jsonb_build_object('url', p_url)) as msg,
               (row_number() over () - 1) / 100 as grp
          from push_tokens t
         where t.profile_id = any (p_profiles)
           and t.profile_id is distinct from auth.uid()
           and not exists (select 1 from blocks b where b.blocker_id = t.profile_id and b.blocked_id = auth.uid())
      ) m
     group by grp
  loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_batch,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'));
  end loop;
exception when others then
  raise warning 'send_push: %', sqlerrm;
end $$;
revoke execute on function public.send_push(uuid[], text, text, text) from public, anon, authenticated;

create or replace function public.pilot_name(p_profile uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select username from profiles where id = p_profile), 'Un pilote');
$$;
revoke execute on function public.pilot_name(uuid) from public, anon, authenticated;

create or replace function public.track_name(p_track uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from tracks where id = p_track), 'un circuit');
$$;
revoke execute on function public.track_name(uuid) from public, anon, authenticated;

-- ========== DÉFIS ==========
create or replace function public.push_on_challenge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform send_push(array[new.opponent_id], '⚔️ Nouveau défi',
      pilot_name(new.challenger_id) || ' te défie à ' || track_name(new.track_id), '/challenge/' || new.id);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('accepted', 'declined') then
    perform send_push(array[new.challenger_id],
      case new.status when 'accepted' then '✅ Défi accepté' else '❌ Défi refusé' end,
      pilot_name(new.opponent_id) || case new.status when 'accepted' then ' a accepté' else ' a refusé' end
        || ' ton défi à ' || track_name(new.track_id),
      '/challenge/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists challenges_push on public.challenges;
create trigger challenges_push after insert or update of status on public.challenges
  for each row execute function public.push_on_challenge();

create or replace function public.push_on_match()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c challenges;
begin
  select * into c from challenges where id = new.challenge_id;
  if new.status = 'awaiting_confirmation'
     and (tg_op = 'INSERT' or old.status <> 'awaiting_confirmation' or old.submitted_by is distinct from new.submitted_by) then
    perform send_push(array[c.challenger_id, c.opponent_id], '🏁 Résultat à confirmer',
      pilot_name(new.submitted_by) || ' a saisi le résultat de votre duel à ' || track_name(c.track_id),
      '/challenge/' || c.id);
  elsif tg_op = 'UPDATE' and new.status = 'confirmed' and old.status <> 'confirmed' then
    perform send_push(array[c.challenger_id, c.opponent_id], '🏆 Résultat validé',
      case when new.winner_id is null then 'Égalité' else pilot_name(new.winner_id) || ' remporte le duel' end
        || ' à ' || track_name(c.track_id) || '. Ton ELO est à jour.',
      '/challenge/' || c.id);
  elsif tg_op = 'UPDATE' and new.status = 'disputed' and old.status <> 'disputed' then
    perform send_push(array[new.submitted_by], '⚠️ Résultat contesté',
      'Le résultat de ton duel à ' || track_name(c.track_id) || ' est contesté : ressaisis-le.',
      '/challenge/' || c.id);
  end if;
  return new;
end $$;
drop trigger if exists matches_push on public.matches;
create trigger matches_push after insert or update of status, submitted_by on public.matches
  for each row execute function public.push_on_match();

-- ========== COURSES ==========
create or replace function public.push_on_race_entry()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r races;
begin
  if new.status = 'invited' then
    select * into r from races where id = new.race_id;
    perform send_push(array[new.pilot_id], '🏁 Invitation à une course',
      pilot_name(r.organizer_id) || ' t’invite à une course à ' || track_name(r.track_id), '/race/' || r.id);
  end if;
  return new;
end $$;
drop trigger if exists race_entries_push on public.race_entries;
create trigger race_entries_push after insert on public.race_entries
  for each row execute function public.push_on_race_entry();

create or replace function public.push_on_race()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'awaiting_confirmation' and old.status <> 'awaiting_confirmation' then
    perform send_push(
      array(select pilot_id from race_entries where race_id = new.id and status = 'accepted'),
      '🏁 Résultats à confirmer', 'Les résultats de la course à ' || track_name(new.track_id) || ' sont saisis.',
      '/race/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists races_push on public.races;
create trigger races_push after update of status on public.races
  for each row execute function public.push_on_race();

-- ========== RADIO ET SUPPORT ==========
-- Seulement si le destinataire avait tout lu avant ce message : une notification par conversation, pas une rafale.
create or replace function public.push_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c conversations;
  v_prev timestamptz;
  v_sender text := pilot_name(new.sender_id);
  v_preview text := coalesce(public.message_preview(new.kind, new.body, new.payload), 'Nouveau message');
begin
  select * into c from conversations where id = new.conversation_id;
  select max(created_at) into v_prev from messages where conversation_id = new.conversation_id and id <> new.id;

  if c.kind = 'support' and new.sender_id = c.support_profile_id then
    -- Le pilote écrit à l'équipe : les admins appli, si l'équipe avait tout lu.
    if c.staff_read_at is null or v_prev is null or c.staff_read_at >= v_prev then
      perform send_push(array(select profile_id from app_admins), 'Support · ' || v_sender, v_preview,
        '/radio/' || c.id || '?title=' || v_sender);
    end if;
    return new;
  end if;

  perform send_push(
    array(select m.profile_id from conversation_members m
           where m.conversation_id = c.id and m.profile_id <> new.sender_id
             and (v_prev is null or m.last_read_at >= v_prev)),
    case c.kind
      when 'support' then 'Équipe Kart Rivals'
      when 'team' then coalesce((select name from teams where id = c.team_id), 'Écurie') || ' · ' || v_sender
      else v_sender
    end,
    v_preview,
    '/radio/' || c.id);
  return new;
end $$;
drop trigger if exists messages_push on public.messages;
create trigger messages_push after insert on public.messages
  for each row execute function public.push_on_message();

-- ========== COÉQUIPIERS ET ÉCURIES ==========
create or replace function public.push_on_friendship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform send_push(array[new.addressee_id], '🤝 Demande de coéquipier',
      pilot_name(new.requester_id) || ' veut faire équipe avec toi', '/friends');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    perform send_push(array[new.requester_id], '🤝 Nouveau coéquipier',
      pilot_name(new.addressee_id) || ' a accepté ta demande', '/friends');
  end if;
  return new;
end $$;
drop trigger if exists friendships_push on public.friendships;
create trigger friendships_push after insert or update of status on public.friendships
  for each row execute function public.push_on_friendship();

create or replace function public.push_on_team_invite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    perform send_push(array[new.invitee_id], '🛡️ Invitation d’écurie',
      coalesce((select name from teams where id = new.team_id), 'Une écurie') || ' te propose de rejoindre l’écurie',
      '/team');
  end if;
  return new;
end $$;
drop trigger if exists team_invites_push on public.team_invites;
create trigger team_invites_push after insert on public.team_invites
  for each row execute function public.push_on_team_invite();

create or replace function public.push_on_team_application()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    perform send_push(
      array(select profile_id from team_members where team_id = new.team_id and role::text in ('team_principal', 'directeur_sportif')),
      '📩 Nouvelle candidature', pilot_name(new.applicant_id) || ' veut rejoindre ton écurie', '/team');
  end if;
  return new;
end $$;
drop trigger if exists team_applications_push on public.team_applications;
create trigger team_applications_push after insert on public.team_applications
  for each row execute function public.push_on_team_application();

-- ========== SESSIONS OUVERTES ==========
create or replace function public.push_on_session_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s open_sessions;
begin
  select * into s from open_sessions where id = new.session_id;
  if s.host_id <> new.profile_id then
    perform send_push(array[s.host_id], '🙌 Un pilote te rejoint',
      pilot_name(new.profile_id) || ' rejoint ta session à ' || track_name(s.track_id), '/sessions/' || s.id);
  end if;
  return new;
end $$;
drop trigger if exists session_participants_push on public.session_participants;
create trigger session_participants_push after insert on public.session_participants
  for each row execute function public.push_on_session_join();

-- ========== ACTU ==========
create or replace function public.push_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform send_push(array(select author_id from feed_posts where id = new.post_id), '💬 Nouveau commentaire',
    pilot_name(new.author_id) || ' : ' || new.body, '/feed/' || new.post_id);
  return new;
end $$;
drop trigger if exists post_comments_push on public.post_comments;
create trigger post_comments_push after insert on public.post_comments
  for each row execute function public.push_on_comment();

revoke execute on function
  public.push_on_challenge(), public.push_on_match(), public.push_on_race_entry(), public.push_on_race(),
  public.push_on_message(), public.push_on_friendship(), public.push_on_team_invite(), public.push_on_team_application(),
  public.push_on_session_join(), public.push_on_comment()
from public, anon, authenticated;
