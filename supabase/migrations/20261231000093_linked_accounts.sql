-- Kart Rivals : comptes probablement liés (même appareil), pour repérer un pilote banni qui revient avec un autre compte.
--   - L'appli génère un identifiant aléatoire au premier lancement (stocké dans le trousseau sécurisé du téléphone, sans
--     aucun lien avec le matériel, la publicité ou le numéro de série) et l'enregistre à chaque ouverture avec
--     register_device. Un téléphone qui sert à plusieurs comptes les relie.
--   - admin_linked_accounts : sur la fiche d'un pilote, les autres comptes qui ont servi sur le même appareil. Réservé
--     aux admins appli : c'est un indice pour décider d'une sanction, jamais une preuve (un téléphone partagé en famille
--     ou prêté lie aussi des comptes), et jamais une sanction automatique.
--   - Quand un compte banni et un autre compte se retrouvent sur un même appareil, les admins appli reçoivent une
--     notification (une par paire de comptes).
--   - Conservation : une liaison non revue depuis 12 mois est effacée, sauf si l'un des comptes est banni (c'est
--     justement ce qu'on veut retrouver). La suppression d'un compte efface ses liaisons.
-- Les identifiants d'appareil ne sont jamais renvoyés à l'appli : seuls des comptes et des comptes de liaisons sortent.

create table public.profile_devices (
  device_id     text not null check (device_id ~ '^[0-9a-f-]{32,40}$'),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  platform      text not null check (platform in ('ios', 'android')),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (device_id, profile_id)
);
create index profile_devices_profile_idx on public.profile_devices (profile_id);
alter table public.profile_devices enable row level security;
revoke all on public.profile_devices from anon, authenticated;

-- Appelée à chaque ouverture de l'appli par un pilote connecté, y compris sanctionné. N'écrit qu'une fois par heure.
create or replace function public.register_device(p_device text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_new boolean;
  v_me profiles;
  r record;
  v_key text;
  v_banned text;
  v_other text;
  v_other_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_device !~ '^[0-9a-f-]{32,40}$' or p_platform not in ('ios', 'android') then
    raise exception 'Invalid device';
  end if;

  insert into profile_devices (device_id, profile_id, platform) values (p_device, auth.uid(), p_platform)
  on conflict (device_id, profile_id) do update set last_seen_at = now(), platform = excluded.platform
    where profile_devices.last_seen_at < now() - interval '1 hour'
  returning (xmax = 0) into v_new;

  if not coalesce(v_new, false) then
    return;
  end if;

  -- Nouvelle liaison : un compte banni et un autre compte sur le même appareil, on prévient les admins (une fois par paire).
  begin
    select * into v_me from profiles where id = auth.uid();
    for r in
      select o.id, o.username, o.banned_at
        from profile_devices d join profiles o on o.id = d.profile_id
       where d.device_id = p_device and d.profile_id <> auth.uid()
         and (o.banned_at is not null) <> (v_me.banned_at is not null)
    loop
      v_key := 'device:' || least(auth.uid(), r.id) || ':' || greatest(auth.uid(), r.id);
      insert into team_alert_log (key) values (v_key) on conflict do nothing;
      if found then
        v_banned := case when v_me.banned_at is not null then v_me.username else r.username end;
        v_other := case when v_me.banned_at is not null then r.username else v_me.username end;
        v_other_id := case when v_me.banned_at is not null then r.id else v_me.id end;
        perform send_push(array(select public.team_alert_targets('admin')), '🔗 Compte lié à un banni',
          v_other || ' utilise le même appareil que ' || v_banned || ' (banni). À vérifier : un téléphone partagé n’est pas forcément la même personne.',
          '/admin/pilot/' || v_other_id);
      end if;
    end loop;
  exception when others then
    -- Une alerte ne doit jamais empêcher d'ouvrir l'appli.
    raise warning 'register_device alert: %', sqlerrm;
  end;
end $$;

revoke execute on function public.register_device(text, text) from public, anon;
grant execute on function public.register_device(text, text) to authenticated;

-- Autres comptes ayant servi sur un appareil de ce pilote : bannis d'abord, puis les plus récents.
create or replace function public.admin_linked_accounts(p_profile uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_app_admin();
  return jsonb_build_object(
    'devices', (select count(*)::int from profile_devices where profile_id = p_profile),
    'accounts', coalesce((
      select jsonb_agg(x.j order by x.banned desc, x.last_seen desc)
        from (
          select (o.banned_at is not null) as banned, max(t.last_seen_at) as last_seen,
                 jsonb_build_object(
                   'id', o.id, 'username', o.username, 'avatar_url', o.avatar_url, 'rank', o.rank,
                   'created_at', o.created_at, 'banned_at', o.banned_at,
                   'suspended_until', case when o.suspended_until > now() then o.suspended_until end,
                   'is_admin', exists (select 1 from app_admins a where a.profile_id = o.id),
                   'shared_devices', count(*)::int,
                   'first_seen', min(t.first_seen_at), 'last_seen', max(t.last_seen_at)) as j
            from profile_devices m
            join profile_devices t on t.device_id = m.device_id and t.profile_id <> m.profile_id
            join profiles o on o.id = t.profile_id
           where m.profile_id = p_profile
           group by o.id
           order by (o.banned_at is not null) desc, max(t.last_seen_at) desc
           limit 20
        ) x), '[]'::jsonb));
end $$;

revoke execute on function public.admin_linked_accounts(uuid) from public, anon;
grant execute on function public.admin_linked_accounts(uuid) to authenticated;

-- Conservation : 12 mois, sauf pour les comptes bannis.
create or replace function public.purge_old_devices()
returns void language sql security definer set search_path = public as $$
  delete from profile_devices d
   where d.last_seen_at < now() - interval '12 months'
     and not exists (select 1 from profiles p where p.id = d.profile_id and p.banned_at is not null);
$$;
revoke execute on function public.purge_old_devices() from public, anon, authenticated;

select cron.schedule('purge-old-devices', '0 4 1 * *', 'select public.purge_old_devices()');
