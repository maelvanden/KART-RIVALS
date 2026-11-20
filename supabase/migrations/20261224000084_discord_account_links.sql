-- Account ownership is proven by a one-use code generated in the authenticated app.
create table public.discord_account_links (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  discord_id text not null unique check (discord_id ~ '^[0-9]{17,20}$'),
  linked_at timestamptz not null default now()
);
create table public.discord_link_codes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table public.discord_link_attempts (
  discord_id text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.discord_account_links enable row level security;
alter table public.discord_link_codes enable row level security;
alter table public.discord_link_attempts enable row level security;
revoke all on public.discord_account_links, public.discord_link_codes, public.discord_link_attempts from public, anon, authenticated;

create function public.my_discord_link() returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('discord_id',l.discord_id,'linked_at',l.linked_at)
    from public.discord_account_links l where l.profile_id = auth.uid()), '{}'::jsonb);
$$;

create function public.create_discord_link_code() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); c text; expiry timestamptz := now() + interval '10 minutes';
begin
  if u is null or not exists(select 1 from public.profiles where id=u and banned_at is null and not is_demo) then
    raise exception 'Connecte-toi à ton compte Kart Rivals.';
  end if;
  perform pg_advisory_xact_lock(84712084);
  if exists(select 1 from public.discord_account_links where profile_id=u) then
    raise exception 'Dissocie ton compte Discord actuel avant de le remplacer.';
  end if;
  if exists(select 1 from public.discord_link_codes where profile_id=u and created_at>now()-interval '30 seconds') then
    raise exception 'Patiente 30 secondes avant de générer un nouveau code.';
  end if;
  c := upper(replace(gen_random_uuid()::text,'-',''));
  insert into public.discord_link_codes(profile_id,code_hash,created_at,expires_at)
    values(u,encode(sha256(convert_to(c,'UTF8')),'hex'),now(),expiry)
    on conflict(profile_id) do update set code_hash=excluded.code_hash,created_at=excluded.created_at,expires_at=excluded.expires_at;
  return jsonb_build_object('code',c,'expires_at',expiry);
end;
$$;

create function public.unlink_my_discord() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  perform pg_advisory_xact_lock(84712084);
  delete from public.discord_account_links where profile_id=auth.uid();
  delete from public.discord_link_codes where profile_id=auth.uid();
end;
$$;

-- These RPCs may only be called by the key-authenticated bot backend.
create function public.redeem_discord_link(p_discord_id text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; c text := upper(regexp_replace(p_code,'[-[:space:]]','','g')); n integer;
begin
  if p_discord_id is null or p_discord_id !~ '^[0-9]{17,20}$' then return jsonb_build_object('status','invalid'); end if;
  perform pg_advisory_xact_lock(84712084);
  delete from public.discord_link_attempts where window_start < now()-interval '1 day';
  insert into public.discord_link_attempts values(p_discord_id,now(),1)
    on conflict(discord_id) do update set
      attempts=case when discord_link_attempts.window_start < now()-interval '15 minutes' then 1 else discord_link_attempts.attempts+1 end,
      window_start=case when discord_link_attempts.window_start < now()-interval '15 minutes' then now() else discord_link_attempts.window_start end
    returning attempts into n;
  if n>5 then return jsonb_build_object('status','limited'); end if;
  if c is null or c !~ '^[A-F0-9]{32}$' then return jsonb_build_object('status','invalid'); end if;
  if exists(select 1 from public.discord_account_links where discord_id=p_discord_id) then return jsonb_build_object('status','already_linked'); end if;
  select profile_id into u from public.discord_link_codes
    where code_hash=encode(sha256(convert_to(c,'UTF8')),'hex') and expires_at>now();
  if u is null or not exists(select 1 from public.profiles where id=u and banned_at is null and not is_demo) then
    return jsonb_build_object('status','invalid');
  end if;
  if exists(select 1 from public.discord_account_links where profile_id=u) then return jsonb_build_object('status','invalid'); end if;
  insert into public.discord_account_links(profile_id,discord_id) values(u,p_discord_id);
  delete from public.discord_link_codes where profile_id=u;
  return jsonb_build_object('status','linked');
end;
$$;

create function public.discord_linked_profile(p_discord_id text) returns jsonb
language sql security definer set search_path = '' as $$
 select coalesce((select jsonb_build_object('profile_id',l.profile_id) from public.discord_account_links l
 join public.profiles p on p.id=l.profile_id where l.discord_id=p_discord_id and p.banned_at is null and not p.is_demo), '{}'::jsonb);
$$;
create function public.unlink_discord_account(p_discord_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
 perform pg_advisory_xact_lock(84712084);
 delete from public.discord_account_links where discord_id=p_discord_id returning profile_id into u;
 delete from public.discord_link_codes where profile_id=u;
 return jsonb_build_object('status','unlinked');
end;
$$;
revoke all on function public.my_discord_link(), public.create_discord_link_code(), public.unlink_my_discord(), public.redeem_discord_link(text,text), public.discord_linked_profile(text), public.unlink_discord_account(text) from public, anon, authenticated;
grant execute on function public.my_discord_link(), public.create_discord_link_code(), public.unlink_my_discord() to authenticated;
grant execute on function public.redeem_discord_link(text,text), public.discord_linked_profile(text), public.unlink_discord_account(text) to service_role;
