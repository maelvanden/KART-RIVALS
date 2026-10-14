-- Kart Rivals : diffusion temps réel des défis et des matchs (les règles RLS s'appliquent aussi
-- au temps réel : chaque pilote ne reçoit que les changements des défis auxquels il participe).
alter publication supabase_realtime add table public.challenges, public.matches;
