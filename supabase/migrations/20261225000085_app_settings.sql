-- Kart Rivals : réglages de l'appli pilotés à distance par les admins appli (sans mise à jour de l'appli).
--   - Time Attack : mise en pause (lecture des tickets en panne…), avec un message pour les pilotes. En pause, plus
--     aucun check-in n'est accepté par le serveur ; les sessions déjà en cours se terminent normalement.
--   - Maintenance : l'appli affiche un écran d'attente aux pilotes connectés (les admins appli passent).
--   - Version minimale : en dessous, l'appli demande la mise à jour depuis la boutique (liens App Store et
--     Google Play réglables ici).
-- Une seule ligne, lisible par tous (l'appli la lit dès l'ouverture), modifiée uniquement par admin_update_app_settings.

create table public.app_settings (
  id                  boolean primary key default true check (id),
  time_attack_enabled boolean not null default true,
  time_attack_message text check (char_length(time_attack_message) <= 200),
  maintenance         boolean not null default false,
  maintenance_message text check (char_length(maintenance_message) <= 300),
  min_version         text check (min_version ~ '^[0-9]+(\.[0-9]+){0,2}$'),
  ios_store_url       text check (ios_store_url ~ '^https://'),
  android_store_url   text check (android_store_url ~ '^https://'),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles (id) on delete set null
);
insert into public.app_settings default values;

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select (id, time_attack_enabled, time_attack_message, maintenance, maintenance_message, min_version,
              ios_store_url, android_store_url, updated_at)
  on public.app_settings to anon, authenticated;
create policy "everyone reads app settings" on public.app_settings for select to anon, authenticated using (true);

-- Seules les clés présentes dans p_changes sont modifiées ; une chaîne vide efface un message, un lien ou la version.
create or replace function public.admin_update_app_settings(p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o app_settings;
  n app_settings;
  v_diff jsonb := '{}'::jsonb;
  k text;
begin
  perform public.require_app_admin();
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Invalid settings';
  end if;
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('time_attack_enabled', 'time_attack_message', 'maintenance', 'maintenance_message', 'min_version',
                 'ios_store_url', 'android_store_url') then
      raise exception 'Invalid settings';
    end if;
  end loop;
  if (p_changes ? 'time_attack_enabled' and jsonb_typeof(p_changes->'time_attack_enabled') <> 'boolean')
     or (p_changes ? 'maintenance' and jsonb_typeof(p_changes->'maintenance') <> 'boolean') then
    raise exception 'Invalid settings';
  end if;

  select * into o from app_settings for update;
  n := o;
  if p_changes ? 'time_attack_enabled' then
    n.time_attack_enabled := (p_changes->>'time_attack_enabled')::boolean;
  end if;
  if p_changes ? 'maintenance' then
    n.maintenance := (p_changes->>'maintenance')::boolean;
  end if;
  if p_changes ? 'time_attack_message' then
    n.time_attack_message := nullif(btrim(coalesce(p_changes->>'time_attack_message', '')), '');
  end if;
  if p_changes ? 'maintenance_message' then
    n.maintenance_message := nullif(btrim(coalesce(p_changes->>'maintenance_message', '')), '');
  end if;
  if p_changes ? 'min_version' then
    n.min_version := nullif(btrim(coalesce(p_changes->>'min_version', '')), '');
  end if;
  if p_changes ? 'ios_store_url' then
    n.ios_store_url := nullif(btrim(coalesce(p_changes->>'ios_store_url', '')), '');
  end if;
  if p_changes ? 'android_store_url' then
    n.android_store_url := nullif(btrim(coalesce(p_changes->>'android_store_url', '')), '');
  end if;

  if char_length(n.time_attack_message) > 200 or char_length(n.maintenance_message) > 300 then
    raise exception 'Settings message too long';
  end if;
  if n.min_version !~ '^[0-9]+(\.[0-9]+){0,2}$' then
    raise exception 'Invalid version number';
  end if;
  if n.ios_store_url !~ '^https://' or n.android_store_url !~ '^https://' then
    raise exception 'Store link must start with https://';
  end if;

  -- Journal : uniquement ce qui change vraiment, avec l'ancienne et la nouvelle valeur.
  select coalesce(jsonb_object_agg(a.key, jsonb_build_object('before', b.value, 'after', a.value)), '{}'::jsonb)
    into v_diff
    from jsonb_each(to_jsonb(n) - 'updated_at' - 'updated_by') a
    join jsonb_each(to_jsonb(o) - 'updated_at' - 'updated_by') b on b.key = a.key
   where a.value is distinct from b.value;
  if v_diff = '{}'::jsonb then
    return to_jsonb(o) - 'updated_by';
  end if;

  update app_settings
     set time_attack_enabled = n.time_attack_enabled, time_attack_message = n.time_attack_message,
         maintenance = n.maintenance, maintenance_message = n.maintenance_message, min_version = n.min_version,
         ios_store_url = n.ios_store_url, android_store_url = n.android_store_url,
         updated_at = now(), updated_by = auth.uid()
   where id
  returning * into n;
  insert into admin_actions (action, details) values ('app_settings', jsonb_build_object('changes', v_diff));
  return to_jsonb(n) - 'updated_by';
end $$;

revoke execute on function public.admin_update_app_settings(jsonb) from public, anon;
grant execute on function public.admin_update_app_settings(jsonb) to authenticated;

-- Time Attack en pause : aucun nouveau check-in, même depuis une appli pas encore à jour.
create or replace function public.reject_paused_time_attack()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select time_attack_enabled from app_settings), true) then
    raise exception 'Time Attack is paused';
  end if;
  return new;
end $$;
revoke execute on function public.reject_paused_time_attack() from public, anon, authenticated;

create trigger time_attack_sessions_reject_paused before insert on public.time_attack_sessions
  for each row execute function public.reject_paused_time_attack();
