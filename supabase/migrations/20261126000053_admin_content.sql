-- Kart Rivals : modération de l'Actu par les admins appli.
--   - Fil admin des derniers contenus : publications, commentaires, photos de circuits et avis, masqués compris,
--     avec leur nombre de signalements.
--   - Masquer / rétablir un contenu en un geste, sans attendre de signalement (tracé dans le journal admin).

-- p_filter : all, posts, comments, photos, reviews, hidden (tous types, masqués seulement), reported (signalés).
create or replace function public.admin_content(p_filter text default 'all', p_before timestamptz default null,
                                                p_limit int default 30)
returns table (kind text, id uuid, created_at timestamptz, author_id uuid, author_username text, author_avatar text,
               track_id uuid, track_name text, post_id uuid, body text, media_path text, media_type text, lap_ms int,
               rating numeric, hidden boolean, report_count int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return query
    select x.kind, x.id, x.created_at, x.author_id, p.username, p.avatar_url, x.track_id, t.name, x.post_id, x.body,
           x.media_path, x.media_type, x.lap_ms, x.rating, x.hidden, x.report_count
      from (
        select 'post'::text as kind, f.id, f.created_at, f.author_id, f.track_id, f.id as post_id, f.caption as body,
               f.media_path, f.media_type, f.lap_ms, null::numeric as rating, f.hidden_at is not null as hidden,
               (select count(*)::int from reports r where r.post_id = f.id) as report_count
          from feed_posts f
         where p_filter in ('all', 'posts', 'hidden', 'reported') and (p_before is null or f.created_at < p_before)
        union all
        select 'comment', m.id, m.created_at, m.author_id, f.track_id, m.post_id, m.body, null, null, null, null,
               m.hidden_at is not null, (select count(*)::int from reports r where r.comment_id = m.id)
          from post_comments m join feed_posts f on f.id = m.post_id
         where p_filter in ('all', 'comments', 'hidden', 'reported') and (p_before is null or m.created_at < p_before)
        union all
        select 'photo', ph.id, ph.created_at, ph.author_id, ph.track_id, null, ph.caption, ph.path, 'image', null, null,
               ph.hidden_at is not null, (select count(*)::int from reports r where r.photo_id = ph.id)
          from track_photos ph
         where p_filter in ('all', 'photos', 'hidden', 'reported') and (p_before is null or ph.created_at < p_before)
        union all
        select 'review', v.id, v.updated_at, v.author_id, v.track_id, null, v.comment, null, null, null,
               round((v.track_score + v.karts_score + v.staff_score + v.price_score) / 4.0, 1),
               v.hidden_at is not null, (select count(*)::int from reports r where r.review_id = v.id)
          from track_reviews v
         where p_filter in ('all', 'reviews', 'hidden', 'reported') and (p_before is null or v.updated_at < p_before)
      ) x
      left join profiles p on p.id = x.author_id
      left join tracks t on t.id = x.track_id
     where (p_filter <> 'hidden' or x.hidden)
       and (p_filter <> 'reported' or x.report_count > 0)
     order by x.created_at desc
     limit least(greatest(p_limit, 1), 60);
end $$;

create or replace function public.admin_set_content_hidden(p_kind text, p_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_excerpt text;
begin
  perform public.require_app_admin();
  case p_kind
    when 'post' then
      update feed_posts set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end where id = p_id
      returning author_id, coalesce(caption, case when lap_ms is not null then 'Chrono' else 'Média' end)
      into v_author, v_excerpt;
    when 'comment' then
      update post_comments set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end where id = p_id
      returning author_id, body into v_author, v_excerpt;
    when 'photo' then
      update track_photos set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end where id = p_id
      returning author_id, coalesce(caption, 'Photo de circuit') into v_author, v_excerpt;
    when 'review' then
      update track_reviews set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end where id = p_id
      returning author_id, coalesce(comment, 'Avis sans commentaire') into v_author, v_excerpt;
    else
      raise exception 'Unknown content type';
  end case;
  if v_author is null then
    raise exception 'Content not found';
  end if;
  insert into admin_actions (action, profile_id, details)
  values (case when p_hidden then 'hide_content' else 'show_content' end, v_author,
          jsonb_build_object('kind', p_kind, 'excerpt', left(v_excerpt, 80)));
end $$;

revoke execute on function public.admin_content(text, timestamptz, int), public.admin_set_content_hidden(text, uuid, boolean)
  from public, anon;
grant execute on function public.admin_content(text, timestamptz, int), public.admin_set_content_hidden(text, uuid, boolean)
  to authenticated;
