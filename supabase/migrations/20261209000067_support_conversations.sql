-- Kart Rivals : « Contacter l'équipe » depuis l'appli.
--   - Chaque pilote a au plus une conversation « support » (get_support_conversation la crée au premier besoin).
--     Le pilote en est le seul membre ; les admins appli y ont accès sans en être membres (is_conversation_member),
--     ce qui leur ouvre la lecture, l'envoi, les photos et le temps réel comme dans la Radio Paddock.
--   - Les messages de l'équipe s'affichent « Équipe Kart Rivals » côté pilote.
--   - Lu côté équipe : conversations.staff_read_at (une seule lecture partagée par tous les admins).
--   - admin_support_inbox : boîte de réception des admins, non lus d'abord.
--   - Un compte suspendu ou banni peut toujours écrire à l'équipe (contester une sanction).

alter table public.conversations
  add column if not exists support_profile_id uuid references public.profiles (id) on delete cascade,
  add column if not exists staff_read_at timestamptz;
create unique index if not exists conversations_support_profile_idx
  on public.conversations (support_profile_id) where kind = 'support';
alter table public.conversations drop constraint if exists conversations_support_check;
alter table public.conversations add constraint conversations_support_check
  check ((kind = 'support') = (support_profile_id is not null));

-- Membre de la conversation, ou admin appli pour une conversation support.
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_members where conversation_id = p_conversation_id and profile_id = auth.uid()
  ) or (
    public.is_app_admin()
    and exists (select 1 from conversations where id = p_conversation_id and kind = 'support')
  );
$$;

-- Conversation support du pilote connecté, créée au premier besoin ; renvoie son id.
create or replace function public.get_support_conversation()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select id into v_id from conversations where kind = 'support' and support_profile_id = auth.uid();
  if v_id is null then
    insert into conversations (kind, support_profile_id) values ('support', auth.uid())
    on conflict (support_profile_id) where kind = 'support' do update set support_profile_id = excluded.support_profile_id
    returning id into v_id;
    insert into conversation_members (conversation_id, profile_id) values (v_id, auth.uid())
    on conflict do nothing;
  end if;
  return v_id;
end $$;

-- Lecture : le pilote avance sa ligne de membre, un admin avance la lecture de l'équipe.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update conversation_members set last_read_at = now()
   where conversation_id = p_conversation_id and profile_id = auth.uid();
  if public.is_app_admin() then
    update conversations set staff_read_at = now()
     where id = p_conversation_id and kind = 'support' and support_profile_id <> auth.uid();
  end if;
end $$;

-- Un compte suspendu ou banni ne crée plus rien, sauf ses messages à l'équipe.
create or replace function public.reject_restricted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.is_restricted(auth.uid()) then
    -- Conditions imbriquées : new.conversation_id n'existe que pour messages (PL/pgSQL lirait le champ même après un « and » faux).
    if tg_table_name = 'messages' then
      if exists (select 1 from conversations where id = new.conversation_id and kind = 'support') then
        return new;
      end if;
    end if;
    raise exception 'Account suspended';
  end if;
  return new;
end $$;

-- Liste des conversations du pilote : la conversation support s'appelle « Équipe Kart Rivals ».
create or replace function public.my_conversations()
returns table (
  id uuid, kind public.conversation_kind, team_id uuid, title text, tag text, avatar_url text,
  other_id uuid, last_message text, last_message_at timestamptz, unread int
)
language sql stable security definer set search_path = public as $$
  select c.id, c.kind, c.team_id,
         case when c.kind = 'support' then 'Équipe Kart Rivals' else coalesce(t.name, op.username) end,
         t.tag, coalesce(t.logo_url, op.avatar_url),
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

-- Boîte de réception de l'équipe : conversations support, non lues d'abord puis les plus récentes.
-- Vide pour qui n'est pas admin appli.
create or replace function public.admin_support_inbox()
returns table (
  id uuid, pilot_id uuid, username text, avatar_url text, restricted boolean,
  last_message text, last_message_at timestamptz, unread int
)
language sql stable security definer set search_path = public as $$
  select s.* from (
    select c.id, p.id as pilot_id, p.username, p.avatar_url, public.is_restricted(p.id) as restricted,
           (select public.message_preview(m.kind, m.body, m.payload) from messages m
             where m.conversation_id = c.id order by m.created_at desc limit 1) as last_message,
           c.last_message_at,
           (select count(*)::int from messages m
             where m.conversation_id = c.id and m.sender_id = c.support_profile_id
               and m.created_at > coalesce(c.staff_read_at, '-infinity'::timestamptz)) as unread
      from conversations c
      join profiles p on p.id = c.support_profile_id
     where public.is_app_admin() and c.kind = 'support' and c.last_message_at is not null
  ) s
  order by s.unread > 0 desc, s.last_message_at desc
  limit 200;
$$;

revoke execute on function public.get_support_conversation(), public.admin_support_inbox() from public, anon;
grant execute on function public.get_support_conversation(), public.admin_support_inbox() to authenticated;
