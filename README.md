# Kart Rivals

Application mobile iOS / Android pour pilotes de karting amateurs : se trouver, se défier
sur des circuits locaux, valider les résultats à deux et grimper au classement ELO.

## Stack

- Expo (SDK 57) + Expo Router + TypeScript
- Supabase : Auth, PostgreSQL + PostGIS, Realtime, Edge Functions
- TanStack Query, React Hook Form, Zod

## Base de données

Migrations dans [`supabase/migrations`](./supabase/migrations) :

| Fichier | Contenu |
| --- | --- |
| `…_init_schema.sql` | tables `tracks`, `profiles`, `challenges`, `matches`, `elo_history` |
| `…_security.sql` | RLS + droits par colonne (l'ELO n'est jamais modifiable par le client) |
| `…_functions.sql` | RPC : `respond_challenge`, `cancel_challenge`, `submit_match_result`, `dispute_match`, `confirm_match` (moteur ELO), `nearby_pilots`, `leaderboard_near` + vue `leaderboard_global` |

Flux d'un défi :

1. A crée un défi (`insert` dans `challenges`) → B l'accepte / refuse (`respond_challenge`).
2. Après la course, un pilote saisit le résultat (`submit_match_result`) — sa validation est implicite.
3. L'autre confirme (`confirm_match`) → l'ELO des deux est recalculé dans la même transaction,
   ou conteste (`dispute_match`) → le résultat peut être ressaisi.

Mode solo « Time Attack » (migration `…_time_attack.sql` + Edge Function `time-attack-ticket`) :

1. Check-in « Je pars rouler » (`start_time_attack`) : l'heure est celle du serveur ; le pilote a 90 min.
2. Le pilote recopie le nom et le meilleur tour imprimés, puis envoie la photo du ticket → bucket privé
   `time-attack-tickets` → Edge Function : le texte est lu par OCR (OCR.space, gratuit) ; le nom et le temps déclarés
   doivent y figurer (sur la même ligne pour une feuille de classement), la date et l'heure de session sont repérées. **L'heure de session du ticket doit être strictement postérieure au check-in**, sinon refus
   (`TICKET_BEFORE_CHECK_IN`). Décision finale sous verrou en SQL (`record_time_attack_ticket`), un ticket ne sert qu'une fois.
3. Sans ticket valide 90 min après le check-in : DNF et −15 ELO (`expire_time_attack_sessions`, pg_cron toutes les 5 min).

Déploiement du backend : la GitHub Action « Déployer Supabase » applique les nouvelles migrations, enregistre
la clé OCR et déploie l'Edge Function à chaque push sur `main` qui touche `supabase/` (ou à la main depuis l'onglet
Actions). Secrets GitHub requis : `SUPABASE_ACCESS_TOKEN` (supabase.com > Account > Access Tokens) et `OCR_SPACE_API_KEY`
(clé gratuite sur ocr.space/ocrapi). Le Time Attack reste masqué dans l'app tant que `TIME_ATTACK_ENABLED`
(`src/features/time-attack/config.ts`) vaut false.

ELO : départ à 1000, K = 40 pendant les 10 premiers matchs, 24 ensuite, 16 au-delà de 1850.
Rangs : Novice < 1100 ≤ Bronze < 1250 ≤ Argent < 1400 ≤ Or < 1550 ≤ Platine < 1700 ≤ Diamant < 1850 ≤ Légende.

## Démarrer

```bash
npm install
cp .env.example .env              # renseigner l'URL et la clé anon Supabase
npx supabase login
npx supabase link --project-ref <TON_PROJECT_REF>
npx supabase db push              # applique les migrations
npx supabase gen types typescript --linked > src/types/database.types.ts
npx expo start
```

Mode démo (interface avec des données d'exemple, sans compte ni réseau) :

```bash
EXPO_PUBLIC_DEMO_MODE=true npx expo start
# démo qui commence par la création de licence :
EXPO_PUBLIC_DEMO_MODE=true EXPO_PUBLIC_DEMO_ONBOARDING=true npx expo start
```

## Structure

```
src/
  app/            routes Expo Router : (auth) connexion, onboarding, (tabs) Licence / Défis / Pilotes / Classement
  components/     UI partagée (ui/ : Button, Card, Input, Screen, Segmented, Icon…)
  features/       logique par domaine (auth, profile, challenges, nearby, leaderboard) : hooks TanStack Query + composants
  lib/            client Supabase, données de démo
  theme/          couleurs, espacements, rangs
  types/          modèles partagés
```

Les notifications push nécessitent un development build (`npx eas-cli@latest build --profile development`),
elles ne fonctionnent pas dans Expo Go.
