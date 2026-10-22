-- Kart Rivals : classements régionaux et départementaux.
--   - Département d'un pilote : celui de son circuit favori, sinon celui du circuit le plus proche de sa position
--     approximative (même règle que les annonces régionales) ; la région s'en déduit.
--   - leaderboard_area : top 100 d'une région ou d'un département (le sien par défaut).
--   - pilot_standings : « 3e des Hauts-de-France, 1er du Nord, 412e en France » pour la licence et le classement.

-- Département et région de chaque pilote non banni (null si ni circuit favori ni position).
create or replace function public.pilot_areas()
returns table (profile_id uuid, department text, region text)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, d.code, dr.region
    from profiles p
    left join tracks ht on ht.id = p.home_track_id
    left join lateral (
      select t.postal_code from tracks t
       where ht.postal_code is null and p.location is not null and t.hidden_at is null and t.postal_code is not null
       order by t.location <-> p.location
       limit 1
    ) nt on true
    cross join lateral (select left(coalesce(ht.postal_code, nt.postal_code), 2) as code) d
    left join department_regions dr on dr.department = d.code
   where p.banned_at is null;
$$;
revoke execute on function public.pilot_areas() from public, anon, authenticated;

-- Top 100 d'une région (p_scope = 'region') ou d'un département ('department'). Sans p_code : celui du pilote connecté.
create or replace function public.leaderboard_area(p_scope text, p_code text default null)
returns table (id uuid, username text, avatar_url text, elo int, rank public.rank_tier, wins int, losses int,
               "position" bigint, area text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_code text := nullif(btrim(p_code), '');
begin
  if p_scope not in ('region', 'department') then
    raise exception 'Unknown leaderboard scope';
  end if;
  if v_code is null then
    select case when p_scope = 'region' then a.region else a.department end into v_code
      from public.pilot_areas() a where a.profile_id = auth.uid();
  end if;
  if v_code is null then
    return;
  end if;
  return query
    select p.id, p.username, p.avatar_url, p.elo, p.rank, p.wins, p.losses,
           rank() over (order by p.elo desc), v_code
      from public.pilot_areas() a
      join profiles p on p.id = a.profile_id
     where p.matches_played > 0
       and case when p_scope = 'region' then a.region else a.department end = v_code
     order by p.elo desc
     limit 100;
end $$;

-- Positions d'un pilote : nationale, régionale, départementale (null tant qu'il n'a pas de match validé).
create or replace function public.pilot_standings(p_profile uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with ranked as (
    select a.profile_id, a.department, a.region, p.matches_played,
           rank() over (order by p.elo desc) as national,
           count(*) over () as national_total,
           rank() over (partition by a.region order by p.elo desc) as in_region,
           count(*) over (partition by a.region) as region_total,
           rank() over (partition by a.department order by p.elo desc) as in_department,
           count(*) over (partition by a.department) as department_total
      from public.pilot_areas() a
      join profiles p on p.id = a.profile_id
     where p.matches_played > 0
  ), me as (
    select a.department, a.region from public.pilot_areas() a where a.profile_id = p_profile
  )
  select jsonb_build_object(
    'department', me.department,
    'region', me.region,
    'national', r.national, 'national_total', r.national_total,
    'region_position', case when r.region is not null then r.in_region end,
    'region_total', case when r.region is not null then r.region_total end,
    'department_position', case when r.department is not null then r.in_department end,
    'department_total', case when r.department is not null then r.department_total end)
    from me
    left join ranked r on r.profile_id = p_profile;
$$;

revoke execute on function public.leaderboard_area(text, text), public.pilot_standings(uuid) from public, anon;
grant execute on function public.leaderboard_area(text, text), public.pilot_standings(uuid) to authenticated;
