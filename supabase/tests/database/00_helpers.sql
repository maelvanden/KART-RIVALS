-- Outils partagés par les tests pgTAP (lancés par `supabase test db`).
-- Les fichiers sont lancés par ordre alphabétique : celui-ci passe en premier et installe (commit) le schéma
-- `tests`, sur la base locale de test uniquement. Chaque test travaille ensuite dans une transaction annulée.
--
--   tests.pilot('alice')              crée un compte (auth.users + profiles) et renvoie son id
--   tests.pilot('bob', 1850, 10)      … avec un ELO et un nombre de victoires
--   tests.id('alice')                 id d'un pilote créé par tests.pilot
--   tests.login('alice')              l'appelant devient ce pilote pour auth.uid()
--                                     (à suivre de `set local role authenticated;`)
--   tests.logout()                    plus personne de connecté (à précéder de `reset role;`)

begin;
create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

create or replace function tests.pilot(p_username text, p_elo int default 1000, p_wins int default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_username || '@test.kart-rivals.local', now(), now());
  insert into profiles (id, username, elo, wins) values (v_id, p_username, p_elo, p_wins);
  return v_id;
end $$;

create or replace function tests.id(p_username text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from profiles where username = p_username;
$$;

create or replace function tests.login(p_username text)
returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', tests.id(p_username), 'role', 'authenticated')::text, true);
$$;

create or replace function tests.logout()
returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;

-- Un circuit quelconque (les migrations en installent plusieurs centaines).
create or replace function tests.track()
returns uuid language sql stable security definer set search_path = public as $$
  select id from tracks where hidden_at is null order by name limit 1;
$$;

grant execute on all functions in schema tests to authenticated, anon;

select plan(1);
select has_function('tests', 'pilot', array['text', 'integer', 'integer'], 'outils de test installés');
select * from finish();
commit;
