import type {
  Challenge,
  EloPoint,
  LeaderboardEntry,
  NearbyPilot,
  PilotLapRecord,
  PilotMatch,
  Profile,
  Race,
  Track,
  TrackDetails,
  TrackLapRecord,
  TrackRecord,
} from '@/types/models';
import type { Garage, GearItem } from '@/features/garage/catalog';
import { rankAtLeast } from '@/theme';

/**
 * Mode démo : `EXPO_PUBLIC_DEMO_MODE=true` court-circuite Supabase et affiche des données
 * d'exemple. Sert à prévisualiser l'interface sans compte ni réseau.
 */
export const isDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';

/** Avec EXPO_PUBLIC_DEMO_ONBOARDING=true, la démo démarre sans licence (écran de création). */
export const demoState = { hasProfile: process.env.EXPO_PUBLIC_DEMO_ONBOARDING !== 'true' };

export const demoProfile: Profile = {
  id: 'demo-me',
  username: 'Mael_44',
  avatar_url: null,
  kart_number: 44,
  home_track_id: 't1',
  elo: 1286,
  rank: 'argent',
  wins: 14,
  losses: 9,
  draws: 1,
  matches_played: 24,
  race_count: 3,
  race_wins: 1,
  race_podiums: 2,
  is_discoverable: true,
  home_track: { id: 't1', name: 'SpeedPark Angers', city: 'Beaucouzé' },
};

const pilot = (id: string, username: string, elo: number, rank: Profile['rank']) => ({ id, username, elo, rank });

