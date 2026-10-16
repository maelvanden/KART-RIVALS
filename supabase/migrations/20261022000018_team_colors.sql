-- Kart Rivals : couleur d'écurie, choisie par le Team Principal dans une palette lisible sur fond sombre.
-- Elle colore le blason, le tag à côté du pseudo et la carte « Mon Écurie ».

alter table public.teams
  add column color text not null default '#DEFF00'
  check (color in ('#DEFF00', '#FF6B1A', '#FF3B5C', '#FF4FD8', '#9B6BFF', '#3D8BFF', '#22D3EE', '#2EE59D', '#FFC83D', '#F5F7FA'));

-- La vue reprend la couleur (recréée : on ne peut pas ajouter une colonne au milieu d'une vue).
drop view public.team_standings;
create view public.team_standings with (security_invoker = true) as
  select t.id, t.name, t.tag, t.logo_url, t.color, t.created_at,
         count(m.profile_id)::int as member_count,
         coalesce(round(avg(p.elo))::int, 0) as elo,
         rank() over (order by coalesce(avg(p.elo), 0) desc) as position
  from public.teams t
  left join public.team_members m on m.team_id = t.id
  left join public.profiles p on p.id = m.profile_id
  group by t.id;
grant select on public.team_standings to authenticated;

create or replace function public.update_team_color(p_team_id uuid, p_color text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_principal(p_team_id) then
    raise exception 'Only the Team Principal can change the colors';
  end if;
  update teams set color = upper(p_color) where id = p_team_id;
end $$;

revoke execute on function public.update_team_color(uuid, text) from public, anon;
grant execute on function public.update_team_color(uuid, text) to authenticated;

-- Le changement de couleur (ou de blason) se propage en temps réel aux tags affichés.
alter publication supabase_realtime add table public.teams;
