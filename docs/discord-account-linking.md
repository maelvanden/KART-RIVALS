# Liaison Discord / Kart Rivals

## Parcours

Dans **Modifier ma licence → Mon compte Discord**, le pilote connecté génère un code privé puis le saisit dans `/lier code` sur le serveur Discord. Le bot déduit l’identité Discord de l’interaction dont la signature est vérifiée. Aucun identifiant de pilote ni identifiant Discord fourni librement par le membre n’est accepté dans cette commande.

Code UUID aléatoire (122 bits), haché SHA-256 en base, durée de vie 10 minutes, une utilisation, rotation à la génération suivante (30 secondes minimum entre deux générations). Cinq tentatives de validation maximum par compte Discord sur 15 minutes. Le code ne figure jamais dans une URL, un log applicatif ou une réponse du bot. Le code en clair est uniquement dans l’état local du composant, pas dans un stockage persistant. L’interface demande de ne pas le partager.

Les RPC d’application utilisent `auth.uid()`, les RPC du bot sont réservées à `service_role`. Tables avec RLS, aucun accès direct aux rôles anon/authenticated. Les mutations sont sérialisées par un verrou transactionnel ; contraintes uniques sur le pilote et Discord. Une liaison existante n’est jamais remplacée implicitement. Suppression du profil : cascade sur la liaison et son code.

La liaison ne change aucune préférence de visibilité. Le bot retrouve l’ID lié puis utilise les routes publiques existantes : un profil privé reste indisponible aux commandes. `/delier` ou la dissociation dans l’application effacent la liaison et tout code restant.

## Déploiement

1. Appliquer `20261224000084_discord_account_links.sql` et déployer `discord-data` (workflow Supabase).
2. Distribuer l’application contenant `DiscordLinkCard` ; le workflow Expo main ne remplace pas automatiquement une version native sur un autre canal.
3. Redéployer KART-RIVALS-DISCORD pour enregistrer `/lier`, `/delier` et les options `pilote` facultatives.

## Validation

- `node --test supabase/functions/discord-data/test/api.test.mjs`
- `npm run lint` et `./node_modules/.bin/tsc --noEmit`
- SQL : installer `@electric-sql/pglite` dans un répertoire temporaire puis exécuter `scripts/test-discord-links.mjs` avec `PGLITE_MODULE` pointant vers son fichier `dist/index.js`. Vérifie les droits, identité, expiration, rotation, code réutilisé, dissociation et limitation des tentatives sans connexion à la production.
- Sur Discord, vérifier `/lier`, `/profil` sans pilote, la substitution explicite d’un autre pilote et `/delier`, avec un compte de test dont on est propriétaire.