/** Les circuits réels de la migration 20261015000007_tracks_49.sql. */
export const demoTrackDetails: TrackDetails[] = [
  { id: 't1', is_official: true, name: 'SpeedPark Angers', city: 'Beaucouzé', address: 'Centre commercial L’Atoll, Ecoparc du Buisson', postal_code: '49070', region: 'Maine-et-Loire', is_indoor: true, length_m: 230, kart_power: '270cc', is_verified: true, lat: 47.4846, lng: -0.628,
    description: 'Piste indoor de 230 m signée 360 Karting (2024) au cœur de L’Atoll, avec une partie en étage et son pont au-dessus de la piste. Sessions adultes dès 15 ans et sessions enfants de 11 à 14 ans (1,40 m minimum), jamais mélangées. Réservation conseillée le soir, le week-end et pendant les vacances ; sinon, sur place selon les places disponibles. Bowling, laser game et bar sur place.',
    booking_url: 'https://speedpark.fr/angers-beaucouze/reservation-angers/', website: 'https://speedpark.fr/angers-beaucouze/karting/', phone: '02 44 51 24 55', instagram_url: 'https://www.instagram.com/speedparkfrance/' },
  { id: 't2', name: 'MK Racing', city: 'Saint-Christophe-du-Bois', address: 'La Malmongère', postal_code: '49280', region: 'Maine-et-Loire', is_indoor: false, length_m: 816, kart_power: '270cc', is_verified: true, lat: 47.0577, lng: -0.9766,
    description: 'Circuit outdoor de 816 m pour 7 m de large dans un décor vallonné, entre Cholet, Nantes et Angers. Ses passages clés : le Run Off, le Pif-Paf, le Cœur et le Virage en aveugle avant la ligne. Réservation conseillée ; par mauvais temps (neige, verglas, orage), appelle avant de venir.',
    website: 'https://www.kartingcholet.fr/', phone: '02 41 63 54 13' },
  { id: 't3', is_official: true, name: 'Inwall Kart', city: 'Les Ponts-de-Cé', address: '17 Rue Joseph Cugnot', postal_code: '49130', region: 'Maine-et-Loire', is_indoor: true, length_m: 600, kart_power: '270cc', is_verified: true, lat: 47.4284, lng: -0.5434,
    description: 'La plus grande piste indoor des Pays de la Loire : 600 m de virages serrés sur deux niveaux d’épingles, ouverte depuis 1996. Séries adultes de 10 min (dès 14 ans) et séries enfants de 6 min (dès 7 ans, 1,25 m). Casque et charlotte prêtés ; présente-toi à l’accueil 30 min avant ta première série.',
    booking_url: 'https://www.inwallkart.com/reservations-en-ligne/', website: 'https://www.inwallkart.com/', phone: '02 41 44 94 94', facebook_url: 'https://www.facebook.com/p/Inwall-Kart-100063520241809/' },
  { id: 't4', name: 'L’Autre Usine', city: 'Cholet', address: '88 rue Bourgneuf', postal_code: '49300', region: 'Maine-et-Loire', is_indoor: true, length_m: 400, kart_power: 'Électrique RTX', is_verified: true, lat: 47.0579, lng: -0.8586 },
  { id: 't5', name: 'Karting de Loudun', city: 'Bournand', address: 'Circuit de la Boule d’Or, RD 147', postal_code: '86120', region: 'Vienne', is_indoor: false, length_m: 1150, kart_power: '270 / 390cc', is_verified: true, lat: 47.0649, lng: 0.0717,
    description: 'Circuit outdoor en pleine nature, au milieu d’un parc boisé, avec deux tracés : 1 150 m et 800 m. Location par sessions de 10 minutes, compétition et entraînement. Fermé de début janvier à début février ; les horaires changent selon les vacances scolaires, appelle avant de venir.',
    website: 'https://www.loudun-karting.com/', phone: '05 49 98 75 12', facebook_url: 'https://www.facebook.com/kartingdeloudun/' },
  { id: 't6', name: 'Atlantic Kart System (AKS)', city: 'Les Sables-d’Olonne', address: 'D36A, Le Coudriou', postal_code: '85180', region: 'Vendée', is_indoor: false, length_m: 1000, kart_power: '200 / 270 / 390cc', is_verified: true, lat: 46.5094472, lng: -1.6839534,
    description: 'Piste extérieure de 1 000 m près des Sables-d’Olonne, karts 4 temps de 200, 270 et 390cc selon le niveau. Ouvert toute l’année : horaires réduits en automne et en hiver, 7 j/7 pendant les vacances scolaires.',
    website: 'https://www.akskart.fr/', phone: '02 51 32 52 52' },
  { id: 't7', name: 'Circuit Philippe Alliot', city: 'Bellevigny', address: '11 rue Denis Papin, ZI Le Petit Bourbon', postal_code: '85170', region: 'Vendée', is_indoor: false, length_m: 916, kart_power: '270cc (9 ch) · enfant 5 ch', is_verified: true, lat: 46.77349, lng: -1.42973,
    description: 'Le circuit de l’ancien pilote de F1 Philippe Alliot : jusqu’à 916 m de piste extérieure, karts 270cc de 9 ch pour les adultes et 5 ch pour les enfants. Ouvert toute l’année du mardi au dimanche, et le lundi pendant les vacances scolaires.',
    website: 'https://karting-philippealliot.com/', phone: '02 51 41 05 05' },
  { id: 't8', name: 'Mecamax Karting & Quad', city: 'L’Île-d’Olonne', address: 'D32, Route de Challans, Les Gâches', postal_code: '85340', region: 'Vendée', is_indoor: false, length_m: 850, kart_power: '270cc · mini-karts électriques', is_verified: true, lat: 46.5767805, lng: -1.7732405,
    description: 'Piste extérieure de 850 m et mini-piste électrique pour les plus jeunes, avec quads. Ouvert toute l’année avec des horaires réduits en automne et en hiver ; groupes sur réservation.',
    website: 'https://mecamax.com/', phone: '02 51 33 11 82' },
  { id: 't9', name: 'Vendée Kart', city: 'La Jonchère', address: '16 rue des Artisans, ZA Ténement', postal_code: '85540', region: 'Vendée', is_indoor: false, length_m: 780, kart_power: '270cc · enfant 160cc', is_verified: true, lat: 46.4219447, lng: -1.3916635,
    description: 'Piste principale de 780 m, piste électrique pour les enfants, karts biplaces et handi-kart. Saisonnier : ouvert du 1er avril au 30 novembre.',
    website: 'https://vendeekart.fr/', phone: '02 51 30 89 96' },
  { id: 't10', name: 'Karting de Challans', city: 'Challans', address: '4 rue Ayrton Senna, route de Cholet', postal_code: '85300', region: 'Vendée', is_indoor: false, length_m: 700, kart_power: '270cc · Rotax 125 · enfant électrique', is_verified: true, lat: 46.85167, lng: -1.84946,
    description: 'Martini Racing Kart : circuit de 700 m avec karts 4 temps de 9 ch, Rotax 125 de 22 ch sur réservation et piste électrique pour les enfants. Ouvert toute l’année, horaires d’hiver et d’été différents.',
    website: 'https://www.karting-challans.fr/', phone: '02 51 93 33 44' },
  { id: 't11', name: 'West Aventure', city: 'Saint-Révérend', address: 'Le Pâtis Viaud, rue du Point du Jour', postal_code: '85220', region: 'Vendée', is_indoor: false, length_m: 500, kart_power: '270cc · enfant 160cc', is_verified: true, lat: 46.6992108, lng: -1.8446221,
    description: 'Piste extérieure de 500 m dans un parc de loisirs près de Saint-Gilles-Croix-de-Vie. Saisonnier : d’avril à septembre, et réouverture pendant les vacances de la Toussaint.',
    website: 'https://west-aventure.com/', phone: '02 51 54 66 93' },
  { id: 't12', name: 'Circuits de Vendée – Kart Center Indoor', city: 'Fontenay-le-Comte', address: '60 rue de Chambouin', postal_code: '85200', region: 'Vendée', is_indoor: true, length_m: 350, kart_power: 'Électrique', is_verified: true, lat: 46.4370405, lng: -0.7905319,
    description: 'Piste couverte de 350 m en karts 100 % électriques. Ouvert toute l’année, horaires variables selon les semaines et les vacances scolaires.',
    website: 'https://www.circuitsdevendee.com/', phone: '02 51 69 00 78' },
  { id: 't13', name: 'Kart’One', city: 'Saint-Jean-de-Monts', address: '7 avenue des Demoiselles', postal_code: '85160', region: 'Vendée', is_indoor: false, length_m: 300, kart_power: 'Électrique', is_verified: true, lat: 46.7868, lng: -2.07046,
    description: 'Piste de 300 m en karts électriques à deux pas de la plage. Saisonnier : l’été (du 1er juillet au 30 août, de 11 h à minuit) ; appelle avant de venir hors saison.',
    phone: '06 49 61 61 35', facebook_url: 'https://www.facebook.com/kartingkartone/' },
  { id: 't14', name: 'Solokart', city: 'Plessé', address: 'La Piardière', postal_code: '44630', region: 'Loire-Atlantique', is_indoor: false, length_m: 1350, kart_power: '270 / 390cc · Rotax 125', is_verified: true, lat: 47.5236, lng: -1.8387,
    description: 'Le plus long circuit de karting d’Europe annoncé par l’exploitant : piste internationale de 1 350 m et second tracé de 800 m. Karts 270cc (9 ch), 390cc (14 ch) et Rotax 125 (28 ch), baby kart électrique. Ouvert toute l’année, habituellement du mercredi au dimanche.',
    website: 'https://www.solokart.com/', phone: '02 40 51 92 35' },
  { id: 't15', name: 'Plein Gaz Karting 44', city: 'Ancenis-Saint-Géréon', address: '540 rue Pierre Levasseur', postal_code: '44150', region: 'Loire-Atlantique', is_indoor: false, length_m: 1170, kart_power: '270cc · Rotax 125 · enfant 120cc', is_verified: true, lat: 47.3951, lng: -1.1868,
    description: 'Circuit extérieur Roger Gaillard de 1 170 m, à 30 min de Nantes et d’Angers. Karts 4 temps 270cc, Rotax 125 et karts enfants 120cc. Ouvert toute l’année selon le planning, avec des interruptions les jours de course.',
    website: 'https://www.pleingazkarting44.fr/', phone: '02 40 96 29 26' },
  { id: 't16', name: 'Jovikart', city: 'Le Bignon', address: '10 rue de Chantemerle, ZA La Forêt', postal_code: '44140', region: 'Loire-Atlantique', is_indoor: false, length_m: 900, kart_power: 'Sodi 390cc · 270cc · baby électrique', is_verified: true, lat: 47.1173, lng: -1.4881,
    description: 'Circuit extérieur de 900 m au sud de Nantes, karts Sodi Sport 390cc et 270cc, baby kart électrique pour les plus jeunes. Ouvert toute l’année, sauf le 25 décembre et le 1er janvier.',
    website: 'https://www.jovikart.com/', phone: '02 40 26 19 19' },
  { id: 't17', name: 'West Mecapark', city: 'Corcoué-sur-Logne', address: 'Grissauland', postal_code: '44650', region: 'Loire-Atlantique', is_indoor: false, length_m: 730, kart_power: '120 / 270 / 390cc · Rotax 125', is_verified: true, lat: 46.9472, lng: -1.5922,
    description: 'Circuit extérieur d’environ 730 m au sud de Nantes, karts 120, 270 et 390cc et Rotax 125. Ouvert toute l’année selon le planning, sur réservation.',
    website: 'https://www.west-mecapark.com/', phone: '06 45 49 80 70' },
  { id: 't18', name: 'Racing Kart Jade', city: 'Saint-Michel-Chef-Chef', address: '14 rue des Forgerons, ZAC de la Princetière', postal_code: '44730', region: 'Loire-Atlantique', is_indoor: false, length_m: 700, kart_power: 'Adulte · junior · biplace', is_verified: true, lat: 47.1693, lng: -2.1449,
    description: 'Trois circuits près de Pornic, dont un tracé d’environ 700 m, karts adultes, juniors et biplaces. Ouvert toute l’année, 7 j/7 pendant les vacances ; l’été (4 juillet – 31 août), de 10 h à 22 h.',
    website: 'https://www.rkj.fr/', phone: '02 40 82 11 12' },
  { id: 't19', name: 'City Kart Sautron', city: 'Sautron', address: '19 route des Naudières', postal_code: '44880', region: 'Loire-Atlantique', is_indoor: false, length_m: 700, kart_power: 'Loisir · performance', is_verified: true, lat: 47.2637, lng: -1.7016,
    description: 'Circuit extérieur d’environ 700 m au nord de Nantes, près du golf, avec karts loisir et performance. Ouvert toute l’année selon les horaires et la météo ; fermetures possibles lors d’événements.',
    website: 'https://www.city-kart.fr/karting-outdoor-de-nantes/', phone: '02 85 52 20 40' },
  { id: 't20', name: 'City Kart Saint-Sébastien', city: 'Saint-Sébastien-sur-Loire', address: '33 rue Marie Curie', postal_code: '44230', region: 'Loire-Atlantique', is_indoor: true, length_m: 500, kart_power: '270cc · junior 160cc', is_verified: true, lat: 47.1902, lng: -1.4898,
    description: 'Piste indoor de 500 m au sud de Nantes, karts 270cc pour les adultes et 160cc pour les juniors. Ouvert toute l’année selon les horaires de la semaine.',
    website: 'https://www.city-kart.fr/karting-indoor-de-nantes/', phone: '02 85 52 20 40' },
  { id: 't21', name: 'Karting Côte d’Amour', city: 'Guérande', address: '33 rue de la Pierre, ZA Villejames', postal_code: '44350', region: 'Loire-Atlantique', is_indoor: true, length_m: 450, kart_power: '270cc · enfant 120cc · baby électrique', is_verified: true, lat: 47.3273, lng: -2.3983,
    description: 'Piste indoor de 450 m près de La Baule, karts 270cc adultes, 120cc enfants et piste bébé électrique de 50 m en extérieur. Ouvert toute l’année, horaires élargis en juillet-août et pendant les vacances.',
    website: 'https://loisirscotedamour.com/', phone: '02 40 24 76 76' },
  { id: 't22', name: 'Laser Karting de Nantes', city: 'Nantes', address: '10 avenue du Marché Commun', postal_code: '44300', region: 'Loire-Atlantique', is_indoor: true, length_m: 400, kart_power: 'Sodi SR5 270cc (éthanol)', is_verified: true, lat: 47.2537, lng: -1.499,
    description: 'Piste indoor de 400 m à Nantes, karts Sodi SR5 270cc roulant à l’éthanol. Ouvert toute l’année, horaires étendus pendant les vacances scolaires.',
    website: 'https://www.karting-de-nantes.fr/fr-fr/laser-karting-nantes/', phone: '02 40 52 30 30' },
  { id: 't23', name: 'BattleKart Nantes', city: 'Saint-Sébastien-sur-Loire', address: '9 avenue Simone Veil', postal_code: '44230', region: 'Loire-Atlantique', is_indoor: true, length_m: null, kart_power: 'Électrique (karting ludique)', is_verified: true, lat: 47.1895, lng: -1.4869,
    description: 'Karting ludique : karts électriques interactifs sur une piste projetée au sol, entre course et jeu vidéo (bonus, missions). Pas de longueur fixe, à part du karting classique. Ouvert toute l’année.',
    website: 'https://www.battlekart.com/fr/nantes', phone: '02 51 71 23 00' },
  { id: 't24', name: 'Laval Loisirs Karting – Circuit Beausoleil', city: 'Laval', address: 'Chemin de la Croix-Bataille', postal_code: '53000', region: 'Mayenne', is_indoor: false, length_m: 1234, kart_power: '390cc adulte · 120cc enfant', is_verified: true, lat: 48.036, lng: -0.74301,
    description: 'Circuit Beausoleil, tracé homologué FFSA de 1 234 m, karts 4 temps 390cc pour les adultes et 120cc pour les enfants. Ouvert toute l’année, fermé le lundi ; créneaux variables pendant les compétitions.',
    website: 'https://www.karting-laval.fr/', phone: '02 43 49 15 95' },
  { id: 't25', name: 'Karting du Nord Mayenne', city: 'Montreuil-Poulay', address: '1 Le Fouteau, La Houdoulière', postal_code: '53640', region: 'Mayenne', is_indoor: false, length_m: 884, kart_power: '270cc · Rotax 125 · enfant 160cc', is_verified: true, lat: 48.38749, lng: -0.50282,
    description: 'Piste FFSA/FFM de 884 m sur 8 m de large et 15 virages. Karts Sodi LR5 160cc enfant (4,5 ch), RT8 270cc adulte et biplace (9 ch), GT Max Rotax 125 (22 ch). Ouvert toute l’année, réservation recommandée.',
    website: 'https://www.kartingdunordmayenne.fr/', phone: '06 50 29 38 32' },
  { id: 't26', name: 'Karting de Changé', city: 'Changé', address: 'L’Orée des Chênes, route d’Ernée', postal_code: '53810', region: 'Mayenne', is_indoor: false, length_m: 500, kart_power: '100 / 270cc', is_verified: true, lat: 48.1119, lng: -0.85175,
    description: 'Circuit de 500 m sur 7 m de large près de Laval, karts 100 et 270cc. Annoncé ouvert toute l’année (fermé le mardi, horaires réduits de novembre à février) : appelle avant de venir pour confirmer les séances.',
    phone: '02 43 56 63 94' },
  { id: 't27', name: 'Cap Form Loisirs – Karting', city: 'Laval', address: '64 rue Henri Bâtard', postal_code: '53000', region: 'Mayenne', is_indoor: true, length_m: 300, kart_power: 'Électrique', is_verified: true, lat: 48.07325, lng: -0.79829,
    description: 'Piste intérieure de 300 m en karts électriques adultes, enfants et biplaces, jusqu’à 40 km/h. Ouvert toute l’année, fermé le lundi hors vacances ; horaires élargis pendant les vacances scolaires.',
    website: 'https://capformloisirs-53.fr/activites-et-reservations/karting-laval/', phone: '02 43 02 89 89' },
  { id: 't28', name: 'Monky Laval – Karting', city: 'Laval', address: 'Parc de l’Habitat, 30 rue du Petit Montron', postal_code: '53000', region: 'Mayenne', is_indoor: true, length_m: 230, kart_power: 'Bioéthanol', is_verified: true, lat: 48.0831, lng: -0.79621,
    description: 'Piste indoor de 230 m homologuée en 2023, karts au bioéthanol : 10 karts adultes et 8 enfants en même temps. Ouvert 7 j/7 toute l’année, horaires variables les jours fériés et pendant les vacances.',
    website: 'https://monky.fr/laval/activites/karting/', phone: '05 19 08 38 76' },
  { id: 't29', name: 'Karting des 24 Heures du Mans', city: 'Le Mans', address: 'Route du Chemin aux Bœufs', postal_code: '72100', region: 'Sarthe', is_indoor: false, length_m: 1400, kart_power: '160 / 270 / 390cc · Rotax', is_verified: true, lat: 47.940384, lng: 0.214265,
    description: 'Trois circuits au pied du circuit des 24 Heures : piste internationale de 1 400 m (selon les créneaux, parfois réservée aux licenciés), circuit Alain Prost de 980 m et Indy-Kart de 805 m. Karts 4 temps 160, 270 et 390cc et Rotax 2 temps. Ouvert toute l’année, réservation en ligne conseillée.',
    website: 'https://www.lemans-karting.com/', phone: '02 43 40 21 40' },
  { id: 't30', name: 'Racing Kart du Mans', city: 'Montfort-le-Gesnois', address: 'Les Vinettes', postal_code: '72450', region: 'Sarthe', is_indoor: false, length_m: 1150, kart_power: '120 / 270 / 390cc · Rotax', is_verified: true, lat: 48.03707, lng: 0.422,
    description: 'L’ancien circuit de Soulitré : piste compétition de 1 150 m et piste loisir de 900 m, karts 4 temps 120, 270 et 390cc et Rotax 2 temps. Ouvert toute l’année, notamment le mercredi et le week-end : vérifie le calendrier avant de venir.',
    website: 'https://www.racingkartdumans.com/', phone: '02 43 54 03 03' },
  { id: 't31', name: 'SpeedPark Le Mans', city: 'Saint-Saturnin', address: '1 rue de Villeneuve, ZAC des Portes de l’Océane', postal_code: '72650', region: 'Sarthe', is_indoor: true, length_m: 300, kart_power: 'Thermique', is_verified: true, lat: 48.04985, lng: 0.17456,
    description: 'Karting indoor thermique d’environ 300 m au nord du Mans, avec bowling et loisirs. Ouvert toute l’année jusque tard le soir (jusqu’à 2 h le vendredi et le samedi), ouverture plus tôt pendant les vacances.',
    website: 'https://speedpark.fr/le-mans/karting/', phone: '02 43 29 56 56' },
  { id: 't32', name: 'K1 Speed Le Mans', city: 'Le Mans', address: '26 avenue du Panorama', postal_code: '72100', region: 'Sarthe', is_indoor: true, length_m: null, kart_power: 'Électrique (adultes et juniors)', is_verified: true, lat: 47.96321, lng: 0.21797,
    description: 'Karting indoor 100 % électrique, adultes et juniors, sur une piste avec dénivelés. Ouvert toute l’année : lundi sur réservation, du mardi au dimanche l’après-midi et le soir (jusqu’à 1 h le vendredi et le samedi).',
    website: 'https://www.k1speed.com/fr/le-mans.html', phone: '02 43 31 18 20' },
  { id: 't33', name: 'BattleKart Le Mans', city: 'Spay', address: '105 rue du Parc', postal_code: '72700', region: 'Sarthe', is_indoor: true, length_m: null, kart_power: 'Électrique (karting ludique)', is_verified: true, lat: 47.941429, lng: 0.160591,
    description: 'Karting ludique : karts électriques interactifs sur des tracés projetés au sol, entre course et jeu vidéo. Pas de longueur fixe, à part du karting classique. Ouvert toute l’année du mercredi au dimanche, horaires adaptés pendant les vacances.',
    website: 'https://www.battlekart.com/fr/le-mans', phone: '02 43 25 77 56' },
  { id: 't34', name: 'Actarus Karting', city: 'Lohéac', address: '12 Le Clos d’Ahaut', postal_code: '35550', region: 'Ille-et-Vilaine', is_indoor: false, length_m: 1250, kart_power: 'Sodi SR4 · Rotax 125 · Kid', is_verified: true, lat: 47.866881, lng: -1.897513,
    description: 'Le complexe karting de Lohéac, à côté du circuit de rallycross : piste loisir de 650 m en Sodi SR4 4 temps (Sodi Kid pour les enfants) et circuit compétition de 1 250 m (ASK Lohéac) en location encadrée, avec Rotax 125 2 temps. Ouvert toute l’année : mercredi et vendredi après-midi et le week-end hors vacances, du mardi au dimanche pendant les vacances.', website: 'https://www.actarus-loheac.fr/', phone: '02 99 34 13 13' },
  { id: 't35', name: 'Karting de Saint-Malo', city: 'Saint-Méloir-des-Ondes', address: 'Lieu-dit Les Nielles', postal_code: '35350', region: 'Ille-et-Vilaine', is_indoor: false, length_m: 902, kart_power: '160 / 270cc · électrique enfant', is_verified: true, lat: 48.631452, lng: -1.865678,
    description: 'Piste extérieure de 902 m près de Saint-Malo, karts 270cc adultes, 160cc juniors et baby-karts électriques. Ouvert de février à décembre : du mercredi au dimanche de février à octobre, vendredi après-midi et week-end en novembre-décembre, 7 j/7 pendant les vacances scolaires. Janvier non précisé : appelle avant.', website: 'https://www.karting-saint-malo.com/', phone: '02 99 89 16 88' },
  { id: 't36', name: 'Karting Rennes Cap Malo', city: 'Melesse', address: 'Centre commercial Cap Malo, avenue du Phare du Grand Léjon', postal_code: '35520', region: 'Ille-et-Vilaine', is_indoor: true, length_m: 600, kart_power: 'Sodi SR5 · LR6 junior', is_verified: true, lat: 48.1997, lng: -1.72219,
    description: 'Karting indoor de 600 m au parc de loisirs Cap Malo, au nord de Rennes : karts Sodi SR5 4 temps adultes et LR6 juniors. Ouvert 7 j/7 toute l’année : en semaine de 15 h à minuit, samedi de 10 h à minuit, dimanche de 10 h à 20 h (horaires adaptés pendant les vacances).', website: 'https://karting-rennes.fr/', phone: '02 23 07 23 47' },
  { id: 't37', name: 'Roazhon Kart', city: 'La Mézière', address: '27 rue des Merisiers', postal_code: '35520', region: 'Ille-et-Vilaine', is_indoor: true, length_m: 500, kart_power: '270cc 9 ch · 160cc junior', is_verified: true, lat: 48.20174, lng: -1.73342,
    description: 'Karting indoor de 500 m à La Mézière : Sodi SR-5 270cc (9 ch) pour les adultes, LR-5 160cc pour les juniors. Hors vacances, du mercredi au dimanche à horaires fixes (lundi et mardi sur réservation) ; 7 j/7 pendant les vacances.', website: 'https://roazhonkart.com/', phone: '02 99 59 08 97' },
  { id: 't38', name: 'Karting’s Passion', city: 'Saint-Aubin-des-Landes', address: 'La Bruère', postal_code: '35500', region: 'Ille-et-Vilaine', is_indoor: false, length_m: 480, kart_power: 'Sodi GT4 10 ch · Fun Kid', is_verified: true, lat: 48.1017259, lng: -1.2878291,
    description: 'Petite piste extérieure (480 m annoncés, 410 m au règlement) près de Vitré : Sodi GT4 de 10 ch pour les adultes, Fun Kid 120cc pour les enfants. Uniquement sur réservation, du lundi au samedi de 9 h à 20 h, toute l’année (fermé le dimanche, le 24 décembre, le 1er janvier et à la Toussaint).', website: 'https://sites.google.com/view/kartings-passion', phone: '06 50 73 38 11' },
  { id: 't39', name: 'SpeedPark Rennes', city: 'Cesson-Sévigné', address: 'Centre commercial Carrefour, 11 rue de Paris', postal_code: '35510', region: 'Ille-et-Vilaine', is_indoor: true, length_m: 202, kart_power: 'Électrique', is_verified: true, lat: 48.1127, lng: -1.59154,
    description: 'Karting électrique indoor de 202 m (8 karts) ouvert en mai 2026 dans la galerie Carrefour de Cesson-Sévigné, avec jeux d’arcade. Ouvert 7 j/7 jusqu’à minuit (1 h le vendredi et le samedi).', website: 'https://speedpark.fr/rennes/karting/', phone: '02 42 07 09 32' },
  { id: 't40', name: 'Kids Racing Land', city: 'La Mézière', address: '33 rue des Merisiers', postal_code: '35520', region: 'Ille-et-Vilaine', is_indoor: true, length_m: null, kart_power: 'Électrique enfant (3–12 ans)', is_verified: true, lat: 48.20195, lng: -1.73305,
    description: 'Karting électrique réservé aux enfants de 3 à 12 ans, sur 3 petits circuits indoor. Mercredi, samedi et dimanche de 10 h à 19 h, tous les jours pendant les vacances et les jours fériés. Réservation obligatoire.', website: 'https://www.kidsracingland.com/', phone: '07 68 45 86 46' },
  { id: 't41', name: 'FunLab BattleKart Rennes', city: 'La Mézière', address: '1 rue de la Tordelière', postal_code: '35520', region: 'Ille-et-Vilaine', is_indoor: true, length_m: null, kart_power: 'Électrique (karting ludique)', is_verified: true, lat: 48.19182, lng: -1.72732,
    description: 'BattleKart : karting électrique en réalité augmentée dans une salle de 1 950 m², circuits et jeux projetés au sol (course, batailles). Pas une piste de karting classique. Ouvert du mardi au dimanche, réservation fortement conseillée.', website: 'https://www.funlab.bzh/battlekart', phone: '02 59 16 13 05' },
  { id: 't42', name: 'Karting de Kerlabo', city: 'Cohiniac', address: 'Kerlabo, axe Châtelaudren–Quintin', postal_code: '22800', region: 'Côtes-d’Armor', is_indoor: false, length_m: 805, kart_power: '270cc · électrique 17/24 ch', is_verified: true, lat: 48.44643, lng: -2.94646,
    description: 'Circuit du Leff, homologué FFSA : piste extérieure de 805 m. Karts 4 temps 270cc (RT10, LR6 junior, biplace), Birel E-Kart électriques de 17 et 24 ch et karts électriques enfants. Ouvert toute l’année : samedi, dimanche et jours fériés hors vacances, 7 j/7 pendant les vacances et en juillet-août (horaires selon la saison et la météo).', website: 'https://kerlabo-kart.com/', phone: '06 75 78 47 32' },
  { id: 't43', name: 'GP Circuit', city: 'Lamballe-Armor', address: '3 rue des Frères Piéto, zone des Sports Mécaniques', postal_code: '22400', region: 'Côtes-d’Armor', is_indoor: false, length_m: 800, kart_power: '200 / 270cc · Rotax 16–30 ch', is_verified: true, lat: 48.48852, lng: -2.45089,
    description: 'Circuit Guy Pansart, homologué : piste extérieure de 800 m. Fun Kart 200cc (4,5 ch), RS Kart 270cc (9 ch), Rotax 2 temps de 16 et 22 ch (30 ch sur rendez-vous) et biplace. Ouvert toute l’année selon le planning de la semaine, location loisir sans réservation pendant les heures d’ouverture.', website: 'https://gp-circuit.fr/', phone: '02 96 50 09 09' },
  { id: 't44', name: 'Plérin Komplex Indoor', city: 'Plérin', address: '12 rue Jules Lequier', postal_code: '22190', region: 'Côtes-d’Armor', is_indoor: true, length_m: 400, kart_power: '160 / 270cc · biplace', is_verified: true, lat: 48.54201, lng: -2.7778,
    description: 'Karting indoor de 400 m près de Saint-Brieuc : SR4 270cc adultes, LR6 160cc juniors et biplace 2Drive. Hors vacances : mercredi 14 h–21 h, jeudi 16 h–23 h, vendredi 16 h–1 h, samedi 14 h–1 h, dimanche 14 h–19 h ; 7 j/7 pendant les vacances.', website: 'https://www.le-pki.fr/', phone: '02 96 74 50 40' },
  { id: 't45', name: 'Kart 56', city: 'Ploemel', address: 'ZA La Madeleine, route de Pont-Fol', postal_code: '56400', region: 'Morbihan', is_indoor: false, length_m: 800, kart_power: 'Sodi RT10 / LR5 · bioéthanol', is_verified: true, lat: 47.667334, lng: -3.059598,
    description: 'Piste extérieure de 800 m près de Carnac et Auray : karts Sodi RT10 adultes et LR5 juniors au bioéthanol, mini-karts électriques pour les 3–6 ans. Saison 2026 du 18 mars au 31 décembre (pause en hiver) : du mercredi au dimanche hors vacances, 7 j/7 en vacances. Réservation en ligne obligatoire.', website: 'https://www.kart56.com/', phone: '02 97 56 71 71' },
  { id: 't46', name: 'Kart Center Pluméliau', city: 'Pluméliau-Bieuzy', address: '238 rue Gustave Eiffel, ZA Port Arthur', postal_code: '56930', region: 'Morbihan', is_indoor: false, length_m: 702, kart_power: '270 / 390cc · Rotax 22 ch', is_verified: true, lat: 47.96938, lng: -2.99108,
    description: 'Piste extérieure éclairée de 702 m : karts 4 temps 270cc adultes, juniors, biplace 390cc, Rotax 2 temps de 22 ch et mini-karts électriques. Ouvert toute l’année avec des horaires selon la saison (en ce moment du mercredi au dimanche, 14 h–18 h 30) ; groupes de 10 et plus sur réservation.', website: 'https://www.kartcenter56.fr/', phone: '02 97 51 98 11' },
  { id: 't47', name: 'Circuit de Guillac', city: 'Guillac', address: 'La Pyramide, lieu-dit Brangoyan', postal_code: '56800', region: 'Morbihan', is_indoor: false, length_m: 680, kart_power: '120 / 270cc', is_verified: true, lat: 47.93823, lng: -2.48658,
    description: 'Circuit de la Pyramide, près de Ploërmel : 618 m selon l’exploitant actuel (680 m dans les anciennes fiches). Karts 4 temps 270cc adultes et 120cc enfants, roulage de karts personnels. Ouvert de février à décembre : du mercredi au dimanche (mercredi, samedi et dimanche en novembre-décembre), tous les jours pendant les vacances. Location sans réservation.', website: 'https://circuit-de-guillac.com/', phone: '07 86 68 10 75' },
  { id: 't48', name: 'SpeedPark Vannes', city: 'Vannes', address: 'ZAC de Parc Lann, 4 rue Aristide Boucicaut', postal_code: '56000', region: 'Morbihan', is_indoor: true, length_m: null, kart_power: '120 / 200cc', is_verified: true, lat: 47.670432, lng: -2.79191,
    description: 'Karting indoor avec pont et tunnel, karts Sodikart 200cc adultes et 120cc enfants, avec bowling et loisirs. Ouvert tous les jours jusque tard le soir (jusqu’à 2 h le vendredi et le samedi).', website: 'https://speedpark.fr/sp-vannes/nos-activites/', phone: '02 97 42 59 66' },
  { id: 't49', name: 'KartOuest', city: 'Ploumoguer', address: 'Keronvel, Villeneuve Stadium', postal_code: '29810', region: 'Finistère', is_indoor: false, length_m: 800, kart_power: '270cc 9 ch · 160cc 5 ch', is_verified: true, lat: 48.39861, lng: -4.69004,
    description: 'Circuit Villeneuve Stadium, à l’ouest de Brest : piste extérieure de 800 m sur 8 m de large, homologuée FFSA. Karts 4 temps 270cc (9 ch) adultes et 160cc (5 ch) enfants. Ouvert toute l’année sur réservation : mercredi, vendredi, samedi et dimanche hors vacances, horaires élargis pendant les vacances. Certains créneaux sont réservés à l’entraînement des licenciés.', website: 'https://www.kartouest29.fr/', phone: '02 98 89 34 40' },
  { id: 't50', name: 'Bretagne Karting', city: 'Combrit', address: 'Ménez Frug, sortie L’Avantage', postal_code: '29120', region: 'Finistère', is_indoor: false, length_m: 700, kart_power: '270cc · biplace', is_verified: true, lat: 47.92136, lng: -4.18757,
    description: 'Piste extérieure de 700 m près de Pont-l’Abbé et Quimper : karts 270cc, biplaces et karts adaptés PMR, live timing en ligne. Ouvert toute l’année : du mercredi au dimanche de 14 h à 20 h hors vacances, 7 j/7 pendant les vacances, et 7 j/7 de 11 h à 21 h du 15 juin au 15 septembre.', website: 'https://www.bretagne-karting.bzh/', phone: '02 98 94 25 09' },
  { id: 't51', name: 'Brest Karting Électrique', city: 'Brest', address: '35 avenue de la 1ère DFL', postal_code: '29200', region: 'Finistère', is_indoor: true, length_m: 540, kart_power: 'Électrique Sodikart RSX / LRX', is_verified: true, lat: 48.4235, lng: -4.4745,
    description: 'Karting indoor 100 % électrique de 540 m : Sodikart RSX dès 14 ans (70 km/h max) et LRX pour les 7–13 ans (45 km/h max). Du mercredi au dimanche hors vacances (lundi et mardi réservés aux groupes), tous les jours pendant les vacances, sur réservation.', website: 'https://www.brestkartingelectrique.fr/', phone: '02 98 30 14 26' },
  { id: 't52', name: 'La Récré des 3 Curés – Karting', city: 'Milizac-Guipronvel', address: 'Les Trois Curés', postal_code: '29290', region: 'Finistère', is_indoor: false, length_m: 450, kart_power: 'Karts enfants / adultes · biplace', is_verified: true, lat: 48.4729, lng: -4.52642,
    description: 'Le karting du parc d’attractions de la Récré des 3 Curés : piste d’environ 450 m, karts enfants dès 8 ans, adultes dès 14 ans et biplace. Payant en plus du billet du parc. Ouvert uniquement les jours d’ouverture du parc, du 5 avril au 20 décembre 2026 : consulte le calendrier du parc avant de venir.', website: 'https://www.larecredes3cures.com/parc-et-attractions/attractions-et-jeux/le-karting/', phone: '02 98 07 95 59' },
  { id: 't53', name: 'Kart West Indoor', city: 'Quimper', address: '4 rue du Stade de Kerhuel, ZI de l’Hippodrome', postal_code: '29000', region: 'Finistère', is_indoor: true, length_m: 350, kart_power: '200cc · 160cc enfant', is_verified: true, lat: 47.99912, lng: -4.07923,
    description: 'Karting indoor à Quimper : karts 4 temps 200cc adultes et 160cc enfants dès 8 ans, avec laser game. Piste de 350 m selon une fiche, 200 m selon les sources récentes. Du mercredi au dimanche hors vacances, 7 j/7 de 14 h à 22 h pendant les vacances (fermé le 25 décembre et le 1er janvier).', website: 'https://kartwest.fr/', phone: '02 98 53 03 03' },
  { id: 't54', name: 'SpeedPark Brest', city: 'Brest', address: '63–65 rue Amiral Romain-Desfossés, ZC Kergaradec', postal_code: '29200', region: 'Finistère', is_indoor: true, length_m: 215, kart_power: 'Électrique', is_verified: true, lat: 48.426816, lng: -4.470775,
    description: 'Karting électrique indoor de plus de 215 m dans la zone de Kergaradec, avec loisirs. Adultes dès 15 ans (1,50 m), juniors de 11 à 14 ans (1,30 m, pas après 20 h). Ouvert tous les jours, horaires élargis pendant les vacances.', website: 'https://speedpark.fr/brest/', phone: '02 98 34 47 83' },
  { id: 't55', name: 'Karting Paintball 14', city: 'Marolles', address: '1550 route de Paris (RN13)', postal_code: '14100', region: 'Calvados', is_indoor: false, length_m: 450, kart_power: '270cc', is_verified: true, lat: 49.14487, lng: 0.3513,
    description: 'L’ancien ACS Karting, près de Lisieux : piste extérieure de 450 m, karts 4 temps 270cc, avec paintball sur place. Ouvert toute l’année : d’octobre à mars de 11 h à 18 h (fermé le mardi), en juillet-août 7 j/7 de 10 h à 19 h.', website: 'https://www.karting-paintball14.fr/', phone: '02 31 63 83 92' },
  { id: 't56', name: 'Circuit de Cabourg – Team Active', city: 'Cabourg', address: 'Avenue de la Divette', postal_code: '14390', region: 'Calvados', is_indoor: false, length_m: 900, kart_power: '270cc · 160cc enfant', is_verified: true, lat: 49.27669, lng: -0.13717,
    description: 'Piste extérieure de 900 m derrière le Carrefour Market de Cabourg : karts 4 temps 270cc adultes et 160cc enfants. Ouvert toute l’année : mercredi, samedi et dimanche hors vacances, tous les jours en juillet-août, horaires réduits de novembre à mars.', website: 'https://www.teamactive.fr/nos-activites/karting/', phone: '09 67 26 32 32' },
  { id: 't57', name: 'Circuit de Ouistreham – Team Active', city: 'Ouistreham', address: 'Boulevard Maritime', postal_code: '14150', region: 'Calvados', is_indoor: false, length_m: 550, kart_power: 'Bioéthanol · mini-karts électriques', is_verified: true, lat: 49.28924, lng: -0.25379,
    description: 'Piste extérieure de 550 m en bord de mer, près du Grand Bunker : karts au bioéthanol et mini-karts électriques selon la formule. Saison 2026 du 4 avril au 15 novembre, jours d’ouverture variables selon le mois.', website: 'https://www.teamactive.fr/nos-activites/karting/', phone: '02 31 96 65 62' },
  { id: 't58', name: 'Circuit de Deauville – Team Active', city: 'Saint-Arnoult', address: '5 chemin du Bief du Moulin', postal_code: '14800', region: 'Calvados', is_indoor: false, length_m: 900, kart_power: '270cc', is_verified: true, lat: 49.327, lng: 0.0797,
    description: 'Piste extérieure à côté de Deauville : 760 m selon l’exploitant actuel (900 m dans une ancienne fiche), karts 4 temps 270cc. Ouvert toute l’année, en général le mercredi, le samedi et le dimanche, planning élargi pendant les vacances.', website: 'https://www.teamactive.fr/nos-activites/karting/', phone: '02 58 54 00 21' },
  { id: 't59', name: 'Circuit de Caen', city: 'Démouville', address: 'Parc d’activités du Clos Neuf', postal_code: '14840', region: 'Calvados', is_indoor: false, length_m: 1100, kart_power: '270 / 390cc · jeunes', is_verified: true, lat: 49.1692667, lng: -0.2669611,
    description: 'Circuit à l’est de Caen : tracé FFSA de 1 100 m, tracé de location actuel de 800 m. Karts 4 temps 270 et 390cc selon l’offre, modèles pour les jeunes. Ouvert toute l’année, tous les jours de 10 h à 19 h d’avril à octobre ; vérifie les horaires le reste de l’année.', website: 'https://circuit-caen.fr/', phone: '02 31 72 20 00' },
  { id: 't60', name: 'Technikart – Circuit Nelly Delamarche', city: 'Vendeuvre', address: 'Les Illandes', postal_code: '14170', region: 'Calvados', is_indoor: false, length_m: 1100, kart_power: 'Location et compétition', is_verified: true, lat: 49.01612, lng: -0.0791,
    description: 'Circuit Nelly Delamarche, près de Saint-Pierre-sur-Dives : piste extérieure d’environ 1 100 m (1 024 m pour l’ancien tracé de la Ligue), karts de location et de compétition. Ouvert toute l’année selon la disponibilité de la piste et les entraînements : appelle avant de venir.', website: 'https://www.technikart.fr/', phone: '02 31 20 30 50' },
  { id: 't61', name: 'EIA – Espace International Automobile', city: 'Pont-l’Évêque', address: '138 route du Lac (D48)', postal_code: '14130', region: 'Calvados', is_indoor: false, length_m: 850, kart_power: '270cc · 120cc enfant', is_verified: true, lat: 49.2736111, lng: 0.1919444,
    description: 'Complexe de sports mécaniques au bord du lac de Pont-l’Évêque : piste de karting extérieure de 850 m, karts 4 temps 270cc adultes et 120cc enfants. Ouvert presque toute l’année, avec une pause possible en hiver (dates 2026 non publiées).', website: 'https://www.eia.fr/', phone: '02 31 64 39 01' },
  { id: 't62', name: 'Karting de La Hague', city: 'La Hague', address: 'La Lande Saint-Nazaire (D237)', postal_code: '50440', region: 'Manche', is_indoor: false, length_m: 1345, kart_power: '270cc · 160cc enfant', is_verified: true, lat: 49.66211, lng: -1.81569,
    description: 'Circuit de Gréville-Hague, près de Cherbourg : grande piste extérieure de 1 345 m, karts 4 temps 270cc adultes et 160cc enfants, et compétition. Location le dimanche après-midi, en semaine sur rendez-vous. Pause possible en hiver.', website: 'https://karting50.fr/', phone: '02 33 08 45 40' },
  { id: 't63', name: 'SM Kart#50 – Circuit de la Manche', city: 'Lessay', address: 'Route de l’Aérodrome', postal_code: '50430', region: 'Manche', is_indoor: false, length_m: 1005, kart_power: '270cc · compétition', is_verified: true, lat: 49.20414, lng: -1.510792,
    description: 'Piste extérieure de 1 005 m à côté de l’aérodrome de Lessay, karts 4 temps 270cc et compétition. Ouvert toute l’année selon le calendrier : mercredi, samedi et dimanche hors vacances (groupes sur réservation), 7 j/7 pendant les vacances (10 h–13 h et 14 h–18 h).', website: 'https://smkart50.fr/', phone: '02 33 07 70 67' },
  { id: 't64', name: 'Karting du Parc', city: 'Le Parc', address: 'Les Prés Bas, Sainte-Pience', postal_code: '50870', region: 'Manche', is_indoor: false, length_m: 1300, kart_power: 'Adultes / enfants · mini-karts électriques', is_verified: true, lat: 48.76537, lng: -1.28458,
    description: 'Piste extérieure de 1 300 m près de Villedieu-les-Poêles et Avranches, karts adultes et enfants, mini-karts électriques selon l’offre. Ouvert toute l’année : horaires élargis l’été, le week-end, pendant les vacances et sur réservation le reste de l’année.', website: 'https://www.kartingduparc.fr/', phone: '02 33 58 50 34' },
  { id: 't65', name: 'Rival Karting – Circuit du Mortainais', city: 'Le Neufbourg', address: '5 La Tête à la Femme', postal_code: '50140', region: 'Manche', is_indoor: false, length_m: 769, kart_power: 'Compétition', is_verified: true, lat: 48.6703, lng: -0.94418,
    description: 'Circuit du Mortainais, près de Mortain : piste extérieure de 769 m, location et karts de compétition, courses en 2026. Ouvert toute l’année selon le calendrier de location et des événements.', website: 'https://www.rivalkarting.fr/', phone: '02 33 59 60 33' },
  { id: 't66', name: 'Kartdrive', city: 'Carentan-les-Marais', address: '2 route des Joncs (RN174)', postal_code: '50620', region: 'Manche', is_indoor: false, length_m: null, kart_power: 'À confirmer', is_verified: true, lat: 49.29477, lng: -1.25231,
    description: 'Karting extérieur au bord de la RN174 à Carentan. Ouvert du mardi au dimanche, horaires élargis le vendredi et le samedi. Le gestionnaire a pu changer : appelle avant de venir.', website: 'http://kartdrive.fr/?page_id=12', phone: '06 84 44 14 82' },
  { id: 't67', name: 'Ouest Karting', city: 'Aunay-les-Bois', address: '7–11 route du Mêle', postal_code: '61500', region: 'Orne', is_indoor: false, length_m: 1215, kart_power: 'Loisir et compétition', is_verified: true, lat: 48.55319122, lng: 0.27412176,
    description: 'Circuit international d’Aunay-les-Bois, près d’Alençon : piste de 1 215 m (le loisir peut être limité à 900 m), plusieurs gammes de karts loisir et compétition. Du mardi au vendredi de 9 h à 20 h, samedi de 8 h à 20 h, dimanche de 8 h à 19 h, sauf jours de course.', website: 'https://www.ouest-karting-normandie.com/', phone: '02 33 27 65 87' },
  { id: 't68', name: 'Speed Zone', city: 'Flers', address: 'ZI La Crochère, route de Banvou', postal_code: '61100', region: 'Orne', is_indoor: true, length_m: null, kart_power: 'Électrique', is_verified: true, lat: 48.72999, lng: -0.57795,
    description: 'Karting indoor électrique (18 karts) à Flers. Ouvert toute l’année : mercredi, jeudi et dimanche de 15 h à 19 h, vendredi et samedi de 15 h à minuit, fermé lundi et mardi.', website: 'https://www.facebook.com/speedzoneflers/', phone: '02 33 65 18 51' },
  { id: 't69', name: 'Circuit de l’Europe', city: 'Sotteville-sous-le-Val', address: '40 rue du Village', postal_code: '76410', region: 'Seine-Maritime', is_indoor: false, length_m: 1200, kart_power: '160 / 200 / 270cc · 125 compétition', is_verified: true, lat: 49.31462, lng: 1.11595,
    description: 'Circuit au sud de Rouen, en bord de Seine : piste extérieure de 1 200 m (1 157 m selon d’autres sources), karts 4 temps 160, 200 et 270cc pour enfants, adultes et biplace, et 125cc de compétition. Ouvert toute l’année, en général tous les jours, sur réservation selon les compétitions.', website: 'https://www.circuit-europe.com/', phone: '02 35 78 72 17' },
  { id: 't70', name: 'Karting Anneville – Circuit Lucien Lebret', city: 'Anneville-Ambourville', address: '1444 chemin d’Ambourville', postal_code: '76480', region: 'Seine-Maritime', is_indoor: false, length_m: 1217, kart_power: '390cc · compétition', is_verified: true, lat: 49.4491361, lng: 0.9036694,
    description: 'Circuit Lucien Lebret, dans une boucle de la Seine à l’ouest de Rouen : piste de 1 217 m, karts 4 temps 390cc en location et compétitions FFSA de mars à novembre. Location les jours prévus au planning : réserve avant de venir.', website: 'https://www.kartinganneville.fr/', phone: '06 45 33 98 20' },
  { id: 't71', name: 'Espace 360 Tourville', city: 'Tourville-la-Rivière', address: '11 rue Parc-en-Seine', postal_code: '76410', region: 'Seine-Maritime', is_indoor: true, length_m: 500, kart_power: 'Électrique', is_verified: true, lat: 49.33012, lng: 1.10578,
    description: 'Karting indoor électrique de 500 m au sud de Rouen, avec d’autres loisirs. Ouvert toute l’année, horaires variables selon les jours et les vacances scolaires.', website: 'https://espace360.net/rouen/activites/karting/', phone: '02 78 08 43 60' },
  { id: 't72', name: 'Normandie Karting', city: 'Val-de-la-Haye', address: '19 avenue de Quenneport', postal_code: '76380', region: 'Seine-Maritime', is_indoor: true, length_m: 400, kart_power: '270cc', is_verified: true, lat: 49.3885, lng: 0.9907,
    description: 'Karting indoor thermique de 400 m près de Rouen, karts 4 temps 270cc. Ouvert toute l’année, fermé le lundi hors vacances, soirées en semaine selon le planning.', website: 'https://www.normandie-karting.net/', phone: '02 35 34 98 16' },
  { id: 't73', name: 'Rouen Espace Loisirs', city: 'Rouen', address: '149 chemin de Croisset', postal_code: '76000', region: 'Seine-Maritime', is_indoor: true, length_m: null, kart_power: 'Électrique', is_verified: true, lat: 49.433, lng: 1.04989,
    description: 'Karting indoor électrique en bord de Seine à Rouen. Ouvert toute l’année du mardi au dimanche, l’après-midi et en soirée, horaires variables pendant les vacances.', website: 'https://www.rouenespaceloisirs.fr/', phone: '02 32 12 34 05' },
  { id: 't74', name: 'Maraikart', city: 'Bucy-le-Long', address: 'Chemin du Voyeu', postal_code: '02880', region: 'Aisne', is_indoor: false, length_m: 989, kart_power: '4 temps et 2 temps', is_verified: true, lat: 49.3914, lng: 3.3947,
    description: 'Piste extérieure de 989 m près de Soissons, karts 4 temps et 2 temps. Saison du 1er mars au 30 novembre 2026 : mercredi, samedi et dimanche, autres jours sur réservation.', website: 'https://www.kartingmaraikart-bucylelong-soissons-aisne.fr/', phone: '03 23 74 27 18' },
  { id: 't75', name: 'Défis Parc', city: 'Gauchy', address: '104 rue Pierre Sémard', postal_code: '02430', region: 'Aisne', is_indoor: true, length_m: 300, kart_power: 'Électrique Sodi RTX / LRX', is_verified: true, lat: 49.825, lng: 3.272,
    description: 'Karting électrique indoor d’environ 300 m près de Saint-Quentin (Sodi RTX adultes, LRX juniors), avec laser game et autres loisirs. Ouvert toute l’année selon le calendrier de la semaine, fermé certains lundis et mardis.', website: 'https://www.defis-parc.fr/', phone: '03 23 05 05 05' },
  { id: 't76', name: 'Folembray Arena', city: 'Folembray', address: 'Rue des Hautes Avesnes', postal_code: '02670', region: 'Aisne', is_indoor: false, length_m: 820, kart_power: 'Sodi 390cc', is_verified: true, lat: 49.54573, lng: 3.30351,
    description: 'L’ancien circuit de Folembray, près de Laon : plusieurs configurations de 680 à 820 m, karts Sodi 390cc. Ouvert selon l’agenda du circuit et sur réservation : vérifie les dates avant de venir.', website: 'https://www.folembray-arena.fr/location-de-karting/', phone: '03 23 52 01 42' },
  { id: 't77', name: 'Karting Hirson', city: 'Hirson', address: 'La Genetière', postal_code: '02500', region: 'Aisne', is_indoor: false, length_m: 800, kart_power: 'À confirmer', is_verified: true, lat: 49.90211, lng: 4.09465,
    description: 'Piste extérieure en bitume de 800 m, aussi utilisée pour le pit-bike. Ouvert en saison le mercredi, le samedi et le dimanche de 9 h à 19 h (dates de saison non publiées : appelle avant).', website: 'https://www.kartinghirson.com/', phone: '06 49 89 78 82' },
  { id: 't78', name: 'Racing Kart JPR – Circuit de la Métropole', city: 'Ostricourt', address: 'RD 354, Bois de Fienne', postal_code: '59162', region: 'Nord', is_indoor: false, length_m: 1500, kart_power: '160 / 270 / 390cc (5 à 14 ch)', is_verified: true, lat: 50.46739, lng: 3.021526,
    description: 'Grand circuit extérieur de 1 500 m (1 450 m selon l’exploitant) entre Lille et Douai : karts 4 temps 160cc (5 ch), 270cc (9 ch) et 390cc (14 ch), location et compétition. Ouvert toute l’année selon les horaires, la météo et les courses.', website: 'https://karting-lille-jpr.fr/', phone: '03 27 89 90 50' },
  { id: 't79', name: 'DKS Motors – Circuit international du Hainaut', city: 'Rouvignies', address: 'Route de Wavrechain', postal_code: '59220', region: 'Nord', is_indoor: false, length_m: 820, kart_power: '160 / 270 / 390cc · 2 temps', is_verified: true, lat: 50.328601, lng: 3.430291,
    description: 'Circuit du Hainaut près de Valenciennes : 820 m (800 m selon le site récent), karts 4 temps 160, 270 et 390cc et 2 temps, location et compétition. Ouverture selon l’agenda de la saison (en octobre : week-ends 14 h–18 h, du mercredi au dimanche à la Toussaint).', website: 'https://dks-motors.com/', phone: '03 27 43 83 22' },
  { id: 't80', name: 'Kartgrav – Karting Club Gravelinois', city: 'Gravelines', address: 'Route des Enrochements', postal_code: '59820', region: 'Nord', is_indoor: false, length_m: 760, kart_power: '160 / 270cc', is_verified: true, lat: 51.00647, lng: 2.13245,
    description: 'Piste extérieure de 760 m en bord de mer à Gravelines, karts 4 temps 160 et 270cc. Location selon la saison et la météo ; certaines journées sont réservées aux licenciés.', website: 'https://kartgrav.fr/', phone: '03 28 23 47 47' },
  { id: 't81', name: 'Lille Karting', city: 'Ennetières-en-Weppes', address: 'Centre commercial Englos les Géants', postal_code: '59320', region: 'Nord', is_indoor: false, length_m: 900, kart_power: '160 à 390cc', is_verified: true, lat: 50.63469, lng: 2.9709,
    description: 'Deux pistes sur le même site, à côté d’Englos : outdoor de 900 m et indoor de 600 m, karts 4 temps de 160 à 390cc. Ouvert toute l’année du mardi au dimanche (fermé le lundi hors privatisations).', website: 'https://www.lillekarting.fr/', phone: '03 20 17 60 80' },
  { id: 't82', name: 'Loisi Flandres', city: 'Hazebrouck', address: 'Avenue de Saint-Omer, zone de loisirs', postal_code: '59190', region: 'Nord', is_indoor: true, length_m: null, kart_power: 'Thermique', is_verified: true, lat: 50.72642, lng: 2.51566,
    description: 'Karting indoor dans un complexe de loisirs de 3 600 m² à Hazebrouck. Ouvert toute l’année, jours variables pendant et hors vacances.', website: 'https://loisiflandres.com/', phone: '03 28 42 28 28' },
  { id: 't83', name: 'Loisi Sambre', city: 'Maubeuge', address: '3 rue Pierre Perrin', postal_code: '59600', region: 'Nord', is_indoor: true, length_m: null, kart_power: 'Électrique Sodi SRX2 / LRX', is_verified: true, lat: 50.2775, lng: 3.9727,
    description: 'Karting électrique indoor (Sodi SRX2 adultes, LRX juniors) dans un complexe de loisirs à Maubeuge. Ouvert toute l’année du mardi au dimanche, horaires renforcés pendant les vacances.', website: 'https://loisisambre.com/', phone: '03 59 61 37 13' },
  { id: 't84', name: 'King Kart', city: 'Caudry', address: '33 ter RD 643', postal_code: '59540', region: 'Nord', is_indoor: true, length_m: null, kart_power: 'Électrique', is_verified: true, lat: 50.13289, lng: 3.425,
    description: 'Karting électrique indoor au King Bowling de Caudry. Ouvert toute l’année : du mercredi au dimanche hors vacances, tous les jours pendant les vacances scolaires.', website: 'https://kingbowling.fr/', phone: '03 27 76 24 35' },
  { id: 't85', name: 'Karting de Beauvais', city: 'Rochy-Condé', address: 'D12', postal_code: '60510', region: 'Oise', is_indoor: false, length_m: 1000, kart_power: '270cc', is_verified: true, lat: 49.39801, lng: 2.20101,
    description: 'RLS Karting, à côté de Beauvais : piste extérieure de 1 000 m, karts 4 temps 270cc. Ouvert toute l’année selon le calendrier du circuit.', website: 'https://kartingdebeauvais.fr/', phone: '03 44 07 63 03' },
  { id: 't86', name: 'Karting Loisirs Neuilly', city: 'Neuilly-sous-Clermont', address: '1300 rue de Cambronne', postal_code: '60290', region: 'Oise', is_indoor: false, length_m: 720, kart_power: 'Thermique', is_verified: true, lat: 49.345439, lng: 2.397797,
    description: 'Piste extérieure de 720 m (environ 500 m en location) près de Clermont, location et compétition. Ouvert toute l’année du mercredi au dimanche, fermé le lundi, horaires adaptés pendant les vacances.', website: 'https://karting-loisirs-neuilly.com/', phone: '06 79 69 78 26' },
  { id: 't87', name: 'SpeedPark Beauvais', city: 'Beauvais', address: 'Rue Fernand Sastre', postal_code: '60000', region: 'Oise', is_indoor: true, length_m: 500, kart_power: 'Électrique', is_verified: true, lat: 49.4465, lng: 2.096,
    description: 'Karting indoor de plus de 500 m près du stade Pierre-Brisson, avec bowling et loisirs. Ouvert toute l’année.', website: 'https://speedpark.fr/beauvais/', phone: '03 44 49 99 62' },
  { id: 't88', name: 'SpeedPark Jaux', city: 'Jaux', address: 'Place Jacques Tati', postal_code: '60880', region: 'Oise', is_indoor: true, length_m: 300, kart_power: 'Thermique', is_verified: true, lat: 49.394, lng: 2.778,
    description: 'Karting indoor d’environ 300 m à côté de Compiègne, avec bowling et loisirs. Ouvert toute l’année selon les horaires du complexe.', website: 'https://speedpark.fr/jaux-compiegne/', phone: '03 67 61 08 71' },
  { id: 't89', name: 'KLL Loisirs – Circuit de Douvrin', city: 'Douvrin', address: '602 boulevard Sud', postal_code: '62138', region: 'Pas-de-Calais', is_indoor: false, length_m: 1000, kart_power: 'Thermique', is_verified: true, lat: 50.513196, lng: 2.842615,
    description: 'Circuit extérieur de 1 000 m entre Lens et Béthune, location et compétition. Ouvert toute l’année.', website: 'https://kll.fr/', phone: '03 21 77 73 31' },
  { id: 't90', name: 'Opale Karting', city: 'Berck', address: '31 rue des Argousiers, Parc de la Vigogne', postal_code: '62600', region: 'Pas-de-Calais', is_indoor: false, length_m: 603, kart_power: 'Thermique', is_verified: true, lat: 50.39922, lng: 1.60388,
    description: 'Piste extérieure de 603 m à Berck. Fermé en décembre et janvier, réouverture en février : du mercredi au dimanche hors vacances, tous les jours pendant les vacances.', website: 'https://www.opalekarting.fr/', phone: '03 21 94 44 45' },
  { id: 't91', name: 'Kart’Innov', city: 'Bruay-la-Buissière', address: '89 rue Raoul Briquet', postal_code: '62700', region: 'Pas-de-Calais', is_indoor: true, length_m: 350, kart_power: 'Électrique', is_verified: true, lat: 50.474804, lng: 2.546365,
    description: 'Karting électrique indoor de 350 m à Bruay-la-Buissière. Ouvert toute l’année.', website: 'https://www.kart-innov.fr/', phone: '03 21 64 19 25' },
  { id: 't92', name: 'KHUB Arras Karting', city: 'Sainte-Catherine', address: '78 route de Béthune', postal_code: '62223', region: 'Pas-de-Calais', is_indoor: true, length_m: 408, kart_power: 'Électrique', is_verified: true, lat: 50.31622, lng: 2.76116,
    description: 'Karting électrique indoor de 408 m aux portes d’Arras. Ouvert toute l’année : du mercredi au dimanche hors vacances, tous les jours pendant les vacances scolaires.', website: 'https://khub-arras.com/', phone: '03 66 86 98 33' },
  { id: 't93', name: 'Planet Karting', city: 'Saint-Martin-lez-Tatinghem', address: '57 rue du Fond Squin', postal_code: '62500', region: 'Pas-de-Calais', is_indoor: true, length_m: 500, kart_power: 'Thermique', is_verified: true, lat: 50.76323, lng: 2.22151,
    description: 'Karting indoor de 500 m près de Saint-Omer. Ouvert toute l’année, horaires variables selon la période et les vacances.', website: 'https://planet-karting.com/', phone: '03 21 38 94 50' },
  { id: 't94', name: 'SpeedPark Hénin-Beaumont', city: 'Hénin-Beaumont', address: 'Avenue du Bord des Eaux', postal_code: '62110', region: 'Pas-de-Calais', is_indoor: true, length_m: null, kart_power: '160 / 200cc', is_verified: true, lat: 50.4205, lng: 2.9615,
    description: 'Karting indoor thermique (160 et 200cc) dans la zone du Bord des Eaux, avec bowling et loisirs. Ouvert toute l’année selon l’agenda.', website: 'https://speedpark.fr/henin-beaumont/', phone: '03 73 62 00 32' },
  { id: 't95', name: 'Karting Haute Picardie', city: 'Arvillers', address: 'Lieu-dit La Râperie', postal_code: '80910', region: 'Somme', is_indoor: false, length_m: 1300, kart_power: '160 / 270 / 390cc · 125 2T (4,5 à 28 ch)', is_verified: true, lat: 49.75263, lng: 2.65475,
    description: 'Au sud-est d’Amiens, deux pistes séparées : circuit sportif de 1 300 m et piste loisir de 600 m. Karts 4 temps 160cc (4,5 ch), 270cc (9 ch), 390cc (14,5 ch) et 125cc 2 temps (28 ch), location et compétition. Ouvert toute l’année selon le calendrier.', website: 'https://www.kartingarvillers.fr/', phone: '03 22 37 46 77' },
  { id: 't96', name: 'Abbeville Somme Karting', city: 'Abbeville', address: 'Route du Plessiel', postal_code: '80100', region: 'Somme', is_indoor: false, length_m: 1163, kart_power: 'Kart personnel (licenciés)', is_verified: true, lat: 50.13579, lng: 1.83997,
    description: 'Circuit sportif de 1 163 m réservé aux pilotes licenciés FFSA avec leur propre kart : pas de location loisir. Ouvert toute l’année aux dates publiées par le club, horaires réduits l’hiver.', website: 'https://abbeville-somme-karting.fr/', phone: '06 32 85 26 11' },
  { id: 't97', name: 'Ardennes Karting', city: 'Douzy', address: 'Aérodrome de Douzy, route de Mouzon', postal_code: '08140', region: 'Ardennes', is_indoor: true, length_m: 435, kart_power: 'Électrique', is_verified: true, lat: 49.66236, lng: 5.04519,
    description: 'Karting électrique indoor de 435 m sur l’aérodrome de Douzy, près de Sedan. Ouvert toute l’année : du mercredi au dimanche hors vacances, 7 j/7 pendant les vacances (fermé le 25 décembre).', website: 'https://ardenneskarting.fr/', phone: '03 24 27 23 25' },
  { id: 't98', name: 'Karting Loisirs de Lonny', city: 'Lonny', address: '20 rue de la Gare', postal_code: '08150', region: 'Ardennes', is_indoor: false, length_m: 600, kart_power: '270cc · 100cc enfant', is_verified: true, lat: 49.81076, lng: 4.585746,
    description: 'Piste extérieure de 600 m près de Charleville-Mézières, karts 4 temps 270cc adultes et 100cc enfants. Saison de mars à octobre, parfois jusqu’à fin novembre selon la météo : mercredi, vendredi et week-end, 7 j/7 pendant les vacances.', website: 'https://www.karting-lonny.fr/', phone: '03 24 54 99 82' },
  { id: 't99', name: 'DB Karting', city: 'Saint-Lyé', address: 'Route D619, ZI La Perrière', postal_code: '10180', region: 'Aube', is_indoor: false, length_m: 680, kart_power: '120 / 270cc', is_verified: true, lat: 48.358, lng: 3.995,
    description: 'Piste extérieure de 680 m au nord-ouest de Troyes, karts 4 temps 270cc adultes et 120cc enfants. Saison annoncée de février à novembre : appelle pour les horaires.', website: 'https://www.dbkarting.fr/', phone: '06 61 07 80 09' },
  { id: 't100', name: 'Kart’Race', city: 'Witry-lès-Reims', address: 'Route de Berru', postal_code: '51420', region: 'Marne', is_indoor: false, length_m: 1154, kart_power: 'Thermique', is_verified: true, lat: 49.2903, lng: 4.11564,
    description: 'Grand circuit extérieur de 1 154 m à l’est de Reims. Ouvert toute l’année selon la météo et le planning : sessions publiques et événements, consulte le planning en ligne.', website: 'https://kartrace.org/', phone: '03 26 49 64 08' },
  { id: 't101', name: 'Karting 51', city: 'Cormontreuil', address: '43 rue du Commerce', postal_code: '51350', region: 'Marne', is_indoor: true, length_m: 400, kart_power: 'Sodi RT10 270cc', is_verified: true, lat: 49.2165, lng: 4.0522,
    description: 'Karting indoor de 400 m au sud de Reims, karts Sodi 270cc, avec Lasermaxx. Ouvert 7 j/7 toute l’année, horaires élargis pendant les vacances.', website: 'https://www.karting-51.com/', phone: '07 65 78 35 03' },
  { id: 't102', name: 'Karting Belval', city: 'Belval-sous-Châtillon', address: 'Lieu-dit Grand Pré', postal_code: '51480', region: 'Marne', is_indoor: false, length_m: 868, kart_power: '9 / 13 / 24 ch', is_verified: true, lat: 49.11584, lng: 3.84813,
    description: 'Piste extérieure de 868 m au cœur de la Montagne de Reims, karts de 9, 13 et 24 ch selon la formule. Location le week-end et les jours fériés dès 14 h 30, toute l’année selon la météo.', website: 'https://www.karting-belval.fr/', phone: '03 26 58 14 59' },
  { id: 't103', name: 'Games Factory Reims', city: 'Reims', address: '17 rue Jacques de La Giraudière', postal_code: '51100', region: 'Marne', is_indoor: true, length_m: 386, kart_power: 'Électrique', is_verified: true, lat: 49.2583, lng: 4.0317,
    description: 'Karting électrique indoor de 386 m dans le complexe Games Factory, avec bowling et loisirs. Ouvert toute l’année.', website: 'https://gamesfactory.fr/reims/karting/', phone: '03 67 61 08 73' },
  { id: 't104', name: 'Kart 52', city: 'Foulain', address: '9 route de Nogent', postal_code: '52800', region: 'Haute-Marne', is_indoor: false, length_m: 710, kart_power: 'Thermique', is_verified: true, lat: 48.03908, lng: 5.21458,
    description: 'L’ancien Paintkart 52, près de Chaumont : piste extérieure de 710 m. Ouvert toute l’année avec des horaires selon la saison.', website: 'https://kart52.fr/', phone: '06 17 42 47 45' },
  { id: 't105', name: 'Karting Oberlin', city: 'Nancy', address: '62 rue Oberlin', postal_code: '54000', region: 'Meurthe-et-Moselle', is_indoor: true, length_m: null, kart_power: 'Sodi SR5 200cc', is_verified: true, lat: 48.6881, lng: 6.1734,
    description: 'Karting indoor de plus de 650 m en plein Nancy, karts Sodi SR5 200cc. Ouvert toute l’année.', website: 'https://www.kart-oberlin.com/', phone: '06 46 32 57 58' },
  { id: 't106', name: 'NTKart', city: 'Lexy', address: 'ZAC Les Quémènes, 1 rue des Petites', postal_code: '54720', region: 'Meurthe-et-Moselle', is_indoor: true, length_m: 700, kart_power: 'Thermique', is_verified: true, lat: 49.5102, lng: 5.71823,
    description: 'Karting indoor multi-niveaux de 700 m près de Longwy et du Luxembourg. Ouvert toute l’année.', website: 'https://ntkart.com/', phone: '03 82 23 79 39' },
  { id: 't107', name: 'Kart’Hell', city: 'Barisey-au-Plain', address: '1 Pâquis de Naveroy', postal_code: '54170', region: 'Meurthe-et-Moselle', is_indoor: false, length_m: 470, kart_power: 'Thermique', is_verified: true, lat: 48.53157, lng: 5.86816,
    description: 'L’ancien Karting Sud Toulois, repris en 2026 : piste extérieure de 470 m. Vendredi, samedi et dimanche de 14 h à 18 h selon la météo, groupes en semaine sur demande.', website: 'https://karthell.fr/', phone: '06 58 94 81 17' },
  { id: 't108', name: 'Karting 55', city: 'Verdun', address: 'Boulevard Stratégique', postal_code: '55100', region: 'Meuse', is_indoor: false, length_m: 420, kart_power: 'Sodi GT5R', is_verified: true, lat: 49.15893, lng: 5.38673,
    description: 'Piste extérieure d’environ 420 m à Verdun, karts Sodi GT5R. Saison du 15 mars au 15 novembre 2026, fermé le mercredi.', website: 'https://k55.fr/', phone: '06 07 11 87 15' },
  { id: 't109', name: 'SKLC 55 Karting Loisir', city: 'Chaumont-sur-Aire', address: 'La Haie la Gougne', postal_code: '55260', region: 'Meuse', is_indoor: false, length_m: 713, kart_power: 'Thermique', is_verified: true, lat: 48.923999, lng: 5.249929,
    description: 'Circuit extérieur de 713 m ouvert en juin 2026, entre Bar-le-Duc et Verdun. Toute l’année, uniquement sur réservation par téléphone, selon la météo.', website: 'https://www.sklc55.fr/', phone: '06 07 82 62 09' },
  { id: 't110', name: 'Metz Kart Indoor', city: 'Augny', address: 'Rue Carcantin, ZAC d’Augny', postal_code: '57685', region: 'Moselle', is_indoor: true, length_m: 700, kart_power: 'Thermique', is_verified: true, lat: 49.07684, lng: 6.10859,
    description: 'Karting indoor thermique de 700 m au sud de Metz (Games Factory). Ouvert toute l’année, horaires selon les vacances.', website: 'https://gamesfactory.fr/metz/', phone: '03 72 39 63 20' },
  { id: 't111', name: 'PK Lommerange', city: 'Lommerange', address: 'Route de Fontoy (D58)', postal_code: '57650', region: 'Moselle', is_indoor: false, length_m: 800, kart_power: 'Thermique', is_verified: true, lat: 49.33107, lng: 5.96942,
    description: 'Piste extérieure de 800 m entre Thionville et Longwy. Ouvert toute l’année selon le planning et la météo.', website: 'https://www.pkl-lommerange.fr/', phone: '03 82 84 90 25' },
  { id: 't112', name: 'Wattkart', city: 'Phalsbourg', address: '7 rue de l’Europe', postal_code: '57370', region: 'Moselle', is_indoor: true, length_m: 200, kart_power: 'Électrique', is_verified: true, lat: 48.7673, lng: 7.2636,
    description: 'Petit karting électrique indoor de 200 m à Phalsbourg. Ouvert toute l’année.', website: 'https://www.karting-phalsbourg.fr/', phone: '09 86 28 50 60' },
  { id: 't113', name: 'Karting Meisenthal', city: 'Meisenthal', address: 'Rue du Moulin', postal_code: '57960', region: 'Moselle', is_indoor: false, length_m: 750, kart_power: 'Sodi RX8 13 ch · 160 / 390cc', is_verified: true, lat: 48.97566, lng: 7.32917,
    description: 'L’ancien Wheel Stunt Valley, dans les Vosges du Nord : piste extérieure de 750 m, karts Sodi RX8 de 13 ch. D’avril à octobre le mercredi, le vendredi et le week-end de 10 h à 19 h sur réservation (aussi le jeudi en juillet-août), de novembre à mars selon la météo.', website: 'https://www.karting-meisenthal.com/', phone: '03 87 96 97 40' },
  { id: 't114', name: 'Kart Indoor Chrono', city: 'Fegersheim', address: 'Rue du Colonel Lilly', postal_code: '67640', region: 'Bas-Rhin', is_indoor: true, length_m: 400, kart_power: 'Thermique · mini-karts électriques', is_verified: true, lat: 48.50282, lng: 7.69552,
    description: 'Karting indoor de 400 m au sud de Strasbourg, mini-karts électriques pour les enfants. Ouvert toute l’année.', website: 'https://www.kartindoorchrono.fr/', phone: '03 88 59 03 40' },
  { id: 't115', name: 'Sélest’Kart-IN', city: 'Sélestat', address: 'Route de Bergheim, CIRSUD bâtiment F', postal_code: '67600', region: 'Bas-Rhin', is_indoor: true, length_m: 340, kart_power: 'Thermique', is_verified: true, lat: 48.25229, lng: 7.43163,
    description: 'Karting indoor de 340 m à Sélestat. Ouvert toute l’année.', website: 'https://selestkart-in.com/', phone: '03 88 82 77 21' },
  { id: 't116', name: 'Stras Kart', city: 'Eckbolsheim', address: 'Zone du Parc', postal_code: '67201', region: 'Bas-Rhin', is_indoor: true, length_m: 400, kart_power: 'Électrique', is_verified: true, lat: 48.58, lng: 7.6829,
    description: 'Karting électrique indoor multi-niveaux de 400 m à l’ouest de Strasbourg. Ouvert toute l’année.', website: 'https://www.straskart.fr/', phone: '03 67 86 00 16' },
  { id: 't117', name: 'BAX Kart', city: 'Brumath', address: '21 rue de l’Industrie', postal_code: '67170', region: 'Bas-Rhin', is_indoor: false, length_m: null, kart_power: 'Électrique Sodi RXS2', is_verified: true, lat: 48.74547, lng: 7.69359,
    description: 'Karting électrique extérieur de plus de 300 m au complexe Bax Bowling de Brumath, karts Sodi RXS2. Ouvert toute l’année selon la météo et sur réservation.', website: 'https://karting.baxbowling.fr/', phone: '03 90 29 92 20' },
  { id: 't118', name: 'SpeedPark Strasbourg', city: 'Reichstett', address: '6 boulevard des Enseignes, Shopping Promenade', postal_code: '67116', region: 'Bas-Rhin', is_indoor: true, length_m: null, kart_power: 'Électrique', is_verified: true, lat: 48.655, lng: 7.737,
    description: 'Karting électrique indoor au Shopping Promenade, au nord de Strasbourg, avec bowling et loisirs. Ouvert toute l’année.', website: 'https://speedpark.fr/strasbourg/karting/', phone: '03 88 62 00 10' },
  { id: 't119', name: 'Sundgau Kart', city: 'Steinsoultz', address: '1 voie Romaine', postal_code: '68640', region: 'Haut-Rhin', is_indoor: false, length_m: 1400, kart_power: '270cc', is_verified: true, lat: 47.571944, lng: 7.365,
    description: 'Grand circuit extérieur de 1 400 m dans le Sundgau, près de Bâle et Mulhouse, karts 4 temps 270cc. Ouvert toute l’année selon la météo et le calendrier.', website: 'https://www.sundgaukart.com/', phone: '03 89 07 77 88' },
  { id: 't120', name: 'Wakalase Cernay', city: 'Cernay', address: 'Place des Étoiles', postal_code: '68700', region: 'Haut-Rhin', is_indoor: true, length_m: 450, kart_power: 'Électrique Sodikart LRX', is_verified: true, lat: 47.79545, lng: 7.16312,
    description: 'Karting électrique indoor multi-niveaux de 450 m près de Mulhouse, karts Sodikart. Ouvert toute l’année.', website: 'https://cernay.wakalase.com/fr/', phone: '09 74 19 77 50' },
  { id: 't121', name: 'Indypark', city: 'Le Ménil', address: '31 route du Surdelot', postal_code: '88160', region: 'Vosges', is_indoor: true, length_m: 250, kart_power: 'Thermique', is_verified: true, lat: 47.9165, lng: 6.8206,
    description: 'Karting indoor de 250 m dans les Hautes-Vosges, avec drift trike. Du mercredi au dimanche hors vacances, le lundi et du mercredi au dimanche pendant les vacances.', website: 'https://indypark.fr/', phone: '03 29 25 34 17' },
  { id: 't122', name: 'Le Kart Saint-Gorgon', city: 'Saint-Gorgon', address: '12 rue de Rond Pré', postal_code: '88700', region: 'Vosges', is_indoor: true, length_m: 490, kart_power: '200cc · 160cc enfant · biplace', is_verified: true, lat: 48.3218, lng: 6.6549,
    description: 'Karting indoor de 490 m près de Rambervillers, karts 200cc adultes, 160cc enfants et biplace 270cc. Ouvert toute l’année.', website: 'https://le-kart.fr/', phone: '03 29 39 64 90' },
  { id: 't123', name: 'Manacha Kart', city: 'Gerbépal', address: '2 col du Plafond', postal_code: '88430', region: 'Vosges', is_indoor: false, length_m: 600, kart_power: '160 / 270cc', is_verified: true, lat: 48.15124, lng: 6.92289,
    description: 'Piste extérieure de 600 m au col du Plafond, près de Gérardmer, karts 160 et 270cc. Ouvert toute l’année avec des horaires d’été (de Pâques à la Toussaint) et d’hiver.', website: 'https://manachakart.com/', phone: '03 29 57 03 18' },
  { id: 't124', name: 'Ideal Kart France', city: 'Juvaincourt', address: '240 rue de Champagne, Aéropole Sud Lorraine', postal_code: '88500', region: 'Vosges', is_indoor: false, length_m: 1267, kart_power: 'Location et sport', is_verified: true, lat: 48.31996, lng: 6.07775,
    description: 'Grand circuit de 1 267 m sur l’aéropole de Mirecourt : location grand public et roulage sportif (licence pour les karts personnels). Du 1er avril au 6 décembre 2026, tous les jours sauf le mardi de 9 h à 18 h, réservation conseillée.', website: 'https://www.ideal-kart-france.com/', phone: '03 29 37 60 60' },
];

