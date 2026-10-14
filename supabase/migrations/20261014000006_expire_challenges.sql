-- Kart Rivals : fermeture automatique des défis restés sans réponse après leur échéance (72 h).
create or replace function public.expire_stale_challenges()
returns int
language sql security definer set search_path = public as $$
  with expired as (
    update challenges
       set status = 'expired'
     where status = 'pending'
       and expires_at < now()
    returning 1
  )
  select count(*)::int from expired;
$$;

-- Réservée au planificateur : ni l'app ni les visiteurs ne l'appellent.
revoke execute on function public.expire_stale_challenges() from public, anon, authenticated;

-- Toutes les 15 minutes (extension pg_cron, disponible sur Supabase).
create extension if not exists pg_cron;
select cron.schedule('expire-stale-challenges', '*/15 * * * *', 'select public.expire_stale_challenges()');
