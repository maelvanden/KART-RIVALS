# API privée du bot Discord Kart Rivals

Le dépôt du bot contient la commande et les instructions d’installation.
Kart Rivals héberge la fonction Supabase `discord-data`.

1. Génère une clé dédiée avec `openssl rand -hex 32`. Configure-la comme secret
   `KART_RIVALS_BOT_KEY` dans les Edge Functions Supabase et dans l’environnement du bot.
2. Déploie la fonction sur le projet Kart Rivals.

   ```sh
   npx supabase functions deploy discord-data --project-ref TON_PROJECT_REF --use-api
   ```

3. Configure l’URL `https://TON_PROJECT_REF.supabase.co/functions/v1/discord-data`
   comme `KART_RIVALS_API_URL` dans l’environnement du bot.

L’API accepte un GET authentifié par `Authorization: Bearer <clé dédiée>`.
`?search=Angers` suggère jusqu’à 25 circuits. `?track=<UUID>` renvoie le circuit
et jusqu’à dix chronos validés, avec uniquement la position, le pseudo et le temps.