export const demoTracks: Track[] = demoTrackDetails.map(({ id, name, city }) => ({ id, name, city }));

/** Copie modifiable : en mode démo, les actions (défier, accepter, valider…) la mettent à jour. */
export const demoChallenges: Challenge[] = [
  {
    id: 'c1',
    challenger_id: 'p1',
    opponent_id: 'demo-me',
    status: 'pending',
    format: 'position',
    scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    message: 'Revanche samedi ? 🏁',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    challenger: pilot('p1', 'TurboLéa', 1342, 'argent'),
    opponent: pilot('demo-me', 'Mael_44', 1286, 'argent'),
    track: { id: 't1', name: 'SpeedPark Angers', city: 'Beaucouzé' },
    match: null,
  },
  {
    id: 'c2',
    challenger_id: 'demo-me',
    opponent_id: 'p2',
    status: 'accepted',
    format: 'lap_time',
    scheduled_at: new Date(Date.now() + 5 * 86400000).toISOString(),
    message: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    challenger: pilot('demo-me', 'Mael_44', 1286, 'argent'),
    opponent: pilot('p2', 'Drift_Max', 1198, 'bronze'),
    track: { id: 't2', name: 'MK Racing', city: 'Saint-Christophe-du-Bois' },
    match: null,
  },
  {
    id: 'c3',
    challenger_id: 'p3',
    opponent_id: 'demo-me',
    status: 'accepted',
    format: 'position',
    scheduled_at: new Date(Date.now() - 86400000).toISOString(),
    message: null,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    expires_at: new Date().toISOString(),
    challenger: pilot('p3', 'ApexHunter', 1467, 'or'),
    opponent: pilot('demo-me', 'Mael_44', 1286, 'argent'),
    track: { id: 't1', name: 'SpeedPark Angers', city: 'Beaucouzé' },
    match: {
      id: 'm3',
      submitted_by: 'p3',
      status: 'awaiting_confirmation',
      winner_id: 'demo-me',
      challenger_position: 2,
      opponent_position: 1,
      challenger_best_lap_ms: null,
      opponent_best_lap_ms: null,
      challenger_confirmed_at: new Date().toISOString(),
      opponent_confirmed_at: null,
      dispute_reason: null,
    },
  },
];

