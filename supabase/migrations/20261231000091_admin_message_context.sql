-- Kart Rivals : messages signalés, avec leur contexte, sur la fiche admin d'un pilote.
--   - admin_reported_messages : les messages Radio signalés contre un pilote (derniers signalements d'abord), sans
--     le reste de la conversation.
--   - admin_report_context : pour un signalement, le message visé et les 5 messages avant et après dans la même
--     conversation (1v1, écurie ou tournoi), pour juger sur le fil et pas sur une phrase isolée.
-- Ces conversations sont privées : le contexte ne s'ouvre que depuis un signalement, uniquement sur ce fil, et chaque
-- consultation est tracée au journal (une fois par signalement, auteur et jour). Ouvert à toute l'équipe, comme les
-- signalements eux-mêmes.

create or replace function public.admin_reported_messages(p_profile uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_staff();
  return coalesce((
    select jsonb_agg(x.r order by x.created_at desc)
      from (
        select r.created_at,
               jsonb_build_object(
                 'report_id', r.id, 'reason', r.reason, 'details', r.details, 'status', r.status,
                 'created_at', r.created_at, 'reporter', rp.username,
                 'message_id', m.id, 'text', public.message_preview(m.kind::text, m.body, m.payload),
                 'kind', m.kind, 'hidden', m.hidden_at is not null, 'sent_at', m.created_at,
                 'conversation_kind', c.kind) as r
          from reports r
          join messages m on m.id = r.message_id
          join conversations c on c.id = m.conversation_id
          left join profiles rp on rp.id = r.reporter_id
         where r.target_profile_id = p_profile
         order by r.created_at desc
         limit 15
      ) x), '[]'::jsonb);
end $$;

create or replace function public.admin_report_context(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r reports;
  m messages;
  c conversations;
  v_label text;
  v_messages jsonb;
begin
  perform public.require_app_staff();
  select * into r from reports where id = p_report_id;
  if r.id is null or r.message_id is null then
    raise exception 'Report not found';
  end if;
  select * into m from messages where id = r.message_id;
  if m.id is null then
    raise exception 'Message not found';
  end if;
  select * into c from conversations where id = m.conversation_id;

  v_label := case c.kind::text
    when 'team' then 'Radio d’écurie · ' || coalesce((select name from teams where id = c.team_id), 'écurie supprimée')
    when 'tournament' then 'Radio de tournoi · ' || coalesce((select name from tournaments where id = c.tournament_id), 'tournoi supprimé')
    when 'support' then 'Conversation avec l’équipe'
    else 'Radio 1 contre 1 · ' || coalesce((select string_agg(p.username, ' et ' order by p.username)
                                             from conversation_members cm join profiles p on p.id = cm.profile_id
                                            where cm.conversation_id = c.id), 'pilotes supprimés')
  end;

  -- Les 5 messages avant, le message signalé, les 5 après.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'sender_id', w.sender_id, 'sender', p.username,
           'role', case when w.id = m.id then 'reported'
                        when w.sender_id = r.target_profile_id then 'target'
                        when w.sender_id = r.reporter_id then 'reporter' else 'other' end,
           'text', public.message_preview(w.kind::text, w.body, w.payload), 'kind', w.kind,
           'hidden', w.hidden_at is not null, 'created_at', w.created_at)
         order by w.created_at, w.id), '[]'::jsonb)
    into v_messages
    from (
      (select * from messages x where x.conversation_id = c.id and (x.created_at, x.id) < (m.created_at, m.id)
        order by x.created_at desc, x.id desc limit 5)
      union all (select * from messages x where x.id = m.id)
      union all (select * from messages x where x.conversation_id = c.id and (x.created_at, x.id) > (m.created_at, m.id)
        order by x.created_at, x.id limit 5)
    ) w
    left join profiles p on p.id = w.sender_id;

  -- Conversation privée : la consultation est tracée, une fois par signalement, auteur et jour.
  if not exists (select 1 from admin_actions a
                  where a.admin_id = auth.uid() and a.action = 'view_message_context'
                    and a.details->>'report_id' = r.id::text and a.created_at > now() - interval '1 day') then
    insert into admin_actions (action, profile_id, details)
    values ('view_message_context', r.target_profile_id,
            jsonb_build_object('report_id', r.id, 'conversation', c.kind::text));
  end if;

  return jsonb_build_object('conversation', v_label, 'kind', c.kind, 'messages', v_messages);
end $$;

revoke execute on function public.admin_reported_messages(uuid), public.admin_report_context(uuid) from public, anon;
grant execute on function public.admin_reported_messages(uuid), public.admin_report_context(uuid) to authenticated;
