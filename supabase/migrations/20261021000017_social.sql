-- Kart Rivals : dimension sociale.
--   - Coéquipiers (friendships) : demande en attente → acceptée / refusée.
--   - Écuries (teams, team_members, team_invites) : Team Principal (créateur) et Pilotes officiels ;
--     un pilote n'appartient qu'à une écurie ; ELO d'écurie = moyenne des ELO de ses pilotes.
--   - Radio Paddock (conversations, conversation_members, messages) : 1v1 entre coéquipiers et canal
--     de groupe de chaque écurie, diffusés en temps réel (Supabase Realtime, filtré par RLS).
-- Lecture encadrée par RLS ; toutes les écritures passent par des fonctions (security definer),
-- sauf l'envoi d'un message (insert direct, contrôlé par RLS).

create type public.friendship_status as enum ('pending', 'accepted', 'declined');
create type public.team_role as enum ('team_principal', 'pilote_officiel');
create type public.team_invite_status as enum ('pending', 'accepted', 'declined');
create type public.conversation_kind as enum ('direct', 'team');

-- ========== COÉQUIPIERS ==========
create table public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       public.friendship_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
-- Une seule relation par paire de pilotes, quel que soit le sens.
create unique index friendships_pair_key on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id, status);

-- ========== ÉCURIES ==========
create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 3 and 30),
  tag        text not null check (tag ~ '^[A-Z0-9]{2,4}$'),
  logo_url   text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index teams_name_key on public.teams (lower(name));
create unique index teams_tag_key on public.teams (tag);

create table public.team_members (
  team_id    uuid not null references public.teams (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       public.team_role not null default 'pilote_officiel',
  joined_at  timestamptz not null default now(),
  primary key (team_id, profile_id),
  unique (profile_id) -- une seule écurie par pilote
);
-- Un seul Team Principal par écurie.
create unique index team_members_one_principal on public.team_members (team_id) where role = 'team_principal';

create table public.team_invites (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  status     public.team_invite_status not null default 'pending',
  created_at timestamptz not null default now()
);
create unique index team_invites_pending_key on public.team_invites (team_id, invitee_id) where status = 'pending';
create index team_invites_invitee_idx on public.team_invites (invitee_id, status);

-- Classement des écuries : ELO moyen des pilotes.
create view public.team_standings with (security_invoker = true) as
  select t.id, t.name, t.tag, t.logo_url, t.created_at,
         count(m.profile_id)::int as member_count,
         coalesce(round(avg(p.elo))::int, 0) as elo,
         rank() over (order by coalesce(avg(p.elo), 0) desc) as position
  from public.teams t
  left join public.team_members m on m.team_id = t.id
  left join public.profiles p on p.id = m.profile_id
  group by t.id;

-- ========== RADIO PADDOCK ==========
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            public.conversation_kind not null,
  team_id         uuid unique references public.teams (id) on delete cascade,
  -- Pour un 1v1 : les deux id triés, pour retrouver la conversation existante.
  direct_key      text unique,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  check ((kind = 'team') = (team_id is not null)),
  check ((kind = 'direct') = (direct_key is not null))
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
create index conversation_members_profile_idx on public.conversation_members (profile_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body            text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

-- Dernier message de la conversation (tri de la liste) ; l'expéditeur a lu jusque-là.
create or replace function public.on_message_sent()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  update conversation_members set last_read_at = new.created_at
   where conversation_id = new.conversation_id and profile_id = new.sender_id;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.on_message_sent();

-- ========== SÉCURITÉ ==========
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_members where conversation_id = p_conversation_id and profile_id = auth.uid()
  );
$$;

create or replace function public.my_team_id()
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from team_members where profile_id = auth.uid();
$$;

alter table public.friendships enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

revoke all on public.friendships, public.teams, public.team_members, public.team_invites,
              public.conversations, public.conversation_members, public.messages
  from anon, authenticated;
grant select on public.friendships, public.teams, public.team_members, public.team_invites,
                public.conversations, public.conversation_members, public.messages
  to authenticated;
grant select on public.team_standings to authenticated;
grant insert (conversation_id, body) on public.messages to authenticated;

create policy "pilots read their friendships" on public.friendships
  for select to authenticated using (auth.uid() in (requester_id, addressee_id));
-- Écuries et effectifs : publics (classement des écuries, fiche pilote).
create policy "teams are public" on public.teams for select to authenticated using (true);
create policy "rosters are public" on public.team_members for select to authenticated using (true);
create policy "invites readable by invitee and team" on public.team_invites
  for select to authenticated using (invitee_id = auth.uid() or team_id = public.my_team_id());
create policy "members read their conversations" on public.conversations
  for select to authenticated using (public.is_conversation_member(id));
create policy "members read conversation members" on public.conversation_members
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "members read messages" on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "members send messages as themselves" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

-- Logos d'écurie : bucket public ; le Team Principal écrit dans team-logos/<id de l'écurie>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', true, 2 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.is_team_principal(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members where team_id = p_team_id and profile_id = auth.uid() and role = 'team_principal'
  );