export const demoNearby: NearbyPilot[] = [
  { id: 'p1', username: 'TurboLéa', avatar_url: null, elo: 1342, rank: 'argent', wins: 18, losses: 7, distance_km: 2.4 },
  { id: 'p2', username: 'Drift_Max', avatar_url: null, elo: 1198, rank: 'bronze', wins: 9, losses: 11, distance_km: 4.1 },
  { id: 'p3', username: 'ApexHunter', avatar_url: null, elo: 1467, rank: 'or', wins: 26, losses: 8, distance_km: 7.8 },
  { id: 'p4', username: 'KartiNono', avatar_url: null, elo: 1040, rank: 'novice', wins: 2, losses: 3, distance_km: 12.5 },
];

export const demoLeaderboard: LeaderboardEntry[] = [
  { id: 'p5', username: 'Senna_Jr', avatar_url: null, elo: 1892, rank: 'legende', wins: 61, losses: 12, position: 1 },
  { id: 'p6', username: 'LateBraker', avatar_url: null, elo: 1734, rank: 'diamant', wins: 44, losses: 15, position: 2 },
  { id: 'p7', username: 'RedLine', avatar_url: null, elo: 1611, rank: 'platine', wins: 38, losses: 17, position: 3 },
  { id: 'p3', username: 'ApexHunter', avatar_url: null, elo: 1467, rank: 'or', wins: 26, losses: 8, position: 4 },
  { id: 'p1', username: 'TurboLéa', avatar_url: null, elo: 1342, rank: 'argent', wins: 18, losses: 7, position: 5 },
  { id: 'demo-me', username: 'Mael_44', avatar_url: null, elo: 1286, rank: 'argent', wins: 14, losses: 9, position: 6 },
  { id: 'p2', username: 'Drift_Max', avatar_url: null, elo: 1198, rank: 'bronze', wins: 9, losses: 11, position: 7 },
];

