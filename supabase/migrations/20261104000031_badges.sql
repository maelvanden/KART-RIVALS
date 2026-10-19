-- Kart Rivals : badges de confiance.
--   - Pilote vérifié : au moins une session Time Attack validée par un vrai ticket de chronométrage.
--   - Karting officiel : la fiche est gérée par au moins un admin karting (exploitant validé).

-- ========== PILOTE VÉRIFIÉ ==========
create or replace function public.verified_pilots()
returns table (profile_id uuid, validated_sessions int, verified_since timestamptz)
language sql stable security definer set search_path = public as $$
  select pilot_id, count(*)::int, min(coalesce(validated_at, check_in_at))
    from time_attack_sessions
   where status = 'validated'
   group by pilot_id;
$$;
revoke execute on function public.verified_pilots() from public, anon;
grant execute on function public.verified_pilots() to authenticated;

-- ========== KARTING OFFICIEL ==========
alter table public.tracks add column if not exists is_official boolean not null default false;
update public.tracks t set is_official = exists (select 1 from public.track_admins a where a.track_id = t.id);

create or replace function public.sync_track_official()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_track uuid := case when tg_op = 'DELETE' then old.track_id else new.track_id end;
begin
  update tracks set is_official = exists (select 1 from track_admins where track_id = v_track) where id = v_track;
  return null;
end $$;
create trigger track_admins_sync_official after insert or delete on public.track_admins
  for each row execute function public.sync_track_official();
revoke execute on function public.sync_track_official() from public, anon, authenticated;

-- Vue de l'app : is_official ajoutée à la fin.
create or replace view public.tracks_map with (security_invoker = true) as
  select id, name, address, postal_code, city, region, is_indoor, length_m, kart_power, is_verified,
         extensions.st_y(location::extensions.geometry) as lat,
         extensions.st_x(location::extensions.geometry) as lng,
         description, booking_url, website, phone, instagram_url, facebook_url, tiktok_url, youtube_url, layout_url,
         is_official
  from public.tracks;
