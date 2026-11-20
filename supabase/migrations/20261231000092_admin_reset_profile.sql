-- Kart Rivals : réinitialisation d'un pseudo ou d'une photo de profil inappropriés, par l'équipe.
--   - Pseudo : remplacé par « Pilote » suivi de 6 chiffres, unique. Le pilote le change ensuite comme il veut.
--   - Photo : retirée du profil, et la liste des fichiers du pilote dans le bucket public « avatars » est renvoyée
--     pour que l'Edge Function admin-reset-profile les efface (seule l'API de stockage supprime vraiment un fichier :
--     sans cela, l'image resterait accessible par son adresse publique).
-- Ouvert aux modérateurs, comme le masquage de contenu, mais un modérateur ne touche pas au profil d'un admin appli.
-- Un motif est obligatoire : il est tracé au journal et envoyé au pilote. Appelée avec le jeton de l'équipe par
-- l'Edge Function, jamais directement par l'appli.

create or replace function public.admin_reset_pilot_profile(p_profile uuid, p_what text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p profiles;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 200), '');
  v_name text;
  v_tries int := 0;
  v_files jsonb := '[]'::jsonb;
begin
  perform public.require_app_staff();
  if p_what not in ('username', 'avatar', 'both') then
    raise exception 'Invalid reset';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'A reason is required';
  end if;
  select * into p from profiles where id = p_profile for update;
  if p.id is null then
    raise exception 'Pilot not found';
  end if;
  if exists (select 1 from app_admins where profile_id = p.id) and not public.is_app_admin() then
    raise exception 'Only app admins can edit an app admin profile';
  end if;

  if p_what in ('username', 'both') then
    loop
      v_name := 'Pilote' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from profiles where lower(username) = lower(v_name));
      v_tries := v_tries + 1;
      if v_tries > 20 then
        raise exception 'Could not generate a username';
      end if;
    end loop;
    update profiles set username = v_name where id = p.id;
    insert into admin_actions (action, profile_id, details)
    values ('reset_username', p.id, jsonb_build_object('before', p.username, 'after', v_name, 'reason', v_reason));
  end if;

  if p_what in ('avatar', 'both') then
    update profiles set avatar_url = null where id = p.id;
    select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_files
      from storage.objects o
     where o.bucket_id = 'avatars' and (storage.foldername(o.name))[1] = p.id::text;
    insert into admin_actions (action, profile_id, details)
    values ('reset_avatar', p.id, jsonb_build_object('had_photo', p.avatar_url is not null, 'reason', v_reason));
  end if;

  perform send_push(array[p.id], 'Ton profil a été modifié',
    'L’équipe Kart Rivals a réinitialisé '
      || case p_what when 'username' then 'ton pseudo' when 'avatar' then 'ta photo de profil'
                     else 'ton pseudo et ta photo de profil' end
      || ' : ' || v_reason || '. Tu peux '
      || case p_what when 'username' then 'choisir un nouveau pseudo' when 'avatar' then 'choisir une nouvelle photo'
                     else 'les modifier' end
      || ' depuis ton profil, dans le respect des règles.',
    '/edit-profile');

  return jsonb_build_object('username', v_name, 'avatar_cleared', p_what in ('avatar', 'both'), 'avatar_files', v_files);
end $$;

-- Appelable uniquement avec le jeton d'un membre de l'équipe, via l'Edge Function (qui efface ensuite les fichiers).
revoke execute on function public.admin_reset_pilot_profile(uuid, text, text) from public, anon;
grant execute on function public.admin_reset_pilot_profile(uuid, text, text) to authenticated;