$$;

drop policy if exists "team logos are public" on storage.objects;
create policy "team logos are public" on storage.objects for select using (bucket_id = 'team-logos');
drop policy if exists "principals upload team logos" on storage.objects;
create policy "principals upload team logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'team-logos' and public.is_team_principal(((storage.foldername(name))[1])::uuid));
drop policy if exists "principals update team logos" on storage.objects;
create policy "principals update team logos" on storage.objects for update to authenticated
  using (bucket_id = 'team-logos' and public.is_team_principal(((storage.foldername(name))[1])::uuid));

-- ========== FONCTIONS : COÉQUIPIERS ==========
-- Envoie une demande ; si l'autre pilote m'en avait déjà envoyé une, elle est acceptée.
create or replace function public.send_friend_request(p_pilot_id uuid)
returns public.friendships
language plpgsql security definer set search_path = public as $$
declare
  f friendships;
begin
  if p_pilot_id = auth.uid() then
    raise exception 'You cannot add yourself';
  end if;
  if not exists (select 1 from profiles where id = p_pilot_id) then
    raise exception 'Pilot not found';
  end if;

  select * into f from friendships
   where least(requester_id, addressee_id) = least(auth.uid(), p_pilot_id)
     and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_pilot_id)
   for update;

  if f.id is null then
    insert into friendships (requester_id, addressee_id) values (auth.uid(), p_pilot_id) returning * into f;
  elsif f.status = 'accepted' then
    raise exception 'Already teammates';
  elsif f.status = 'pending' and f.requester_id = auth.uid() then
    raise exception 'Request already sent';
  elsif f.status = 'pending' then
    update friendships set status = 'accepted', responded_at = now() where id = f.id returning * into f;
  else
    -- Demande refusée auparavant : on repart d'une nouvelle demande.
    update friendships
       set requester_id = auth.uid(), addressee_id = p_pilot_id, status = 'pending',
           created_at = now(), responded_at = null
     where id = f.id
    returning * into f;
  end if;
  return f;
end $$;

create or replace function public.respond_friend_request(p_friendship_id uuid, p_accept boolean)
returns public.friendships
language plpgsql security definer set search_path = public as $$
declare
  f friendships;
begin
  update friendships
     set status = case when p_accept then 'accepted' else 'declined' end::friendship_status,
         responded_at = now()
   where id = p_friendship_id and addressee_id = auth.uid() and status = 'pending'
  returning * into f;
  if f.id is null then
    raise exception 'No pending request';
  end if;
  return f;
end $$;

-- Retire un coéquipier, ou annule une demande envoyée.
create or replace function public.remove_friend(p_pilot_id uuid)
returns void
language sql security definer set search_path = public as $$
  delete from friendships
   where least(requester_id, addressee_id) = least(auth.uid(), p_pilot_id)
     and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_pilot_id);
$$;