// Écarts ≤ 24 points : K = 24 pour un pilote qui a plus de 10 matchs.
export const demoEloHistory: EloPoint[] = [1150, 1168, 1156, 1177, 1193, 1178, 1200, 1219, 1208, 1228, 1245, 1262, 1286].map(
  (elo, i, all) => ({
    elo_after: elo,
    delta: i === 0 ? 0 : elo - all[i - 1],
    created_at: new Date(Date.now() - (all.length - i) * 5 * 86400000).toISOString(),
  }),
);

/** Profil d'un autre pilote de démo, reconstitué depuis le classement et la liste « à proximité ». */
export function demoPilot(id: string): Profile | null {
  if (id === demoProfile.id) return demoState.hasProfile ? demoProfile : null;
  const p = [...demoLeaderboard, ...demoNearby].find((x) => x.id === id);
  if (!p) return null;
  return {
    id: p.id,
    username: p.username,
    avatar_url: null,
    kart_number: (p.username.length * 7) % 99 + 1,
    home_track_id: null,
    elo: p.elo,
    rank: p.rank,
    wins: p.wins,
    losses: p.losses,
    draws: 0,
    matches_played: p.wins + p.losses,
    race_count: 0,
    race_wins: 0,
    race_podiums: 0,
    is_discoverable: true,
    home_track: null,
  };
}

