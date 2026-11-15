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

## Profils, classement, circuits et comparaison

Les nouvelles routes utilisent la même clé serveur :

- `?action=pilots&search=mael` : jusqu’à 25 pseudos publics pour l’autocomplétion.
- `?action=profil&pilot=<UUID>` : statistiques du pilote et jusqu’à 5 records personnels.
- `?action=classement` : top 10 Elo des profils publics avec au moins un match, ex æquo conservés.
- `?action=circuit&track=<UUID>` : informations publiques du circuit et chronos validés.
- `?action=comparaison&pilot=<UUID>&opponent=<UUID>&track=<UUID>` : meilleur chrono de chacun sur le circuit sélectionné, même hors du top 10. Un chrono absent est `null`.

Les routes pilotes filtrent `is_discoverable=true`, `is_demo=false` et `banned_at is null`,
y compris lorsqu’un identifiant est fourni directement. Seules les colonnes nécessaires
sont sélectionnées : aucun email, token, emplacement de pilote ni donnée de modération
n’est renvoyé. Aucune nouvelle migration SQL n’est nécessaire : les records personnels
utilisent la fonction existante `pilot_lap_records`.

Tests de contrat (Node.js 24+) :
`node --test supabase/functions/discord-data/test/api.test.mjs`.

## Commandes complémentaires

La migration `20261223000083_discord_commands.sql` ajoute `discord_recent_laps()` et
`discord_next_rival(uuid, uuid)`, réservées à `service_role`. Elles lisent les sources
validées existantes et excluent les profils privés, bannis et de démonstration.

L’API authentifiée accepte aussi :
- `action=mesrecords&pilot=<uuid>&page=1` : 10 circuits par page et `has_more`.
- `action=rival&pilot=<uuid>&track=<uuid>` : meilleur temps personnel et prochain chrono strictement meilleur public.
- `action=dernierschronos` : 10 chronos publics triés par validation décroissante.
- `action=circuits&city=<ville>&page=1` : recherche partielle de ville, 10 résultats et `has_more`.

Les pages sont bornées à 1–10000. `/aide` est rendu localement par le bot, sans requête API.
