# Bot Discord Kart Rivals

La commande `/records` affiche les dix meilleurs tours des matchs au chrono validés,
comme l’écran du circuit dans Kart Rivals. Recherche un circuit par nom ou par ville.
Les résultats sont visibles uniquement par la personne qui lance la commande dans le salon de test.

## Installation

1. Dans le [portail développeur Discord](https://discord.com/developers/applications),
   crée une application **Kart Rivals** et relève son **Application ID** et sa **Public Key**.
   Dans **Installation**, active **Guild Install**, ajoute le scope `applications.commands`
   et le scope `bot`, puis utilise le lien d’installation sur ton serveur de test.
2. Crée un salon texte privé. Active le mode développeur de Discord et copie l’ID du
   serveur et l’ID du salon. Utilise ces valeurs dans les secrets des Edge Functions
   du projet Supabase de Kart Rivals.

   | Secret | Valeur |
   | --- | --- |
   | `DISCORD_PUBLIC_KEY` | Public Key de l’application Discord |
   | `DISCORD_GUILD_ID` | ID du serveur Discord |
   | `DISCORD_TEST_CHANNEL_ID` | ID du salon privé |

3. Depuis la racine du dépôt, avec la CLI Supabase authentifiée, déploie la fonction
   sur le projet Kart Rivals.

   ```sh
   npx supabase functions deploy discord-records --project-ref TON_PROJECT_REF --use-api
   ```

   Dans **General Information** sur Discord, renseigne **Interactions Endpoint URL**
   avec `https://TON_PROJECT_REF.supabase.co/functions/v1/discord-records`. Discord
   vérifie cette URL à l’enregistrement. La fonction utilise la signature Discord et
   récupère les données via l’accès serveur injecté par Supabase.

4. Génère le jeton du bot dans l’onglet **Bot** de Discord. Dans un fichier local
   ignoré par Git (par exemple `.env.local`), renseigne
   `DISCORD_APPLICATION_ID`, `DISCORD_GUILD_ID` et `DISCORD_BOT_TOKEN`.
   Sur Node 22 ou plus récent, enregistre la commande avec

   ```sh
   node --env-file=.env.local scripts/register-discord-records.mjs
   ```

   Le jeton sert à cette étape. Il reste dans ton environnement local.

5. Dans le salon privé, lance `/records`, choisis un circuit dans les suggestions
   et compare les chronos à l’onglet des records du même circuit dans l’app.
   Essaie aussi depuis un autre salon pour vérifier le contrôle d’accès.