/** Courbe ELO d'exemple qui se termine à l'ELO actuel du pilote. */
export function demoEloHistoryFor(profile: Profile): EloPoint[] {
  if (profile.id === demoProfile.id) {
    // Licence créée pendant la démo : aucun match encore.
    return demoProfile.matches_played === 0 ? [] : [...demoEloHistory];
  }
  const shift = profile.elo - demoEloHistory[demoEloHistory.length - 1].elo_after;
  return demoEloHistory.map((p) => ({ ...p, elo_after: p.elo_after + shift }));
}

const rivals = ['TurboLéa', 'Drift_Max', 'ApexHunter', 'KartiNono', 'RedLine'];

/** Derniers matchs d'exemple, déduits de la courbe ELO (gain = victoire, perte = défaite). */
export function demoMatchesFor(profile: Profile): PilotMatch[] {
  const history = demoEloHistoryFor(profile).slice(1).reverse();
  const opponents = rivals.filter((r) => r !== profile.username);
  return history.slice(0, 6).map((p, i) => ({
    match_id: `dm-${profile.id}-${i}`,
    confirmed_at: p.created_at,
    opponent_id: [...demoNearby, ...demoLeaderboard].find((x) => x.username === opponents[i % opponents.length])?.id ?? 'p1',
    opponent_username: opponents[i % opponents.length],
    track_name: demoTracks[i % demoTracks.length].name,
    format: i % 3 === 0 ? 'lap_time' : 'position',
    outcome: p.delta > 0 ? 'win' : p.delta < 0 ? 'loss' : 'draw',
    elo_delta: p.delta,
  }));
}

