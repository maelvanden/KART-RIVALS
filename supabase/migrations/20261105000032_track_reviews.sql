-- Kart Rivals : avis des pilotes sur les circuits.
--   - Un avis par pilote et par circuit : notes de 1 à 5 (piste, karts, accueil, prix) et commentaire facultatif.
--   - Moyennes par circuit (track_ratings) pour la liste et la fiche.
--   - Modération : signalement (report_track_review), masqué pour tous après 3 signalements, traité par les admins
--     appli dans l'écran Signalements.

create table public.track_reviews (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references public.tracks (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  track_score smallint not null check (track_score between 1 and 5),
  karts_score smallint not null check (karts_score between 1 and 5),
  staff_score smallint not null check (staff_score between 1 and 5),
  price_score smallint not null check (price_score between 1 and 5),
  comment     text check (char_length(comment) <= 600),
  hidden_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (track_id, author_id)
);
create index track_reviews_track_idx on public.track_reviews (track_id, updated_at desc);

alter table public.track_reviews enable row level security;
revoke all on public.track_reviews from anon, authenticated;
grant select, delete on public.track_reviews to authenticated;
create policy "visible reviews readable" on public.track_reviews
  for select to authenticated using (hidden_at is null or author_id = auth.uid());
create policy "pilots delete their review" on public.track_reviews
  for delete to authenticated using (author_id = auth.uid());

-- Crée ou remplace mon avis sur un circuit.
create or replace function public.save_track_review(
  p_track_id uuid, p_track int, p_karts int, p_staff int, p_price int, p_comment text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from tracks where id = p_track_id) then
    raise exception 'Track not found';
  end if;
  insert into track_reviews (track_id, author_id, track_score, karts_score, staff_score, price_score, comment)
  values (p_track_id, auth.uid(), p_track, p_karts, p_staff, p_price, nullif(btrim(p_comment), ''))
  on conflict (track_id, author_id) do update set
    track_score = excluded.track_score, karts_score = excluded.karts_score, staff_score = excluded.staff_score,
    price_score = excluded.price_score, comment = excluded.comment, updated_at = now();
end $$;

-- Moyennes des avis visibles, par circuit.
create or replace function public.track_ratings()
returns table (track_id uuid, reviews int, overall numeric, track numeric, karts numeric, staff numeric, price numeric)
language sql stable security definer set search_path = public as $$
  select r.track_id, count(*)::int,
         round(avg((r.track_score + r.karts_score + r.staff_score + r.price_score) / 4.0), 1),
         round(avg(r.track_score), 1), round(avg(r.karts_score), 1), round(avg(r.staff_score), 1), round(avg(r.price_score), 1)
    from track_reviews r
   where r.hidden_at is null
   group by r.track_id;
$$;

-- ========== SIGNALEMENT D'UN AVIS ==========
alter table public.reports add column if not exists review_id uuid references public.track_reviews (id) on delete set null;
drop index if exists public.reports_once;
create unique index reports_once on public.reports
  (reporter_id, target_profile_id,
   coalesce(message_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(photo_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(review_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'open';

create or replace function public.report_track_review(p_review_id uuid, p_reason public.report_reason, p_details text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  rv track_reviews;
begin
  select * into rv from track_reviews where id = p_review_id;
  if rv.id is null then
    raise exception 'Review not found';
  end if;
  if rv.author_id = auth.uid() then
    raise exception 'You cannot report yourself';
  end if;
  if (select count(*) from reports where reporter_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many reports';
  end if;
  insert into reports (reporter_id, target_profile_id, review_id, reason, details)
  values (auth.uid(), rv.author_id, p_review_id, p_reason, nullif(btrim(p_details), ''))
  on conflict do nothing;
  if (select count(distinct reporter_id) from reports where review_id = p_review_id) >= 3 then
    update track_reviews set hidden_at = now() where id = p_review_id and hidden_at is null;
  end if;
end $$;

-- Écran Signalements : les avis s'ajoutent aux messages et aux photos (type de retour modifié).
drop function if exists public.admin_reports(text);
create function public.admin_reports(p_status text default 'open')
returns table (
  id uuid, reason public.report_reason, details text, status text, created_at timestamptz,
  reporter_id uuid, reporter_username text,
  target_id uuid, target_username text, target_report_count int,
  message_id uuid, message_kind text, message_body text, message_hidden boolean,
  photo_id uuid, photo_path text, photo_hidden boolean,
  review_id uuid, review_comment text, review_track text, review_hidden boolean
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
           rv.id, rv.comment, rt.name, rv.hidden_at is not null
      from reports r
      left join profiles rp on rp.id = r.reporter_id
      left join profiles tp on tp.id = r.target_profile_id
      left join messages m on m.id = r.message_id
      left join track_photos ph on ph.id = r.photo_id
      left join track_reviews rv on rv.id = r.review_id
      left join tracks rt on rt.id = rv.track_id
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
  if p_hide is not null and r.message_id is not null then
    update messages set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.message_id;
  end if;
  if p_hide is not null and r.photo_id is not null then
    update track_photos set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.photo_id;
  end if;
  if p_hide is not null and r.review_id is not null then
    update track_reviews set hidden_at = case when p_hide then coalesce(hidden_at, now()) end where id = r.review_id;
  end if;
end $$;

revoke execute on function
  public.save_track_review(uuid, int, int, int, int, text), public.track_ratings(),
  public.report_track_review(uuid, public.report_reason, text), public.admin_reports(text)
from public, anon;
grant execute on function
  public.save_track_review(uuid, int, int, int, int, text), public.track_ratings(),
  public.report_track_review(uuid, public.report_reason, text), public.admin_reports(text)
to authenticated;
