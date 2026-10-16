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
2. Le pilote recopie le nom et le meilleur tour imprimés, puis photographie le ticket depuis l'app (appareil photo
   uniquement) → bucket privé `time-attack-tickets` → Edge Function : le texte est lu par OCR (OCR.space, gratuit).
   Contrôles : vrai ticket de chronométrage (≥ 3 temps au tour + vocabulaire du karting), circuit du check-in
   (nom ou ville), nom et temps déclarés présents (sur la même ligne pour une feuille de classement), date et heure
   de session repérées. Un ticket ou une photo ne valide qu'une session, tous pilotes confondus. **L'heure de session du ticket doit être strictement postérieure au check-in**, sinon refus
   (`TICKET_BEFORE_CHECK_IN`). Décision finale sous verrou en SQL (`record_time_attack_ticket`), un ticket ne sert qu'une fois.
3. Sans ticket valide 90 min après le check-in : DNF et −15 ELO (`expire_time_attack_sessions`, pg_cron toutes les 5 min).

Déploiement du backend : la GitHub Action « Déployer Supabase » applique les nouvelles migrations, enregistre
la clé OCR et déploie l'Edge Function à chaque push sur `main` qui touche `supabase/` (ou à la main depuis l'onglet
Actions). Secrets GitHub requis : `SUPABASE_ACCESS_TOKEN` (supabase.com > Account > Access Tokens) et `OCR_SPACE_API_KEY`
(clé gratuite sur ocr.space/ocrapi). Le Time Attack reste masqué dans l'app tant que `TIME_ATTACK_ENABLED`
(`src/features/time-attack/config.ts`) vaut false.

Garage virtuel + boutique (migration `…_user_gear.sql`, écran `src/app/shop.tsx`) :

- **Points** : 200 à l'inscription, puis gagnés en roulant — défi ou course validé +20 (+30 de plus en cas de victoire),
  Time Attack validé +30. Solde `profiles.points`, journal `point_transactions` (alimentés uniquement par des triggers).
- **Catalogue** `gear_items` : 5 slots (casque, combinaison, gants, bottines, protège-côtes), raretés Location / Commun /
  Rare / Épique / Légendaire. Les objets s'achètent en points ou se **gagnent** en atteignant un rang (Argent, Or…).
- **Collection** `user_items` + **équipement porté** `user_gear` (pas de ligne = équipement de location), modifiés
  uniquement par `buy_gear_item()` et `equip_gear_item()`.
- **Visuels** : SVG génériques et fictifs (aucune marque ni logo) dans `assets/gear/`, générés par
  `node scripts/generate-gear-art.mjs` (à relancer après avoir ajouté un objet, en plus de la ligne SQL).

Dimension sociale (migration `…_social.sql`) :

- **Coéquipiers** (`friendships`) : recherche par @pseudo, demande en attente → acceptée / refusée
  (`send_friend_request`, `respond_friend_request`, `remove_friend`) ; défi et radio en un geste depuis la liste.
- **Écuries** (`teams`, `team_members`, `team_invites`, vue `team_standings`) : nom, tag [ABC], blason (bucket
  `team-logos`) ; Team Principal (créateur, recrute et libère) et Pilotes officiels ; 12 pilotes max, une écurie
  par pilote ; ELO d'écurie = moyenne de ses pilotes.
- **Radio Paddock** (`conversations`, `conversation_members`, `messages`) : 1v1 entre coéquipiers
  (`get_direct_conversation`) et canal de chaque écurie, non-lus via `my_conversations`. Temps réel : canal
  Supabase `radio:<conversation>` sur les INSERT de `messages` filtrés par conversation (RLS appliquée).

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

## Design system

Direction « Motorsport / Gaming Premium », tout est centralisé dans [`src/theme/index.ts`](./src/theme/index.ts) :

- **Couleurs** : fond `#161920` (jamais de noir pur), cartes `#212631`, accent Volt `#DEFF00` réservé aux actions
  principales et aux onglets actifs (texte `#161920` dessus), texte `#FFFFFF` / `#8A95A5`, bordures 1px
  `rgba(255, 255, 255, 0.08)`.
- **Typo** : Oswald (condensée, majuscules) pour les titres et les gros chiffres, Inter pour le texte. Le composant
  `Text` choisit la bonne famille à partir de la graisse demandée : utiliser `fontWeight`, jamais `fontFamily` Inter à la main.
- **Formes** : boutons 6 px avec double barre oblique, cartes 12 px, étiquettes 4 px ; pas d'ombres ni de formes ovales.
- **Texture** : fibre de carbone à 3 % sur le fond des écrans (`CarbonBackdrop`, tuile `assets/images/carbon.png`).

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
