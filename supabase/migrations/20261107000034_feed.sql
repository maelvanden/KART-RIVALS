-- Kart Rivals : fil d'actualité.
--   - Publications : chrono (temps, catégorie de kart, piste sèche / mouillée, catégorie de poids), photo ou vidéo
--     (bucket public feed-media), texte, circuit.
--   - Chrono certifié : publication liée à une session Time Attack validée par ticket (le temps vient de la session).
--     Record : chrono certifié égal au meilleur Time Attack validé du circuit au moment de la publication.
--   - J'aime, réactions (🔥 👏 😤), commentaires ; filtres Tout / Coéquipiers / Records / Certifiés.
--   - Modération : signalement des publications et commentaires, masqués après 3 signalements.

create table public.feed_posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  track_id      uuid references public.tracks (id) on delete set null,
  caption       text check (char_length(caption) <= 500),
  lap_ms        int check (lap_ms between 10000 and 600000),
  kart_category text check (char_length(kart_category) <= 20),
  conditions    text check (conditions in ('dry', 'wet')),
  weight_class  text check (char_length(weight_class) <= 20),
  media_path    text,
  media_type    text check (media_type in ('image', 'video')),
  media_width   int,
  media_height  int,
  session_id    uuid unique references public.time_attack_sessions (id) on delete set null,
  certified     boolean not null default false,
  is_record     boolean not null default false,
  hidden_at     timestamptz,
  created_at    timestamptz not null default now(),
  check (caption is not null or lap_ms is not null or media_path is not null),
  check ((media_path is null) = (media_type is null))
);
create index feed_posts_created_idx on public.feed_posts (created_at desc);
create index feed_posts_author_idx on public.feed_posts (author_id, created_at desc);

create table public.post_reactions (
  post_id    uuid not null references public.feed_posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('like', 'fire', 'clap', 'rage')),
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id, kind)
);

create table public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.feed_posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body       text not null check (char_length(body) between 1 and 500),
  hidden_at  timestamptz,
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.feed_posts enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_comments enable row level security;
revoke all on public.feed_posts, public.post_reactions, public.post_comments from anon, authenticated;
grant select, delete on public.feed_posts, public.post_comments to authenticated;
grant select on public.post_reactions to authenticated;

create policy "visible posts" on public.feed_posts for select to authenticated
  using ((hidden_at is null and not public.is_blocked_between(author_id, auth.uid())) or author_id = auth.uid());
create policy "authors delete posts" on public.feed_posts for delete to authenticated
  using (author_id = auth.uid() or public.is_app_admin());
create policy "reactions readable" on public.post_reactions for select to authenticated using (true);
create policy "visible comments" on public.post_comments for select to authenticated
  using ((hidden_at is null and not public.is_blocked_between(author_id, auth.uid())) or author_id = auth.uid());
create policy "authors delete comments" on public.post_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_app_admin()
         or exists (select 1 from feed_posts p where p.id = post_id and p.author_id = auth.uid()));

