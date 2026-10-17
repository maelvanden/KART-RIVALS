-- Kart Rivals : fiches circuit complètes.
--   - Infos pratiques : présentation, réservation / billetterie, site, téléphone, réseaux sociaux, tracé.
--     Renseignées par l'équipe depuis le tableau de bord Supabase (Table Editor > tracks), pas par les pilotes.
--   - Photos du circuit postées par les pilotes (bucket public track-photos), masquées après 3 signalements.

-- ========== INFOS PRATIQUES ==========
alter table public.tracks
  add column if not exists description   text check (char_length(description) <= 600),
  add column if not exists booking_url   text check (booking_url ~ '^https://'),
  add column if not exists phone         text check (char_length(phone) <= 30),
  add column if not exists instagram_url text check (instagram_url ~ '^https://'),
  add column if not exists facebook_url  text check (facebook_url ~ '^https://'),
  add column if not exists tiktok_url    text check (tiktok_url ~ '^https://'),
  add column if not exists youtube_url   text check (youtube_url ~ '^https://'),
  -- Image du tracé hébergée ailleurs (les tracés fournis avec l'app sont embarqués dans assets/tracks).
  add column if not exists layout_url    text check (layout_url ~ '^https://');

-- Vue de l'app : les nouvelles colonnes sont ajoutées à la fin (create or replace view l'exige).
create or replace view public.tracks_map with (security_invoker = true) as
  select id, name, address, postal_code, city, region, is_indoor, length_m, kart_power, is_verified,
         extensions.st_y(location::extensions.geometry) as lat,
         extensions.st_x(location::extensions.geometry) as lng,
         description, booking_url, website, phone, instagram_url, facebook_url, tiktok_url, youtube_url, layout_url
  from public.tracks;

update public.tracks set
  description = 'La plus grande piste indoor des Pays de la Loire : 600 m de virages serrés sur deux niveaux d''épingles, '
             || 'ouverte depuis 1996. Séries adultes de 10 min (dès 14 ans) et séries enfants de 6 min (dès 7 ans, 1,25 m). '
             || 'Casque et charlotte prêtés ; présente-toi à l''accueil 30 min avant ta première série.',
  booking_url = 'https://www.inwallkart.com/reservations-en-ligne/',
  website = 'https://www.inwallkart.com/',
  phone = '02 41 44 94 94'
where lower(name) = 'inwall kart' and lower(city) = 'les ponts-de-cé';

-- ========== PHOTOS DES PILOTES ==========
create table public.track_photos (
  id         uuid primary key default gen_random_uuid(),
  track_id   uuid not null references public.tracks (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  path       text not null unique,
  width      int check (width > 0),
  height     int check (height > 0),
  caption    text check (char_length(caption) <= 140),
  hidden_at  timestamptz,
  created_at timestamptz not null default now()
);
create index track_photos_track_idx on public.track_photos (track_id, created_at desc);

alter table public.track_photos enable row level security;
revoke all on public.track_photos from anon, authenticated;
grant select, delete on public.track_photos to authenticated;
grant insert (track_id, path, width, height, caption) on public.track_photos to authenticated;

create policy "pilots see visible track photos" on public.track_photos
  for select to authenticated using (hidden_at is null or author_id = auth.uid());
-- Le fichier doit être rangé sous <circuit>/<auteur>/ dans le bucket.
create policy "pilots post their track photos" on public.track_photos
  for insert to authenticated
  with check (author_id = auth.uid() and path like track_id::text || '/' || auth.uid()::text || '/%');
create policy "pilots delete their track photos" on public.track_photos
  for delete to authenticated using (author_id = auth.uid());

-- 10 photos par jour et par pilote, 200 photos visibles max par circuit.
create or replace function public.limit_track_photos()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from track_photos where author_id = new.author_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many photos today';
  end if;
  if (select count(*) from track_photos where track_id = new.track_id and hidden_at is null) >= 200 then
    raise exception 'Track gallery is full';
  end if;
  return new;
end $$;
create trigger track_photos_limit before insert on public.track_photos
  for each row execute function public.limit_track_photos();
revoke execute on function public.limit_track_photos() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('track-photos', 'track-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "pilots upload track photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'track-photos' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "pilots delete their track photo files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'track-photos' and (storage.foldername(name))[2] = auth.uid()::text);

-- ========== SIGNALEMENT D'UNE PHOTO ==========
alter table public.reports add column if not exists photo_id uuid references public.track_photos (id) on delete set null;
drop index if exists public.reports_once;
create unique index reports_once on public.reports
  (reporter_id, target_profile_id,
   coalesce(message_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(photo_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'open';

create or replace function public.report_track_photo(p_photo_id uuid, p_reason public.report_reason, p_details text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  ph track_photos;
begin
  select * into ph from track_photos where id = p_photo_id;
  if ph.id is null then
    raise exception 'Photo not found';
  end if;
  if ph.author_id = auth.uid() then
    raise exception 'You cannot report yourself';
  end if;
  if (select count(*) from reports where reporter_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many reports';
  end if;

  insert into reports (reporter_id, target_profile_id, photo_id, reason, details)
  values (auth.uid(), ph.author_id, p_photo_id, p_reason, nullif(btrim(p_details), ''))
  on conflict do nothing;

  -- Masquée pour tous dès 3 signalements de pilotes différents.
  if (select count(distinct reporter_id) from reports where photo_id = p_photo_id) >= 3 then
    update track_photos set hidden_at = now() where id = p_photo_id and hidden_at is null;
  end if;
end $$;

revoke execute on function public.report_track_photo(uuid, public.report_reason, text) from public, anon;
grant execute on function public.report_track_photo(uuid, public.report_reason, text) to authenticated;
