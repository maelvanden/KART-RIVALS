-- Kart Rivals : kartings en activité en Ille-et-Vilaine (35), d'après le recensement du 19 octobre 2026 (7 circuits
-- + BattleKart). Coordonnées du recensement ; SpeedPark Rennes (repère du centre commercial) et Kids Racing Land
-- (voisin du Roazhon Kart) sont approximatives et corrigeables depuis l'administration.
insert into public.tracks (name, address, postal_code, city, region, is_indoor, length_m, kart_power, is_verified, location, created_by,
                           website, phone, description)
values
  ('Actarus Karting', '12 Le Clos d’Ahaut', '35550', 'Lohéac', 'Ille-et-Vilaine', false, 1250, 'Sodi SR4 · Rotax 125 · Kid', true,
   extensions.st_setsrid(extensions.st_makepoint(-1.897513, 47.866881), 4326)::extensions.geography, null,
   'https://www.actarus-loheac.fr/', '02 99 34 13 13',
   'Le complexe karting de Lohéac, à côté du circuit de rallycross : piste loisir de 650 m en Sodi SR4 4 temps (Sodi Kid pour les enfants) et circuit compétition de 1 250 m (ASK Lohéac) en location encadrée, avec Rotax 125 2 temps. Ouvert toute l''année : mercredi et vendredi après-midi et le week-end hors vacances, du mardi au dimanche pendant les vacances.'),
  ('Karting de Saint-Malo', 'Lieu-dit Les Nielles', '35350', 'Saint-Méloir-des-Ondes', 'Ille-et-Vilaine', false, 902, '160 / 270cc · électrique enfant', true,
   extensions.st_setsrid(extensions.st_makepoint(-1.865678, 48.631452), 4326)::extensions.geography, null,
   'https://www.karting-saint-malo.com/', '02 99 89 16 88',
   'Piste extérieure de 902 m près de Saint-Malo, karts 270cc adultes, 160cc juniors et baby-karts électriques. Ouvert de février à décembre : du mercredi au dimanche de février à octobre, vendredi après-midi et week-end en novembre-décembre, 7 j/7 pendant les vacances scolaires. Janvier non précisé : appelle avant.'),
  ('Karting Rennes Cap Malo', 'Centre commercial Cap Malo, avenue du Phare du Grand Léjon', '35520', 'Melesse', 'Ille-et-Vilaine', true, 600, 'Sodi SR5 · LR6 junior', true,
   extensions.st_setsrid(extensions.st_makepoint(-1.72219, 48.1997), 4326)::extensions.geography, null,
   'https://karting-rennes.fr/', '02 23 07 23 47',
   'Karting indoor de 600 m au parc de loisirs Cap Malo, au nord de Rennes : karts Sodi SR5 4 temps adultes et LR6 juniors. Ouvert 7 j/7 toute l''année : en semaine de 15 h à minuit, samedi de 10 h à minuit, dimanche de 10 h à 20 h (horaires adaptés pendant les vacances).'),
  ('Roazhon Kart', '27 rue des Merisiers', '35520', 'La Mézière', 'Ille-et-Vilaine', true, 500, '270cc 9 ch · 160cc junior', true,
   extensions.st_setsrid(extensions.st_makepoint(-1.73342, 48.20174), 4326)::extensions.geography, null,
   'https://roazhonkart.com/', '02 99 59 08 97',
   'Karting indoor de 500 m à La Mézière : Sodi SR-5 270cc (9 ch) pour les adultes, LR-5 160cc pour les juniors. Hors vacances, du mercredi au dimanche à horaires fixes (lundi et mardi sur réservation) ; 7 j/7 pendant les vacances.'),
  ('Karting’s Passion', 'La Bruère', '35500', 'Saint-Aubin-des-Landes', 'Ille-et-Vilaine', false, 480, 'Sodi GT4 10 ch · Fun Kid', true,
   extensions.st_setsrid(extensions.st_makepoint(-1.2878291, 48.1017259), 4326)::extensions.geography, null,
   'https://sites.google.com/view/kartings-passion', '06 50 73 38 11',
   'Petite piste extérieure (480 m annoncés, 410 m au règlement) près de Vitré : Sodi GT4 de 10 ch pour les adultes, Fun Kid 120cc pour les enfants. Uniquement sur réservation, du lundi au samedi de 9 h à 20 h, toute l''année (fermé le dimanche, le 24 décembre, le 1er janvier et à la Toussaint).'),
  ('SpeedPark Rennes', 'Centre commercial Carrefour, 11 rue de Paris', '35510', 'Cesson-Sévigné', 'Ille-et-Vilaine', true, 202, 'Électrique', true,
   extensions.st_setsrid(extensions.st_makepoint(-1.59154, 48.1127), 4326)::extensions.geography, null,
   'https://speedpark.fr/rennes/karting/', '02 42 07 09 32',
   'Karting électrique indoor de 202 m (8 karts) ouvert en mai 2026 dans la galerie Carrefour de Cesson-Sévigné, avec jeux d''arcade. Ouvert 7 j/7 jusqu''à minuit (1 h le vendredi et le samedi).'),
  ('Kids Racing Land', '33 rue des Merisiers', '35520', 'La Mézière', 'Ille-et-Vilaine', true, null, 'Électrique enfant (3–12 ans)', true,
   extensions.st_setsrid(extensions.st_makepoint(-1.73305, 48.20195), 4326)::extensions.geography, null,
   'https://www.kidsracingland.com/', '07 68 45 86 46',
   'Karting électrique réservé aux enfants de 3 à 12 ans, sur 3 petits circuits indoor. Mercredi, samedi et dimanche de 10 h à 19 h, tous les jours pendant les vacances et les jours fériés. Réservation obligatoire.'),
  ('FunLab BattleKart Rennes', '1 rue de la Tordelière', '35520', 'La Mézière', 'Ille-et-Vilaine', true, null, 'Électrique (karting ludique)', true,
   extensions.st_setsrid(extensions.st_makepoint(-1.72732, 48.19182), 4326)::extensions.geography, null,
   'https://www.funlab.bzh/battlekart', '02 59 16 13 05',
   'BattleKart : karting électrique en réalité augmentée dans une salle de 1 950 m², circuits et jeux projetés au sol (course, batailles). Pas une piste de karting classique. Ouvert du mardi au dimanche, réservation fortement conseillée.')
on conflict ((lower(name)), (lower(city))) do update set
  address = excluded.address, postal_code = excluded.postal_code, region = excluded.region, is_indoor = excluded.is_indoor,
  length_m = excluded.length_m, kart_power = excluded.kart_power, is_verified = true, location = excluded.location,
  website = coalesce(public.tracks.website, excluded.website), phone = coalesce(public.tracks.phone, excluded.phone),
  description = coalesce(public.tracks.description, excluded.description);