/** Meilleurs tours d'exemple (ms), cohérents avec la longueur de chaque piste. */
const demoLaps: Record<string, [string, number][]> = {
  t1: [['p3', 24812], ['demo-me', 25134], ['p1', 25390], ['p2', 26020]],
  t2: [['p6', 44208], ['demo-me', 45310], ['p7', 45640]],
  t3: [['p5', 38905], ['p3', 39420], ['demo-me', 40118]],
  t4: [['p1', 29776], ['p4', 31402]],
  t5: [],
};

export function demoTrackLapRecords(trackId: string): TrackLapRecord[] {
  return (demoLaps[trackId] ?? []).map(([pilotId, lap], i) => {
    const p = demoPilot(pilotId);
    return {
      position: i + 1,
      pilot_id: pilotId,
      username: p?.username ?? 'Pilote',
      avatar_url: p?.avatar_url ?? null,
      rank: p?.rank ?? 'novice',
      lap_ms: lap,
      set_at: new Date(Date.now() - (i + 2) * 6 * 86400000).toISOString(),
    };
  });
}

export function demoPilotLapRecords(pilotId: string): PilotLapRecord[] {
  return demoTrackDetails
    .map((t) => {
      const laps = demoLaps[t.id] ?? [];
      const i = laps.findIndex(([id]) => id === pilotId);
      if (i < 0) return null;
      return {
        track_id: t.id,
        track_name: t.name,
        lap_ms: laps[i][1],
        set_at: new Date(Date.now() - (i + 2) * 6 * 86400000).toISOString(),
        position: i + 1,
        pilots: laps.length,
      };
    })
    .filter((r): r is PilotLapRecord => r !== null)
    .sort((a, b) => a.position - b.position);
}

