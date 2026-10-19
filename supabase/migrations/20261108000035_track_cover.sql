-- Kart Rivals : photo principale (couverture) en haut de la fiche circuit, choisie par les admins du karting.
-- Envoyée dans le bucket public track-layouts sous <circuit>/ (mêmes droits que le tracé).

alter table public.tracks add column if not exists cover_url text check (cover_url ~ '^https://');

create or replace view public.tracks_map with (security_invoker = true) as
  select id, name, address, postal_code, city, region, is_indoor, length_m, kart_power, is_verified,
         extensions.st_y(location::extensions.geometry) as lat,
         extensions.st_x(location::extensions.geometry) as lng,
         description, booking_url, website, phone, instagram_url, facebook_url, tiktok_url, youtube_url, layout_url,
         is_official, cover_url
  from public.tracks;

create or replace function public.update_track_page(p_track_id uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_lat double precision;
  v_lng double precision;
begin
  if not public.is_track_manager(p_track_id) then
    raise exception 'Only the track admins can edit this page';
  end if;

  update tracks set
    name          = case when p_data ? 'name' then coalesce(nullif(btrim(p_data->>'name'), ''), name) else name end,
    address       = case when p_data ? 'address' then nullif(btrim(p_data->>'address'), '') else address end,
    postal_code   = case when p_data ? 'postal_code' then nullif(btrim(p_data->>'postal_code'), '') else postal_code end,
    city          = case when p_data ? 'city' then coalesce(nullif(btrim(p_data->>'city'), ''), city) else city end,
    length_m      = case when p_data ? 'length_m' then nullif(p_data->>'length_m', '')::int else length_m end,
    kart_power    = case when p_data ? 'kart_power' then nullif(btrim(p_data->>'kart_power'), '') else kart_power end,
    is_indoor     = case when p_data ? 'is_indoor' then (p_data->>'is_indoor')::boolean else is_indoor end,
    description   = case when p_data ? 'description' then nullif(btrim(p_data->>'description'), '') else description end,
    booking_url   = case when p_data ? 'booking_url' then nullif(btrim(p_data->>'booking_url'), '') else booking_url end,
    website       = case when p_data ? 'website' then nullif(btrim(p_data->>'website'), '') else website end,
    phone         = case when p_data ? 'phone' then nullif(btrim(p_data->>'phone'), '') else phone end,
    instagram_url = case when p_data ? 'instagram_url' then nullif(btrim(p_data->>'instagram_url'), '') else instagram_url end,
    facebook_url  = case when p_data ? 'facebook_url' then nullif(btrim(p_data->>'facebook_url'), '') else facebook_url end,
    tiktok_url    = case when p_data ? 'tiktok_url' then nullif(btrim(p_data->>'tiktok_url'), '') else tiktok_url end,
    youtube_url   = case when p_data ? 'youtube_url' then nullif(btrim(p_data->>'youtube_url'), '') else youtube_url end,
    layout_url    = case when p_data ? 'layout_url' then nullif(btrim(p_data->>'layout_url'), '') else layout_url end,
    cover_url     = case when p_data ? 'cover_url' then nullif(btrim(p_data->>'cover_url'), '') else cover_url end
  where id = p_track_id;

  if p_data ? 'lat' and p_data ? 'lng' then
    v_lat := (p_data->>'lat')::double precision;
    v_lng := (p_data->>'lng')::double precision;
    if v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      raise exception 'Invalid coordinates';
    end if;
    update tracks set location = st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography where id = p_track_id;
  end if;
end $$;
