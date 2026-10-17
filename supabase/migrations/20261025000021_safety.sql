-- Kart Rivals : bloquer et signaler.
--   - Bloquer un pilote : la relation de coéquipier tombe ; plus de demande, de défi, d'invitation d'écurie ni de
--     message 1v1 entre les deux ; il disparaît de la recherche à proximité.
--   - Signaler un pilote ou un message (motif + précisions). Les signalements se consultent dans le tableau de
--     bord Supabase (table reports). Un message signalé par 3 pilotes différents est masqué pour tous.

-- ========== BLOCAGES ==========
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;
create policy "pilots read their blocks" on public.blocks for select to authenticated using (blocker_id = auth.uid());

-- Vrai si l'un des deux pilotes a bloqué l'autre.
create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks
     where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

-- Conversation 1v1 gelée par un blocage entre ses deux membres.
create or replace function public.conversation_blocked(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from conversations c
      join conversation_members a on a.conversation_id = c.id and a.profile_id = auth.uid()
      join conversation_members b on b.conversation_id = c.id and b.profile_id <> auth.uid()
     where c.id = p_conversation_id and c.kind = 'direct' and public.is_blocked_between(a.profile_id, b.profile_id)
  );
$$;

create or replace function public.block_pilot(p_pilot_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_pilot_id = auth.uid() then
    raise exception 'You cannot block yourself';
  end if;
  insert into blocks (blocker_id, blocked_id) values (auth.uid(), p_pilot_id) on conflict do nothing;
  -- La relation de coéquipier et les invitations d'écurie entre les deux tombent.
  delete from friendships
   where least(requester_id, addressee_id) = least(auth.uid(), p_pilot_id)
     and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_pilot_id);
  update team_invites set status = 'declined'
   where status = 'pending'
     and ((invitee_id = auth.uid() and invited_by = p_pilot_id) or (invitee_id = p_pilot_id and invited_by = auth.uid()));
end $$;

create or replace function public.unblock_pilot(p_pilot_id uuid)
returns void
language sql security definer set search_path = public as $$
  delete from blocks where blocker_id = auth.uid() and blocked_id = p_pilot_id;
$$;

-- Plus de défi entre pilotes bloqués.
drop policy if exists "users send challenges as themselves" on public.challenges;
create policy "users send challenges as themselves" on public.challenges
  for insert to authenticated
  with check (challenger_id = auth.uid() and status = 'pending' and not public.is_blocked_between(challenger_id, opponent_id));

-- Plus de message dans une conversation 1v1 gelée.
drop policy if exists "members send messages as themselves" on public.messages;
create policy "members send messages as themselves" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid() and public.is_conversation_member(conversation_id) and not public.conversation_blocked(conversation_id)
  );

-- Demandes de coéquipier, conversations 1v1 et invitations d'écurie refusées en cas de blocage.
create or replace function public.reject_blocked_friendship()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_blocked_between(new.requester_id, new.addressee_id) then
    raise exception 'Pilot unavailable';
  end if;
  return new;
end $$;
create or replace function public.reject_blocked_team_invite()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_blocked_between(new.invitee_id, new.invited_by) then
    raise exception 'Pilot unavailable';
  end if;
  return new;
end $$;
create trigger friendships_reject_blocked before insert or update on public.friendships
  for each row execute function public.reject_blocked_friendship();
create trigger team_invites_reject_blocked before insert on public.team_invites
  for each row execute function public.reject_blocked_team_invite();

create or replace function public.get_direct_conversation(p_pilot_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_key text := least(auth.uid(), p_pilot_id)::text || ':' || greatest(auth.uid(), p_pilot_id)::text;
  v_id uuid;
begin
  if public.is_blocked_between(auth.uid(), p_pilot_id) then
    raise exception 'Pilot unavailable';
  end if;
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

-- Recherche à proximité : les pilotes bloqués (dans un sens ou dans l'autre) n'apparaissent plus.
create or replace function public.nearby_pilots(lat float, lng float, radius_km int default 30)
returns table (
  id uuid, username text, avatar_url text, elo int, rank public.rank_tier,
  wins int, losses int, distance_km numeric
)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.username, p.avatar_url, p.elo, p.rank, p.wins, p.losses,
         round((st_distance(p.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) / 1000)::numeric, 1)
  from profiles p
  where p.is_discoverable
    and p.location is not null
    and p.id <> auth.uid()
    and not public.is_blocked_between(p.id, auth.uid())
    and st_dwithin(p.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography,
                   least(greatest(radius_km, 1), 200) * 1000)
  order by 8
  limit 50;
$$;

-- ========== SIGNALEMENTS ==========
create type public.report_reason as enum ('harassment', 'spam', 'cheating', 'inappropriate', 'other');

create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references public.profiles (id) on delete cascade,
  target_profile_id uuid not null references public.profiles (id) on delete cascade,
  message_id        uuid references public.messages (id) on delete set null,
  reason            public.report_reason not null,
  details           text check (char_length(details) <= 500),
  status            text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at        timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at desc);
create index reports_target_idx on public.reports (target_profile_id);
-- Un seul signalement ouvert par pilote pour une même cible (pilote ou message).
create unique index reports_once on public.reports
  (reporter_id, target_profile_id, coalesce(message_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'open';

-- Lecture réservée au tableau de bord (service_role) : aucun droit pour l'app.
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;

alter table public.messages add column hidden_at timestamptz;

create or replace function public.report(p_pilot_id uuid, p_reason public.report_reason, p_details text default null, p_message_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m messages;
begin
  if p_pilot_id = auth.uid() then
    raise exception 'You cannot report yourself';
  end if;
  if not exists (select 1 from profiles where id = p_pilot_id) then
    raise exception 'Pilot not found';
  end if;
  if p_message_id is not null then
    select * into m from messages where id = p_message_id;
    if m.id is null or m.sender_id <> p_pilot_id or not public.is_conversation_member(m.conversation_id) then
      raise exception 'Message not found';
    end if;
  end if;
  if (select count(*) from reports where reporter_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many reports';
  end if;

  insert into reports (reporter_id, target_profile_id, message_id, reason, details)
  values (auth.uid(), p_pilot_id, p_message_id, p_reason, nullif(btrim(p_details), ''))
  on conflict do nothing;

  -- Masqué pour tous dès 3 signalements de pilotes différents.
  if p_message_id is not null
     and (select count(distinct reporter_id) from reports where message_id = p_message_id) >= 3 then
    update messages set hidden_at = now() where id = p_message_id and hidden_at is null;
  end if;
end $$;

revoke execute on function
  public.is_blocked_between(uuid, uuid), public.conversation_blocked(uuid), public.block_pilot(uuid),
  public.unblock_pilot(uuid), public.report(uuid, public.report_reason, text, uuid)
from public, anon;
grant execute on function
  public.is_blocked_between(uuid, uuid), public.conversation_blocked(uuid), public.block_pilot(uuid),
  public.unblock_pilot(uuid), public.report(uuid, public.report_reason, text, uuid)
to authenticated;
revoke execute on function public.reject_blocked_friendship(), public.reject_blocked_team_invite() from public, anon, authenticated;

alter publication supabase_realtime add table public.blocks;