export function demoTrackRecords(): TrackRecord[] {
  return Object.entries(demoLaps)
    .filter(([, laps]) => laps.length > 0)
    .map(([trackId, laps]) => ({ track_id: trackId, lap_ms: laps[0][1], username: demoPilot(laps[0][0])?.username ?? 'Pilote' }));
}

const racePilot = (id: string) => {
  const p = demoPilot(id);
  return { id, username: p?.username ?? 'Pilote', avatar_url: p?.avatar_url ?? null, elo: p?.elo ?? 1000, rank: p?.rank ?? 'novice' };
};
const entry = (id: string, status: 'invited' | 'accepted' | 'declined', position: number | null = null, confirmed = false) => ({
  pilot_id: id,
  status,
  position,
  best_lap_ms: null,
  confirmed_at: confirmed ? new Date().toISOString() : null,
  pilot: racePilot(id),
});

/** Courses d'exemple : une invitation reçue, et un résultat à valider. Modifiées en place par les actions. */
export const demoRaces: Race[] = [
  {
    id: 'r1',
    organizer_id: 'p3',
    scheduled_at: new Date(new Date(Date.now() + 3 * 86400000).setHours(15, 0, 0, 0)).toISOString(),
    format: 'position',
    message: 'Grand prix du samedi : qui monte sur le podium ?',
    status: 'open',
    submitted_at: null,
    confirmed_at: null,
    dispute_reason: null,
    created_at: new Date().toISOString(),
    track: { id: 't3', name: 'Inwall Kart', city: 'Les Ponts-de-Cé' },
    entries: [entry('p3', 'accepted'), entry('p1', 'accepted'), entry('demo-me', 'invited'), entry('p2', 'invited'), entry('p4', 'invited')],
  },
  {
    id: 'r2',
    organizer_id: 'p1',
    scheduled_at: new Date(new Date(Date.now() - 86400000).setHours(19, 0, 0, 0)).toISOString(),
    format: 'position',
    message: null,
    status: 'awaiting_confirmation',
    submitted_at: new Date(Date.now() - 3600000).toISOString(),
    confirmed_at: null,
    dispute_reason: null,
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    track: { id: 't1', name: 'SpeedPark Angers', city: 'Beaucouzé' },
    entries: [entry('p1', 'accepted', 2, true), entry('demo-me', 'accepted', 1), entry('p2', 'accepted', 3), entry('p4', 'accepted', 4)],
  },
];

/** Catalogue de la boutique (copie de la migration 20261020000016_user_gear.sql). */
export const demoGearCatalog: GearItem[] = (
  [
    ['helmet-rental', 'helmet', 'Casque de location', 'starter', 0, null],
    ['helmet-street', 'helmet', 'Casque Street', 'common', 150, null],
    ['helmet-neon', 'helmet', 'Casque Néon Rush', 'rare', 400, null],
    ['helmet-thunder', 'helmet', 'Casque Thunder', 'rare', 0, 'argent'],
    ['helmet-inferno', 'helmet', 'Casque Inferno', 'epic', 900, null],
    ['helmet-crown', 'helmet', "Casque Couronne d'Or", 'legendary', 0, 'or'],
    ['suit-rental', 'suit', 'Combinaison de location', 'starter', 0, null],
    ['suit-classic', 'suit', 'Combinaison Classic', 'common', 150, null],
    ['suit-neon', 'suit', 'Combinaison Néon Rush', 'rare', 450, null],
    ['suit-thunder', 'suit', 'Combinaison Thunder', 'rare', 0, 'argent'],
    ['suit-carbon', 'suit', 'Combinaison Carbone', 'epic', 1000, null],
    ['suit-champion', 'suit', 'Combinaison Champion', 'legendary', 0, 'platine'],
    ['gloves-rental', 'gloves', 'Gants de location', 'starter', 0, null],
    ['gloves-grip', 'gloves', 'Gants Grip', 'common', 100, null],
    ['gloves-neon', 'gloves', 'Gants Néon Rush', 'rare', 300, null],
    ['gloves-inferno', 'gloves', 'Gants Inferno', 'epic', 700, null],
    ['gloves-gold', 'gloves', 'Gants Or Pur', 'legendary', 0, 'or'],
    ['shoes-rental', 'shoes', 'Bottines de location', 'starter', 0, null],
    ['shoes-sprint', 'shoes', 'Bottines Sprint', 'common', 100, null],
    ['shoes-neon', 'shoes', 'Bottines Néon Rush', 'rare', 300, null],
    ['shoes-thunder', 'shoes', 'Bottines Thunder', 'rare', 0, 'argent'],
    ['shoes-carbon', 'shoes', 'Bottines Carbone', 'epic', 700, null],
    ['rib-rental', 'rib_protector', 'Protège-côtes de location', 'starter', 0, null],
    ['rib-shield', 'rib_protector', 'Protège-côtes Shield', 'common', 120, null],
    ['rib-neon', 'rib_protector', 'Protège-côtes Néon', 'rare', 350, null],
    ['rib-titan', 'rib_protector', 'Protège-côtes Titan', 'epic', 800, null],
    ['rib-legend', 'rib_protector', 'Protège-côtes Légende', 'legendary', 0, 'diamant'],
  ] as const
).map(([id, slot, name, rarity, price, unlock_rank], sort) => ({ id, slot, name, rarity, price, unlock_rank, sort }));

/** Solde du pilote démo (modifié en place par les achats). */
export const demoWallet = { points: 640 };

/** Garages des pilotes démo (modifiés en place par les achats et changements d'équipement). */
const demoGarages: Record<string, Garage> = {
  'demo-me': { owned: ['helmet-neon', 'gloves-grip'], equipped: { helmet: 'helmet-neon', gloves: 'gloves-grip' } },
  p1: {
    owned: ['helmet-inferno', 'suit-carbon', 'gloves-inferno', 'shoes-carbon', 'rib-titan', 'helmet-thunder'],
    equipped: { helmet: 'helmet-inferno', suit: 'suit-carbon', gloves: 'gloves-inferno', shoes: 'shoes-carbon', rib_protector: 'rib-titan' },
  },
  p3: {
    owned: ['helmet-crown', 'gloves-gold', 'suit-thunder'],
    equipped: { helmet: 'helmet-crown', gloves: 'gloves-gold', suit: 'suit-thunder' },
  },
};

export function demoGarageFor(profileId: string): Garage {
  return (demoGarages[profileId] ??= { owned: [], equipped: {} });
}

/** Achat / récompense en démo, mêmes règles et codes d'erreur que buy_gear_item(). */
export function demoBuyGearItem(profileId: string, item: GearItem) {
  const garage = demoGarageFor(profileId);
  const me = demoPilot(profileId);
  if (item.rarity === 'starter' || garage.owned.includes(item.id)) throw new Error('ALREADY_OWNED');
  if (item.unlock_rank && me && !rankAtLeast(me.rank, item.unlock_rank)) throw new Error('RANK_REQUIRED');
  if (demoWallet.points < item.price) throw new Error('NOT_ENOUGH_POINTS');
  demoWallet.points = demoWallet.points - item.price;
  garage.owned.push(item.id);
  garage.equipped[item.slot] = item.id;
}

/** Changement d'équipement en démo, mêmes règles que equip_gear_item(). */
export function demoEquipGearItem(profileId: string, item: GearItem) {
  const garage = demoGarageFor(profileId);
  if (item.rarity === 'starter') delete garage.equipped[item.slot];
  else if (garage.owned.includes(item.id)) garage.equipped[item.slot] = item.id;
  else throw new Error('NOT_OWNED');
}
