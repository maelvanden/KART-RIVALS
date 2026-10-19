-- Kart Rivals : kartings en activité dans les Côtes-d'Armor (22) et le Morbihan (56), d'après les recensements du
-- 19 octobre 2026 (3 + 4 circuits). Coordonnées des recensements (OpenStreetMap, RES, annuaires géolocalisés).
insert into public.tracks (name, address, postal_code, city, region, is_indoor, length_m, kart_power, is_verified, location, created_by,
                           website, phone, description)
values
  ('Karting de Kerlabo', 'Kerlabo, axe Châtelaudren–Quintin', '22800', 'Cohiniac', 'Côtes-d''Armor', false, 805, '270cc · électrique 17/24 ch', true,
   extensions.st_setsrid(extensions.st_makepoint(-2.94646, 48.44643), 4326)::extensions.geography, null,
   'https://kerlabo-kart.com/', '06 75 78 47 32',
   'Circuit du Leff, homologué FFSA : piste extérieure de 805 m. Karts 4 temps 270cc (RT10, LR6 junior, biplace), Birel E-Kart électriques de 17 et 24 ch et karts électriques enfants. Ouvert toute l''année : samedi, dimanche et jours fériés hors vacances, 7 j/7 pendant les vacances et en juillet-août (horaires selon la saison et la météo).'),
  ('GP Circuit', '3 rue des Frères Piéto, zone des Sports Mécaniques', '22400', 'Lamballe-Armor', 'Côtes-d''Armor', false, 800, '200 / 270cc · Rotax 16–30 ch', true,
   extensions.st_setsrid(extensions.st_makepoint(-2.45089, 48.48852), 4326)::extensions.geography, null,
   'https://gp-circuit.fr/', '02 96 50 09 09',
   'Circuit Guy Pansart, homologué : piste extérieure de 800 m. Fun Kart 200cc (4,5 ch), RS Kart 270cc (9 ch), Rotax 2 temps de 16 et 22 ch (30 ch sur rendez-vous) et biplace. Ouvert toute l''année selon le planning de la semaine, location loisir sans réservation pendant les heures d''ouverture.'),
  ('Plérin Komplex Indoor', '12 rue Jules Lequier', '22190', 'Plérin', 'Côtes-d''Armor', true, 400, '160 / 270cc · biplace', true,
   extensions.st_setsrid(extensions.st_makepoint(-2.7778, 48.54201), 4326)::extensions.geography, null,
   'https://www.le-pki.fr/', '02 96 74 50 40',
   'Karting indoor de 400 m près de Saint-Brieuc : SR4 270cc adultes, LR6 160cc juniors et biplace 2Drive. Hors vacances : mercredi 14 h–21 h, jeudi 16 h–23 h, vendredi 16 h–1 h, samedi 14 h–1 h, dimanche 14 h–19 h ; 7 j/7 pendant les vacances.'),
  ('Kart 56', 'ZA La Madeleine, route de Pont-Fol', '56400', 'Ploemel', 'Morbihan', false, 800, 'Sodi RT10 / LR5 · bioéthanol', true,
   extensions.st_setsrid(extensions.st_makepoint(-3.059598, 47.667334), 4326)::extensions.geography, null,
   'https://www.kart56.com/', '02 97 56 71 71',
   'Piste extérieure de 800 m près de Carnac et Auray : karts Sodi RT10 adultes et LR5 juniors au bioéthanol, mini-karts électriques pour les 3–6 ans. Saison 2026 du 18 mars au 31 décembre (pause en hiver) : du mercredi au dimanche hors vacances, 7 j/7 en vacances. Réservation en ligne obligatoire.'),
  ('Kart Center Pluméliau', '238 rue Gustave Eiffel, ZA Port Arthur', '56930', 'Pluméliau-Bieuzy', 'Morbihan', false, 702, '270 / 390cc · Rotax 22 ch', true,
   extensions.st_setsrid(extensions.st_makepoint(-2.99108, 47.96938), 4326)::extensions.geography, null,
   'https://www.kartcenter56.fr/', '02 97 51 98 11',
   'Piste extérieure éclairée de 702 m : karts 4 temps 270cc adultes, juniors, biplace 390cc, Rotax 2 temps de 22 ch et mini-karts électriques. Ouvert toute l''année avec des horaires selon la saison (en ce moment du mercredi au dimanche, 14 h–18 h 30) ; groupes de 10 et plus sur réservation.'),
  ('Circuit de Guillac', 'La Pyramide, lieu-dit Brangoyan', '56800', 'Guillac', 'Morbihan', false, 680, '120 / 270cc', true,
   extensions.st_setsrid(extensions.st_makepoint(-2.48658, 47.93823), 4326)::extensions.geography, null,
   'https://circuit-de-guillac.com/', '07 86 68 10 75',
   'Circuit de la Pyramide, près de Ploërmel : 618 m selon l''exploitant actuel (680 m dans les anciennes fiches). Karts 4 temps 270cc adultes et 120cc enfants, roulage de karts personnels. Ouvert de février à décembre : du mercredi au dimanche (mercredi, samedi et dimanche en novembre-décembre), tous les jours pendant les vacances. Location sans réservation.'),
  ('SpeedPark Vannes', 'ZAC de Parc Lann, 4 rue Aristide Boucicaut', '56000', 'Vannes', 'Morbihan', true, null, '120 / 200cc', true,
   extensions.st_setsrid(extensions.st_makepoint(-2.79191, 47.670432), 4326)::extensions.geography, null,
   'https://speedpark.fr/sp-vannes/nos-activites/', '02 97 42 59 66',
   'Karting indoor avec pont et tunnel, karts Sodikart 200cc adultes et 120cc enfants, avec bowling et loisirs. Ouvert tous les jours jusque tard le soir (jusqu''à 2 h le vendredi et le samedi).')
on conflict ((lower(name)), (lower(city))) do update set
  address = excluded.address, postal_code = excluded.postal_code, region = excluded.region, is_indoor = excluded.is_indoor,
  length_m = excluded.length_m, kart_power = excluded.kart_power, is_verified = true, location = excluded.location,
  website = coalesce(public.tracks.website, excluded.website), phone = coalesce(public.tracks.phone, excluded.phone),
  description = coalesce(public.tracks.description, excluded.description);