-- ========== FONCTIONS : ÉCURIES ==========
create or replace function public.create_team(p_name text, p_tag text, p_logo_url text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_conversation uuid;
begin
  if exists (select 1 from team_members where profile_id = auth.uid()) then
    raise exception 'You already belong to a team';
  end if;
  if exists (select 1 from teams where lower(name) = lower(btrim(p_name))) then
    raise exception 'Team name already taken';
  end if;
  if exists (select 1 from teams where tag = upper(btrim(p_tag))) then
    raise exception 'Team tag already taken';
  end if;

  insert into teams (name, tag, logo_url, created_by)
  values (btrim(p_name), upper(btrim(p_tag)), p_logo_url, auth.uid())
  returning id into v_team;
  insert into team_members (team_id, profile_id, role) values (v_team, auth.uid(), 'team_principal');

  insert into conversations (kind, team_id) values ('team', v_team) returning id into v_conversation;
  insert into conversation_members (conversation_id, profile_id) values (v_conversation, auth.uid());
  -- Les invitations reçues par le créateur n'ont plus lieu d'être.
  update team_invites set status = 'declined' where invitee_id = auth.uid() and status = 'pending';
  return v_team;
end $$;

create or replace function public.update_team_logo(p_team_id uuid, p_logo_url text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_principal(p_team_id) then
    raise exception 'Only the Team Principal can change the crest';
  end if;
  update teams set logo_url = p_logo_url where id = p_team_id;
end $$;

create or replace function public.invite_to_team(p_pilot_id uuid)
returns public.team_invites
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := public.my_team_id();
  i team_invites;
begin
  if v_team is null or not public.is_team_principal(v_team) then
    raise exception 'Only the Team Principal can recruit';
  end if;
  if exists (select 1 from team_members where profile_id = p_pilot_id) then
    raise exception 'Pilot already belongs to a team';
  end if;
  if (select count(*) from team_members where team_id = v_team) >= 12 then
    raise exception 'Team is full';
  end if;
  select * into i from team_invites where team_id = v_team and invitee_id = p_pilot_id and status = 'pending';
  if i.id is not null then
    return i;
  end if;
  insert into team_invites (team_id, invitee_id, invited_by) values (v_team, p_pilot_id, auth.uid()) returning * into i;
  return i;
end $$;

create or replace function public.respond_team_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  i team_invites;
begin
  select * into i from team_invites where id = p_invite_id and invitee_id = auth.uid() and status = 'pending' for update;
  if i.id is null then
    raise exception 'No pending invitation';
  end if;
  if not p_accept then
    update team_invites set status = 'declined' where id = i.id;
    return;
  end if;
  if exists (select 1 from team_members where profile_id = auth.uid()) then
    raise exception 'You already belong to a team';
  end if;
  perform 1 from teams where id = i.team_id for update;
  if (select count(*) from team_members where team_id = i.team_id) >= 12 then
    raise exception 'Team is full';
  end if;

  insert into team_members (team_id, profile_id, role) values (i.team_id, auth.uid(), 'pilote_officiel');
  insert into conversation_members (conversation_id, profile_id)
    select id, auth.uid() from conversations where team_id = i.team_id
    on conflict do nothing;
  update team_invites set status = 'accepted' where id = i.id;
  -- Les autres invitations du pilote tombent.
  update team_invites set status = 'declined' where invitee_id = auth.uid() and status = 'pending';
end $$;

-- Quitter l'écurie : le Team Principal passe la main au pilote le plus ancien ; le dernier ferme l'écurie.
create or replace function public.leave_team()
returns void
language plpgsql security definer set search_path = public as $$
declare
  m team_members;
  v_next uuid;
begin
  select * into m from team_members where profile_id = auth.uid() for update;
  if m.team_id is null then
    raise exception 'You do not belong to a team';
  end if;
  perform 1 from teams where id = m.team_id for update;

  delete from team_members where team_id = m.team_id and profile_id = auth.uid();
  delete from conversation_members
   where profile_id = auth.uid() and conversation_id in (select id from conversations where team_id = m.team_id);

  if not exists (select 1 from team_members where team_id = m.team_id) then
    delete from teams where id = m.team_id;
  elsif m.role = 'team_principal' then
    select profile_id into v_next from team_members where team_id = m.team_id order by joined_at limit 1;
    update team_members set role = 'team_principal' where team_id = m.team_id and profile_id = v_next;
  end if;
end $$;

create or replace function public.kick_team_member(p_pilot_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := public.my_team_id();
begin
  if v_team is null or not public.is_team_principal(v_team) or p_pilot_id = auth.uid() then
    raise exception 'Only the Team Principal can release a pilot';
  end if;
  delete from team_members where team_id = v_team and profile_id = p_pilot_id;
  if not found then
    raise exception 'Pilot is not in your team';
  end if;
  delete from conversation_members
   where profile_id = p_pilot_id and conversation_id in (select id from conversations where team_id = v_team);
end $$;

-- ========== FONCTIONS : RADIO PADDOCK ==========
-- Conversation 1v1 avec un coéquipier (créée au premier appel).
create or replace function public.get_direct_conversation(p_pilot_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_key text := least(auth.uid(), p_pilot_id)::text || ':' || greatest(auth.uid(), p_pilot_id)::text;
  v_id uuid;
begin
  if not exists (
    select 1 from friendships
     where status = 'accepted'
       and least(requester_id, addressee_id) = least(auth.uid(), p_pilot_id)
       and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_pilot_id)
  ) then
    raise exception 'Radio is reserved to teammates';
  end if;

  select id into v_id from conversations where direct_key = v_key;
  if v_id is null then
    insert into conversations (kind, direct_key) values ('direct', v_key)
    on conflict (direct_key) do update set direct_key = excluded.direct_key
    returning id into v_id;
    insert into conversation_members (conversation_id, profile_id)
    values (v_id, auth.uid()), (v_id, p_pilot_id)
    on conflict do nothing;
  end if;
  return v_id;
end $$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql security definer set search_path = public as $$
  update conversation_members set last_read_at = now()
   where conversation_id = p_conversation_id and profile_id = auth.uid();
$$;

-- Liste de mes conversations : interlocuteur ou écurie, dernier message, nombre de non-lus.
create or replace function public.my_conversations()
returns table (
  id uuid, kind public.conversation_kind, team_id uuid, title text, tag text, avatar_url text,
  other_id uuid, last_message text, last_message_at timestamptz, unread int
)
language sql stable security definer set search_path = public as $$
  select c.id, c.kind, c.team_id,
         coalesce(t.name, op.username), t.tag, coalesce(t.logo_url, op.avatar_url),
         op.id,
         (select m.body from messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
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

revoke execute on function
  public.is_conversation_member(uuid), public.my_team_id(), public.is_team_principal(uuid),
  public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean), public.remove_friend(uuid),
  public.create_team(text, text, text), public.update_team_logo(uuid, text), public.invite_to_team(uuid),
  public.respond_team_invite(uuid, boolean), public.leave_team(), public.kick_team_member(uuid),
  public.get_direct_conversation(uuid), public.mark_conversation_read(uuid), public.my_conversations()
from public, anon;
grant execute on function
  public.is_conversation_member(uuid), public.my_team_id(), public.is_team_principal(uuid),
  public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean), public.remove_friend(uuid),
  public.create_team(text, text, text), public.update_team_logo(uuid, text), public.invite_to_team(uuid),
  public.respond_team_invite(uuid, boolean), public.leave_team(), public.kick_team_member(uuid),
  public.get_direct_conversation(uuid), public.mark_conversation_read(uuid), public.my_conversations()
to authenticated;
revoke execute on function public.on_message_sent() from public, anon, authenticated;

-- Temps réel : messages (Radio Paddock), demandes de coéquipiers et invitations d'écurie.
alter publication supabase_realtime add table public.messages, public.friendships, public.team_invites, public.team_members;
