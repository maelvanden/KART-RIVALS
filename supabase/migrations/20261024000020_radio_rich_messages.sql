-- Kart Rivals : Radio Paddock enrichie.
--   - Messages typés : texte, partage (défi, course, record, session Time Attack), sondage, photo.
--   - Sondages : un vote par pilote (modifiable), via vote_poll.
--   - Message épinglé par conversation (canal d'écurie : staff seulement ; 1v1 : l'un ou l'autre).
--   - Photos : bucket privé « radio-photos », lisible et inscriptible par les seuls membres de la conversation.
--   - « Vu » : last_read_at des membres, diffusé en temps réel. « En train d'écrire » passe par la diffusion
--     Realtime (broadcast) côté app, sans table.

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  alter column body drop not null,
  add column kind text not null default 'text' check (kind in ('text', 'share', 'poll', 'image')),
  add column payload jsonb,
  add constraint messages_body_length check (body is null or char_length(body) <= 1000),
  add constraint messages_content_check check (
    case kind
      when 'text' then body is not null and char_length(btrim(body)) between 1 and 1000
      when 'share' then payload ? 'type' and payload ? 'id' and payload->>'type' in ('challenge', 'race', 'lap_record', 'time_attack')
      when 'poll' then payload ? 'question'
        and jsonb_typeof(payload->'options') = 'array'
        and jsonb_array_length(payload->'options') between 2 and 4
      when 'image' then payload ? 'path'
    end
  );
grant insert (kind, payload) on public.messages to authenticated;

-- Une photo doit être rangée dans le dossier de sa conversation.
alter table public.messages add constraint messages_image_path_check check (
  kind <> 'image' or (payload->>'path') like conversation_id::text || '/%'
);

-- ========== SONDAGES ==========
create table public.poll_votes (
  message_id   uuid not null references public.messages (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  option_index smallint not null check (option_index between 0 and 3),
  voted_at     timestamptz not null default now(),
  primary key (message_id, profile_id)
);

alter table public.poll_votes enable row level security;
revoke all on public.poll_votes from anon, authenticated;
grant select on public.poll_votes to authenticated;
create policy "members read poll votes" on public.poll_votes
  for select to authenticated
  using (exists (
    select 1 from public.messages m where m.id = message_id and public.is_conversation_member(m.conversation_id)
  ));

create or replace function public.vote_poll(p_message_id uuid, p_option smallint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m messages;
begin
  select * into m from messages where id = p_message_id;
  if m.id is null or m.kind <> 'poll' or not public.is_conversation_member(m.conversation_id) then
    raise exception 'Poll not found';
  end if;
  if p_option < 0 or p_option >= jsonb_array_length(m.payload->'options') then
    raise exception 'Invalid option';
  end if;
  insert into poll_votes (message_id, profile_id, option_index) values (p_message_id, auth.uid(), p_option)
  on conflict (message_id, profile_id) do update set option_index = excluded.option_index, voted_at = now();
end $$;

-- ========== MESSAGE ÉPINGLÉ ==========
alter table public.conversations add column pinned_message_id uuid references public.messages (id) on delete set null;

-- Épingle un message (ou retire l'épingle avec null).
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
  if p_message_id is not null and not exists (select 1 from messages where id = p_message_id and conversation_id = c.id) then
    raise exception 'Message not found';
  end if;
  update conversations set pinned_message_id = p_message_id where id = c.id;
end $$;

-- ========== PHOTOS ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('radio-photos', 'radio-photos', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Chemin : radio-photos/<id de conversation>/<fichier>.
create or replace function public.can_access_radio_photo(p_name text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_conversation uuid;
begin
  begin
    v_conversation := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.is_conversation_member(v_conversation);
end $$;

drop policy if exists "members read radio photos" on storage.objects;
create policy "members read radio photos" on storage.objects for select to authenticated
  using (bucket_id = 'radio-photos' and public.can_access_radio_photo(name));
drop policy if exists "members upload radio photos" on storage.objects;
create policy "members upload radio photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'radio-photos' and public.can_access_radio_photo(name));

revoke execute on function
  public.vote_poll(uuid, smallint), public.pin_message(uuid, uuid), public.can_access_radio_photo(text)
from public, anon;
grant execute on function
  public.vote_poll(uuid, smallint), public.pin_message(uuid, uuid), public.can_access_radio_photo(text)
to authenticated;

-- Aperçu du dernier message dans la liste des conversations, selon son type.
create or replace function public.message_preview(p_kind text, p_body text, p_payload jsonb)
returns text
language sql immutable as $$
  select case p_kind
    when 'share' then '🏁 ' || coalesce(p_payload->>'title', 'Partage')
    when 'poll' then '📊 ' || coalesce(p_payload->>'question', 'Sondage')
    when 'image' then '📷 Photo'
    else p_body
  end;
$$;

create or replace function public.my_conversations()
returns table (
  id uuid, kind public.conversation_kind, team_id uuid, title text, tag text, avatar_url text,
  other_id uuid, last_message text, last_message_at timestamptz, unread int
)
language sql stable security definer set search_path = public as $$
  select c.id, c.kind, c.team_id,
         coalesce(t.name, op.username), t.tag, coalesce(t.logo_url, op.avatar_url),
         op.id,
         (select public.message_preview(m.kind, m.body, m.payload) from messages m
           where m.conversation_id = c.id order by m.created_at desc limit 1),
         c.last_message_at,
         (select count(*)::int from messages m
           where m.conversation_id = c.id and m.created_at > me.last_read_at and m.sender_id <> auth.uid())
  from conversation_members me
  join conversations c on c.id = me.conversation_id
  left join teams t on t.id = c.team_id
  left join lateral (
    select p.id, p.username, p.avatar_url
      from conversation_members o join profiles p on p.id = o.profile_id
     where c.kind = 'direct' and o.conversation_id = c.id and o.profile_id <> auth.uid()
     limit 1
  ) op on true
  where me.profile_id = auth.uid()
  order by c.last_message_at desc nulls last, c.created_at desc;
$$;

-- Temps réel : votes, épingle (conversations) et lectures (« Vu »).
alter publication supabase_realtime add table public.poll_votes, public.conversations, public.conversation_members;