-- Médias des publications : bucket public, rangés sous <auteur>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feed-media', 'feed-media', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;
create policy "pilots upload feed media" on storage.objects for insert to authenticated
  with check (bucket_id = 'feed-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pilots delete their feed media" on storage.objects for delete to authenticated
  using (bucket_id = 'feed-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ========== PUBLIER ==========
-- p : caption, track_id, lap_ms, kart_category, conditions, weight_class, media_path, media_type, media_width,
-- media_height, session_id (Time Attack validé → chrono certifié, temps et circuit repris de la session).
create or replace function public.create_post(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_session time_attack_sessions;
  v_track uuid := nullif(p->>'track_id', '')::uuid;
  v_lap int := nullif(p->>'lap_ms', '')::int;
  v_certified boolean := false;
  v_record boolean := false;
  v_id uuid;
begin
  if (select count(*) from feed_posts where author_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many posts today';
  end if;
  if nullif(p->>'media_path', '') is not null and split_part(p->>'media_path', '/', 1) <> auth.uid()::text then
    raise exception 'Invalid media';
  end if;
  if nullif(p->>'session_id', '') is not null then
    select * into v_session from time_attack_sessions
     where id = (p->>'session_id')::uuid and pilot_id = auth.uid() and status = 'validated';
    if v_session.id is null then
      raise exception 'Time Attack session not found';
    end if;
    v_track := v_session.track_id;
    v_lap := v_session.best_lap_ms;
    v_certified := v_lap is not null;
    v_record := v_certified and v_lap <= (
      select min(best_lap_ms) from time_attack_sessions where track_id = v_track and status = 'validated'
    );
  end if;

  insert into feed_posts (author_id, track_id, caption, lap_ms, kart_category, conditions, weight_class, media_path,
                          media_type, media_width, media_height, session_id, certified, is_record)
  values (auth.uid(), v_track, nullif(btrim(p->>'caption'), ''), v_lap, nullif(btrim(p->>'kart_category'), ''),
          nullif(p->>'conditions', ''), nullif(btrim(p->>'weight_class'), ''), nullif(p->>'media_path', ''),
          nullif(p->>'media_type', ''), nullif(p->>'media_width', '')::int, nullif(p->>'media_height', '')::int,
          v_session.id, v_certified, v_record)
  returning id into v_id;
  return v_id;
end $$;

-- ========== FIL ==========
-- p_filter : all | friends (moi, mes coéquipiers et mon écurie) | records | certified. Pagination par date.
create or replace function public.feed(p_filter text default 'all', p_before timestamptz default null, p_limit int default 20)
returns table (
  id uuid, author_id uuid, author_username text, author_avatar text, author_elo int, author_rank public.rank_tier,
  track_id uuid, track_name text, caption text, lap_ms int, kart_category text, conditions text, weight_class text,
  media_path text, media_type text, media_width int, media_height int, certified boolean, is_record boolean,
  created_at timestamptz, comments int, reactions jsonb, my_reactions text[]
)
language sql stable security definer set search_path = public as $$
  select f.id, f.author_id, a.username, a.avatar_url, a.elo, a.rank,
         f.track_id, t.name, f.caption, f.lap_ms, f.kart_category, f.conditions, f.weight_class,
         f.media_path, f.media_type, f.media_width, f.media_height, f.certified, f.is_record, f.created_at,
         (select count(*)::int from post_comments c where c.post_id = f.id and c.hidden_at is null),
         coalesce((select jsonb_object_agg(kind, n) from (
                     select r.kind, count(*) n from post_reactions r where r.post_id = f.id group by r.kind) k), '{}'::jsonb),
         coalesce((select array_agg(r.kind) from post_reactions r where r.post_id = f.id and r.profile_id = auth.uid()), '{}')
    from feed_posts f
    join profiles a on a.id = f.author_id
    left join tracks t on t.id = f.track_id
   where (f.hidden_at is null or f.author_id = auth.uid())
     and not public.is_blocked_between(f.author_id, auth.uid())
     and (p_before is null or f.created_at < p_before)
     and case p_filter
           when 'friends' then f.author_id = auth.uid() or public.are_teammates(f.author_id, auth.uid())
           when 'records' then f.is_record
           when 'certified' then f.certified
           else true
         end
   order by f.created_at desc
   limit least(greatest(p_limit, 1), 50);
$$;

-- ========== INTERACTIONS ==========
create or replace function public.toggle_reaction(p_post_id uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from feed_posts where id = p_post_id and hidden_at is null) then
    raise exception 'Post not found';
  end if;
  if exists (select 1 from post_reactions where post_id = p_post_id and profile_id = auth.uid() and kind = p_kind) then
    delete from post_reactions where post_id = p_post_id and profile_id = auth.uid() and kind = p_kind;
    return false;
  end if;
  insert into post_reactions (post_id, profile_id, kind) values (p_post_id, auth.uid(), p_kind);
  return true;
end $$;

create or replace function public.add_comment(p_post_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_id uuid;
begin
  select author_id into v_author from feed_posts where id = p_post_id and hidden_at is null;
  if v_author is null then
    raise exception 'Post not found';
  end if;
  if public.is_blocked_between(v_author, auth.uid()) then
    raise exception 'Pilot unavailable';
  end if;
  if (select count(*) from post_comments where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many comments';
  end if;
  insert into post_comments (post_id, author_id, body) values (p_post_id, auth.uid(), btrim(p_body)) returning id into v_id;
  return v_id;
end $$;

-- ========== SIGNALEMENTS ==========
alter table public.reports
  add column if not exists post_id uuid references public.feed_posts (id) on delete set null,
  add column if not exists comment_id uuid references public.post_comments (id) on delete set null;
drop index if exists public.reports_once;
create unique index reports_once on public.reports
  (reporter_id, target_profile_id,
   coalesce(message_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(photo_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(review_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'open';

create or replace function public.report_post(p_post_id uuid, p_reason public.report_reason, p_details text default null,
                                              p_comment_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
begin
  if p_comment_id is not null then
    select author_id into v_target from post_comments where id = p_comment_id;
  else
    select author_id into v_target from feed_posts where id = p_post_id;
  end if;
  if v_target is null then
    raise exception 'Post not found';
  end if;
  if v_target = auth.uid() then
    raise exception 'You cannot report yourself';
  end if;
  if (select count(*) from reports where reporter_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many reports';
  end if;
  insert into reports (reporter_id, target_profile_id, post_id, comment_id, reason, details)
  values (auth.uid(), v_target, case when p_comment_id is null then p_post_id end, p_comment_id, p_reason,
          nullif(btrim(p_details), ''))
  on conflict do nothing;
  if p_comment_id is not null then
    if (select count(distinct reporter_id) from reports where comment_id = p_comment_id) >= 3 then
      update post_comments set hidden_at = now() where id = p_comment_id and hidden_at is null;
    end if;
  elsif (select count(distinct reporter_id) from reports where post_id = p_post_id) >= 3 then
    update feed_posts set hidden_at = now() where id = p_post_id and hidden_at is null;
  end if;
end $$;

drop function if exists public.admin_reports(text);
create function public.admin_reports(p_status text default 'open')
returns table (
  id uuid, reason public.report_reason, details text, status text, created_at timestamptz,
  reporter_id uuid, reporter_username text,
  target_id uuid, target_username text, target_report_count int,
  message_id uuid, message_kind text, message_body text, message_hidden boolean,
  photo_id uuid, photo_path text, photo_hidden boolean,
  review_id uuid, review_comment text, review_track text, review_hidden boolean,
  post_id uuid, post_caption text, post_media_path text, post_hidden boolean,
  comment_id uuid, comment_body text, comment_hidden boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then
    raise exception 'Admins only';
  end if;
  return query
    select r.id, r.reason, r.details, r.status, r.created_at,
           r.reporter_id, rp.username,
           r.target_profile_id, tp.username,
           (select count(*)::int from reports x where x.target_profile_id = r.target_profile_id),
           m.id, m.kind::text, m.body, m.hidden_at is not null,
           ph.id, ph.path, ph.hidden_at is not null,
           rv.id, rv.comment, rt.name, rv.hidden_at is not null,
           fp.id, fp.caption, case when fp.media_type = 'image' then fp.media_path end, fp.hidden_at is not null,
           pc.id, pc.body, pc.hidden_at is not null
      from reports r
      left join profiles rp on rp.id = r.reporter_id
      left join profiles tp on tp.id = r.target_profile_id
      left join messages m on m.id = r.message_id
      left join track_photos ph on ph.id = r.photo_id
      left join track_reviews rv on rv.id = r.review_id
      left join tracks rt on rt.id = rv.track_id
      left join feed_posts fp on fp.id = r.post_id
      left join post_comments pc on pc.id = r.comment_id
     where r.status = p_status
     order by r.created_at desc
     limit 100;
end $$;

create or replace function public.resolve_report(p_report_id uuid, p_status text, p_hide boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r reports;
begin
  if not public.is_app_admin() then
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
  if p_hide is null then
    return;
  end if;
  update messages set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.message_id;
  update track_photos set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.photo_id;
  update track_reviews set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.review_id;
  update feed_posts set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.post_id;
  update post_comments set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.comment_id;
end $$;

revoke execute on function
  public.create_post(jsonb), public.feed(text, timestamptz, int), public.toggle_reaction(uuid, text),
  public.add_comment(uuid, text), public.report_post(uuid, public.report_reason, text, uuid), public.admin_reports(text)
from public, anon;
grant execute on function
  public.create_post(jsonb), public.feed(text, timestamptz, int), public.toggle_reaction(uuid, text),
  public.add_comment(uuid, text), public.report_post(uuid, public.report_reason, text, uuid), public.admin_reports(text)
to authenticated;
