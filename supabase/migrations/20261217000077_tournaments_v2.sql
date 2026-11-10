-- Kart Rivals : tournois, deuxième étape.
--   - Tableaux de 4, 8, 16 ou 32 pilotes (jusqu'aux seizièmes de finale).
--   - Bannière du tournoi (bucket public tournament-banners) et modification par l'organisateur.
--   - Score de chaque duel recopié sur le tableau (les défis ne sont lisibles que par leurs deux pilotes).
--   - Discussion du tournoi dans la Radio Paddock : une conversation par tournoi, les inscrits en sont membres.

-- ========== TAILLES ==========
alter table public.tournaments drop constraint if exists tournaments_size_check;
alter table public.tournaments add constraint tournaments_size_check check (size in (4, 8, 16, 32));
alter table public.tournament_matches drop constraint if exists tournament_matches_round_check;
alter table public.tournament_matches add constraint tournament_matches_round_check check (round between 1 and 5);

create or replace function public.tournament_rounds(p_size int)
returns int language sql immutable as $$
  select case p_size when 32 then 5 when 16 then 4 when 4 then 2 else 3 end;
$$;

create or replace function public.tournament_round_label(p_round int, p_rounds int)
returns text language sql immutable as $$
  select case p_rounds - p_round
    when 0 then 'Finale'
    when 1 then 'Demi-finale'
    when 2 then 'Quart de finale'
    when 3 then 'Huitième de finale'
    else 'Seizième de finale'
  end;
$$;

-- Minimum pour lancer avant que le tableau soit complet : plus de la moitié (sinon le tableau du dessous suffit),
-- 4 pilotes pour un tableau de 8.
create or replace function public.tournament_min_pilots(p_size int)
returns int language sql immutable as $$
  select case p_size when 32 then 17 when 16 then 9 when 4 then 3 else 4 end;
$$;

-- ========== BANNIÈRE ET SCORES ==========
alter table public.tournaments add column if not exists banner_url text check (banner_url ~ '^https://');

alter table public.tournament_matches
  add column if not exists a_position smallint,
  add column if not exists b_position smallint,
  add column if not exists a_best_lap_ms int,
  add column if not exists b_best_lap_ms int;

-- Chaque organisateur n'écrit que dans son dossier : tournament-banners/<son id>/<id du tournoi>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-banners', 'tournament-banners', true, 3 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "tournament banners are public" on storage.objects;
create policy "tournament banners are public"
  on storage.objects for select
  using (bucket_id = 'tournament-banners');

drop policy if exists "organizers upload their banners" on storage.objects;
create policy "organizers upload their banners"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'tournament-banners' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "organizers update their banners" on storage.objects;
create policy "organizers update their banners"
  on storage.objects for update to authenticated
  using (bucket_id = 'tournament-banners' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "organizers delete their banners" on storage.objects;
create policy "organizers delete their banners"
  on storage.objects for delete to authenticated
  using (bucket_id = 'tournament-banners' and (storage.foldername(name))[1] = auth.uid()::text);

-- ========== DISCUSSION ==========
alter table public.conversations
  add column if not exists tournament_id uuid unique references public.tournaments (id) on delete cascade;
alter table public.conversations drop constraint if exists conversations_tournament_check;
alter table public.conversations add constraint conversations_tournament_check
  check ((kind = 'tournament') = (tournament_id is not null));

-- Rattrapage : une conversation par tournoi existant, avec ses inscrits.
insert into public.conversations (kind, tournament_id)
  select 'tournament', t.id from public.tournaments t
   where not exists (select 1 from public.conversations c where c.tournament_id = t.id);
insert into public.conversation_members (conversation_id, profile_id)
  select c.id, e.pilot_id
    from public.conversations c join public.tournament_entries e on e.tournament_id = c.tournament_id
  on conflict do nothing;

-- Les inscrits sont membres de la discussion, ni plus ni moins.
create or replace function public.sync_tournament_chat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into conversation_members (conversation_id, profile_id)
      select c.id, new.pilot_id from conversations c where c.tournament_id = new.tournament_id
    on conflict do nothing;
    return new;
  end if;
  delete from conversation_members m using conversations c
   where c.tournament_id = old.tournament_id and m.conversation_id = c.id and m.profile_id = old.pilot_id;
  return old;
end $$;
drop trigger if exists tournament_entries_chat on public.tournament_entries;
create trigger tournament_entries_chat after insert or delete on public.tournament_entries
  for each row execute function public.sync_tournament_chat();

-- La conversation naît avec le tournoi (avant l'inscription de l'organisateur, faite dans create_tournament).
create or replace function public.create_tournament_chat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into conversations (kind, tournament_id) values ('tournament', new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists tournaments_chat on public.tournaments;
create trigger tournaments_chat after insert on public.tournaments
  for each row execute function public.create_tournament_chat();

-- Liste des conversations : celle d'un tournoi porte son nom et sa bannière.
create or replace function public.my_conversations()
returns table (
  id uuid, kind public.conversation_kind, team_id uuid, title text, tag text, avatar_url text,
  other_id uuid, last_message text, last_message_at timestamptz, unread int
)
language sql stable security definer set search_path = public as $$
  select c.id, c.kind, c.team_id,
         case when c.kind = 'support' then 'Équipe Kart Rivals' else coalesce(t.name, tr.name, op.username) end,
         t.tag, coalesce(t.logo_url, tr.banner_url, op.avatar_url),
         op.id,
         (select public.message_preview(m.kind, m.body, m.payload) from messages m
           where m.conversation_id = c.id order by m.created_at desc limit 1),
         c.last_message_at,
         (select count(*)::int from messages m
           where m.conversation_id = c.id and m.created_at > me.last_read_at and m.sender_id <> auth.uid())
  from conversation_members me
  join conversations c on c.id = me.conversation_id
  left join teams t on t.id = c.team_id
  left join tournaments tr on tr.id = c.tournament_id
  left join lateral (
    select p.id, p.username, p.avatar_url
      from conversation_members o join profiles p on p.id = o.profile_id
     where c.kind = 'direct' and o.conversation_id = c.id and o.profile_id <> auth.uid()
     limit 1
  ) op on true
  where me.profile_id = auth.uid()
    -- Un tournoi annulé ou terminé depuis plus de 30 jours sort de la liste (la discussion reste lisible depuis le tournoi).
    and (tr.id is null or tr.status in ('registration', 'running')
         or (tr.status = 'completed' and tr.completed_at > now() - interval '30 days'))
  order by c.last_message_at desc nulls last, c.created_at desc;
$$;

-- Épingler : le staff pour une écurie, l'organisateur pour un tournoi.
create or replace function public.pin_message(p_conversation_id uuid, p_message_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c conversations;
begin
  select * into c from conversations where id = p_conversation_id;
  if c.id is null or not public.is_conversation_member(c.id) then
    raise exception 'Conversation not found';
  end if;
  if c.kind = 'team' and not public.is_team_staff(c.team_id) then
    raise exception 'Only the team staff can pin messages';
  end if;
  if c.kind = 'tournament'
     and not exists (select 1 from tournaments where id = c.tournament_id and organizer_id = auth.uid()) then
    raise exception 'Only the organizer can pin messages';
  end if;
  if p_message_id is not null and not exists (select 1 from messages where id = p_message_id and conversation_id = c.id) then
    raise exception 'Message not found';
  end if;
  update conversations set pinned_message_id = p_message_id where id = c.id;
end $$;

-- Notification d'un message : « Nom du tournoi · pilote ».
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
      when 'tournament' then '🏆 ' || coalesce((select name from tournaments where id = c.tournament_id), 'Tournoi') || ' · ' || v_sender
      else v_sender
    end,
    v_preview,
    '/radio/' || c.id);
  return new;
end $$;

-- ========== CRÉATION, LANCEMENT, MODIFICATION ==========
create or replace function public.create_tournament(
  p_track_id uuid,
  p_name text,
  p_size int,
  p_format public.race_format default 'position',
  p_starts_at timestamptz default null,
  p_message text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
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
  if (select count(*) from tournaments
       where organizer_id = auth.uid() and status in ('registration', 'running')) >= 3 then
    raise exception 'Too many open tournaments';
  end if;

  insert into tournaments (organizer_id, track_id, name, size, format, starts_at, message)
  values (auth.uid(), p_track_id, trim(p_name), p_size, p_format, p_starts_at, nullif(trim(p_message), ''))
  returning id into v_id;
  insert into tournament_entries (tournament_id, pilot_id) values (v_id, auth.uid());
  return v_id;
end $$;

create or replace function public.start_tournament(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  v_count int;
begin
  select * into t from tournaments where id = p_tournament_id for update;
  if t.id is null then
    raise exception 'Tournament not found';
  end if;
  if t.organizer_id <> auth.uid() then
    raise exception 'Only the organizer can start the tournament';
  end if;
  if t.status <> 'registration' then
    raise exception 'Registrations are closed';
  end if;
  select count(*) into v_count from tournament_entries where tournament_id = t.id;
  if v_count < public.tournament_min_pilots(t.size) then
    raise exception 'Not enough pilots to start';
  end if;
  perform tournament_launch(t.id);
end $$;

-- Modification par l'organisateur : nom, date, message, bannière (clés absentes = inchangées).
create or replace function public.update_tournament(p_tournament_id uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  v_name text;
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

  update tournaments set
    name       = v_name,
    starts_at  = case when p_data ? 'starts_at' then nullif(p_data->>'starts_at', '')::timestamptz else starts_at end,
    message    = case when p_data ? 'message' then nullif(left(btrim(p_data->>'message'), 280), '') else message end,
    banner_url = case when p_data ? 'banner_url' then nullif(p_data->>'banner_url', '') else banner_url end
  where id = t.id;
end $$;

revoke execute on function public.update_tournament(uuid, jsonb) from public, anon;
grant execute on function public.update_tournament(uuid, jsonb) to authenticated;

-- ========== SCORE SUR LE TABLEAU ==========
-- Duel validé : le score est recopié sur la case (pilote A = challenger du défi), puis le vainqueur monte.
create or replace function public.advance_tournament_on_challenge()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tm tournament_matches;
  m matches;
begin
  if new.tournament_id is null then
    return new;
  end if;
  select * into tm from tournament_matches where challenge_id = new.id and decided_at is null;
  if tm.id is null then
    return new;
  end if;

  if new.status = 'completed' then
    select * into m from matches where challenge_id = new.id and status = 'confirmed';
    if m.winner_id is not null then
      update tournament_matches
         set a_position = case when new.challenger_id = tm.pilot_a then m.challenger_position else m.opponent_position end,
             b_position = case when new.challenger_id = tm.pilot_a then m.opponent_position else m.challenger_position end,
             a_best_lap_ms = case when new.challenger_id = tm.pilot_a then m.challenger_best_lap_ms else m.opponent_best_lap_ms end,
             b_best_lap_ms = case when new.challenger_id = tm.pilot_a then m.opponent_best_lap_ms else m.challenger_best_lap_ms end
       where id = tm.id;
      perform tournament_decide(tm.id, m.winner_id, 'race');
    end if;
  elsif new.status = 'cancelled' then
    update tournament_matches set challenge_id = null where id = tm.id;
    perform tournament_resolve(tm.id);
  end if;
  return new;
end $$;
