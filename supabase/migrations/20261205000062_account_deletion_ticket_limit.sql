-- Kart Rivals : suppression de compte (RGPD) et limite de tickets Time Attack.
--   - prepare_account_deletion : appelée par l'Edge Function delete-account juste avant de supprimer l'utilisateur
--     (la suppression de auth.users efface le profil et toutes ses données en cascade). Elle refuse si le pilote est
--     le dernier admin appli (sinon n'importe qui pourrait se déclarer admin), passe ses écuries à un autre membre
--     (ou les supprime s'il était seul) et renvoie ses fichiers à effacer du stockage.
--   - 10 tickets lus au maximum par session Time Attack : au-delà, l'OCR (quota partagé) n'est plus appelé et le
--     pilote passe par la vérification manuelle. L'envoi de photos est plafonné à 12 par session.

-- ========== SUPPRESSION DE COMPTE ==========
create or replace function public.prepare_account_deletion(p_profile uuid)
returns table (bucket text, path text)
language plpgsql security definer set search_path = public, storage as $$
declare
  v_team uuid;
  v_successor uuid;
begin
  if exists (select 1 from app_admins where profile_id = p_profile)
     and (select count(*) from app_admins) = 1 then
    raise exception 'The last app admin cannot delete their account';
  end if;

  -- Écurie dont il est Team Principal : un Directeur Sportif reprend, sinon le plus ancien pilote, sinon elle disparaît.
  select team_id into v_team from team_members where profile_id = p_profile and role = 'team_principal';
  if v_team is not null then
    select profile_id into v_successor
      from team_members
     where team_id = v_team and profile_id <> p_profile
     order by (role = 'directeur_sportif') desc, joined_at
     limit 1;
    if v_successor is null then
      delete from teams where id = v_team;
    else
      delete from team_members where team_id = v_team and profile_id = p_profile;
      update team_members set role = 'team_principal' where team_id = v_team and profile_id = v_successor;
    end if;
  end if;

  -- Fichiers envoyés par le pilote (avatar, tickets, photos, médias de l'Actu, logo d'écurie…).
  return query
    select o.bucket_id::text, o.name::text
      from storage.objects o
     where coalesce(to_jsonb(o) ->> 'owner_id', to_jsonb(o) ->> 'owner') = p_profile::text;
end $$;
revoke execute on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

-- ========== LIMITE DE TICKETS TIME ATTACK ==========
alter table public.time_attack_sessions add column ticket_attempts int not null default 0;

-- Compte une lecture de ticket (avant l'appel OCR) ; renvoie le nombre de lectures de la session.
create or replace function public.register_ticket_attempt(p_session_id uuid, p_pilot_id uuid)
returns int language sql security definer set search_path = public as $$
  update time_attack_sessions set ticket_attempts = ticket_attempts + 1
   where id = p_session_id and pilot_id = p_pilot_id and status = 'on_track'
  returning ticket_attempts;
$$;
revoke execute on function public.register_ticket_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.register_ticket_attempt(uuid, uuid) to service_role;

-- Photos déjà envoyées dans le dossier <pilote>/<session>/ d'un fichier.
create or replace function public.ticket_upload_count(p_name text)
returns int language sql stable security definer set search_path = public, storage as $$
  select count(*)::int from storage.objects
   where bucket_id = 'time-attack-tickets'
     and name like split_part(p_name, '/', 1) || '/' || split_part(p_name, '/', 2) || '/%';
$$;
revoke execute on function public.ticket_upload_count(text) from public, anon;
grant execute on function public.ticket_upload_count(text) to authenticated;

drop policy if exists "pilots upload their own tickets" on storage.objects;
create policy "pilots upload their own tickets" on storage.objects for insert to authenticated
  with check (bucket_id = 'time-attack-tickets'
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.ticket_upload_count(name) < 12);
