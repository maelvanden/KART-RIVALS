-- Kart Rivals : comptes de démonstration pour la vérification Apple (App Review).
--   - apple.review@example.com (« Demo_Pilote ») : le compte donné au vérificateur.
--   - apple.rival@example.com (« Demo_Rival ») : son adversaire, pour tester un défi de bout en bout
--     (défier, accepter, déclarer et confirmer le résultat).
-- Adresses en example.com (domaine réservé, n'appartient à personne), e-mails déjà confirmés.
-- Seule l'empreinte bcrypt des mots de passe figure ici ; les mots de passe sont donnés à Apple dans
-- App Store Connect. Comptes invisibles dans « Pilotes » (on les trouve par leur pseudo).

do $$
declare
  v_track uuid := (select id from public.tracks where lower(name) = 'speedpark angers' limit 1);
  r record;
begin
  for r in
    select * from (values
      ('a99e0001-0000-4000-8000-000000000001'::uuid, 'apple.review@example.com', '$2a$10$cENfZN01OKOvxy8oAhtgGuAeudmBrnE0HdnyGztVgQf5rgQ0.evYW', 'Demo_Pilote', 7::smallint),
      ('a99e0001-0000-4000-8000-000000000002'::uuid, 'apple.rival@example.com', '$2a$10$EFkCgKy5xpOZ8nEIY7qLQ.FeHZ0il0ZfEhj3yvACg3NOW12pVUVTK', 'Demo_Rival', 23::smallint)
    ) v(id, email, hash, username, kart)
  loop
    if not exists (select 1 from auth.users where id = r.id or lower(email) = r.email) then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email, r.hash, now(),
        '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
        '', '', '', ''
      );
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (r.id::text, r.id,
              jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true),
              'email', now(), now(), now());
    end if;
    insert into public.profiles (id, username, home_track_id, kart_number, is_discoverable)
    values (r.id, r.username, v_track, r.kart, false)
    on conflict (id) do nothing;
  end loop;
end $$;
