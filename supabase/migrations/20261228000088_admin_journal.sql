-- Kart Rivals : journal admin filtrable.
--   - admin_journal : toutes les actions, filtrables par auteur, type d'action, pilote visé, circuit et période,
--     lues page par page (curseur created_at + id). Chaque ligne indique si l'auteur est aujourd'hui admin appli ou
--     modérateur, pour savoir qui a pris quelle décision.
--   - admin_journal_actors : les membres de l'équipe qui ont agi, pour le filtre par auteur.
--   - resolve_report laisse maintenant une trace au journal : un signalement traité ou rejeté par un modérateur
--     n'apparaissait nulle part jusqu'ici.
-- Le journal reste réservé aux admins appli.

create index if not exists admin_actions_created_idx on public.admin_actions (created_at desc, id desc);
create index if not exists admin_actions_admin_idx on public.admin_actions (admin_id, created_at desc);
create index if not exists admin_actions_track_idx on public.admin_actions (track_id, created_at desc);

create or replace function public.admin_journal(
  p_admin uuid default null,
  p_actions text[] default null,
  p_pilot text default null,
  p_track text default null,
  p_since timestamptz default null,
  p_before timestamptz default null,
  p_before_id bigint default null,
  p_limit int default 50
)
returns table (id bigint, action text, created_at timestamptz, admin_id uuid, admin text, admin_role text,
               pilot_id uuid, pilot text, track_id uuid, track text, details jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  v_pilot text := nullif(btrim(coalesce(p_pilot, '')), '');
  v_track text := nullif(btrim(coalesce(p_track, '')), '');
begin
  perform public.require_app_admin();
  return query
    select a.id, a.action, a.created_at, a.admin_id, ap.username,
           case when exists (select 1 from app_admins x where x.profile_id = a.admin_id) then 'admin'
                when exists (select 1 from app_moderators x where x.profile_id = a.admin_id) then 'moderator' end,
           a.profile_id, pp.username, a.track_id, t.name, a.details
      from admin_actions a
      left join profiles ap on ap.id = a.admin_id
      left join profiles pp on pp.id = a.profile_id
      left join tracks t on t.id = a.track_id
     where (p_admin is null or a.admin_id = p_admin)
       and (p_actions is null or a.action = any (p_actions))
       and (v_pilot is null or pp.username ilike '%' || v_pilot || '%')
       and (v_track is null or t.name ilike '%' || v_track || '%')
       and (p_since is null or a.created_at >= p_since)
       and (p_before is null or (a.created_at, a.id) < (p_before, coalesce(p_before_id, 9223372036854775807)))
     order by a.created_at desc, a.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

create or replace function public.admin_journal_actors()
returns table (id uuid, username text, role text, actions int, last_action timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return query
    select p.id, p.username,
           case when exists (select 1 from app_admins x where x.profile_id = p.id) then 'admin'
                when exists (select 1 from app_moderators x where x.profile_id = p.id) then 'moderator' end,
           count(*)::int, max(a.created_at)
      from admin_actions a join profiles p on p.id = a.admin_id
     group by p.id, p.username
     order by max(a.created_at) desc;
end $$;

revoke execute on function public.admin_journal(uuid, text[], text, text, timestamptz, timestamptz, bigint, int),
  public.admin_journal_actors() from public, anon;
grant execute on function public.admin_journal(uuid, text[], text, text, timestamptz, timestamptz, bigint, int),
  public.admin_journal_actors() to authenticated;

-- Signalement traité ou rejeté : tracé au journal (auteur, pilote visé, décision, motif du signalement).
create or replace function public.resolve_report(p_report_id uuid, p_status text, p_hide boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r reports;
begin
  if not public.is_app_staff() then
    raise exception 'Admins only';
  end if;
  if p_status not in ('reviewed', 'dismissed') then
    raise exception 'Invalid status';
  end if;
  select * into r from reports where id = p_report_id;
  if r.id is null then
    raise exception 'Report not found';
  end if;
  update reports set status = p_status where id = r.id;
  insert into admin_actions (action, profile_id, details)
  values ('resolve_report', r.target_profile_id,
          jsonb_build_object('status', p_status, 'hidden', p_hide, 'report_reason', r.reason::text));
  if p_hide is null then
    return;
  end if;
  update messages set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.message_id;
  update track_photos set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.photo_id;
  update track_reviews set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.review_id;
  update feed_posts set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.post_id;
  update post_comments set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.comment_id;
end $$;
