-- Kart Rivals : kartings en activité dans la Sarthe (72), d'après le recensement du 19 octobre 2026 (4 circuits
-- classiques + BattleKart). Coordonnées du recensement (annuaires géolocalisés / OpenStreetMap).
insert into public.tracks (name, address, postal_code, city, region, is_indoor, length_m, kart_power, is_verified, location, created_by,
                           website, phone, description)
values
  ('Karting des 24 Heures du Mans', 'Route du Chemin aux Bœufs', '72100', 'Le Mans', 'Sarthe', false, 1400, '160 / 270 / 390cc · Rotax', true,
   extensions.st_setsrid(extensions.st_makepoint(0.214265, 47.940384), 4326)::extensions.geography, null,
   'https://www.lemans-karting.com/', '02 43 40 21 40',
   'Trois circuits au pied du circuit des 24 Heures : piste internationale de 1 400 m (selon les créneaux, parfois réservée aux licenciés), circuit Alain Prost de 980 m et Indy-Kart de 805 m. Karts 4 temps 160, 270 et 390cc et Rotax 2 temps. Ouvert toute l''année, réservation en ligne conseillée.'),
  ('Racing Kart du Mans', 'Les Vinettes', '72450', 'Montfort-le-Gesnois', 'Sarthe', false, 1150, '120 / 270 / 390cc · Rotax', true,
   extensions.st_setsrid(extensions.st_makepoint(0.422, 48.03707), 4326)::extensions.geography, null,
   'https://www.racingkartdumans.com/', '02 43 54 03 03',
   'L''ancien circuit de Soulitré : piste compétition de 1 150 m et piste loisir de 900 m, karts 4 temps 120, 270 et 390cc et Rotax 2 temps. Ouvert toute l''année, notamment le mercredi et le week-end : vérifie le calendrier avant de venir.'),
  ('SpeedPark Le Mans', '1 rue de Villeneuve, ZAC des Portes de l''Océane', '72650', 'Saint-Saturnin', 'Sarthe', true, 300, 'Thermique', true,
   extensions.st_setsrid(extensions.st_makepoint(0.17456, 48.04985), 4326)::extensions.geography, null,
   'https://speedpark.fr/le-mans/karting/', '02 43 29 56 56',
   'Karting indoor thermique d''environ 300 m au nord du Mans, avec bowling et loisirs. Ouvert toute l''année jusque tard le soir (jusqu''à 2 h le vendredi et le samedi), ouverture plus tôt pendant les vacances.'),
  ('K1 Speed Le Mans', '26 avenue du Panorama', '72100', 'Le Mans', 'Sarthe', true, null, 'Électrique (adultes et juniors)', true,
   extensions.st_setsrid(extensions.st_makepoint(0.21797, 47.96321), 4326)::extensions.geography, null,
   'https://www.k1speed.com/fr/le-mans.html', '02 43 31 18 20',
   'Karting indoor 100 % électrique, adultes et juniors, sur une piste avec dénivelés. Ouvert toute l''année : lundi sur réservation, du mardi au dimanche l''après-midi et le soir (jusqu''à 1 h le vendredi et le samedi).'),
  ('BattleKart Le Mans', '105 rue du Parc', '72700', 'Spay', 'Sarthe', true, null, 'Électrique (karting ludique)', true,
   extensions.st_setsrid(extensions.st_makepoint(0.160591, 47.941429), 4326)::extensions.geography, null,
   'https://www.battlekart.com/fr/le-mans', '02 43 25 77 56',
   'Karting ludique : karts électriques interactifs sur des tracés projetés au sol, entre course et jeu vidéo. Pas de longueur fixe, à part du karting classique. Ouvert toute l''année du mercredi au dimanche, horaires adaptés pendant les vacances.')
on conflict ((lower(name)), (lower(city))) do update set
  address = excluded.address, postal_code = excluded.postal_code, region = excluded.region, is_indoor = excluded.is_indoor,
  length_m = excluded.length_m, kart_power = excluded.kart_power, is_verified = true, location = excluded.location,
  website = coalesce(public.tracks.website, excluded.website), phone = coalesce(public.tracks.phone, excluded.phone),
  description = coalesce(public.tracks.description, excluded.description);
