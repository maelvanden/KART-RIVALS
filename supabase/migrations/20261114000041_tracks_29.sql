-- Kart Rivals : kartings en activité dans le Finistère (29), d'après le recensement du 19 octobre 2026 (6 circuits).
-- Brest Karting Électrique : position approximative (zone de Kergaradec), corrigeable depuis l'administration ;
-- La Récré des 3 Curés : centre du parc.
insert into public.tracks (name, address, postal_code, city, region, is_indoor, length_m, kart_power, is_verified, location, created_by,
                           website, phone, description)
values
  ('KartOuest', 'Keronvel, Villeneuve Stadium', '29810', 'Ploumoguer', 'Finistère', false, 800, '270cc 9 ch · 160cc 5 ch', true,
   extensions.st_setsrid(extensions.st_makepoint(-4.69004, 48.39861), 4326)::extensions.geography, null,
   'https://www.kartouest29.fr/', '02 98 89 34 40',
   'Circuit Villeneuve Stadium, à l''ouest de Brest : piste extérieure de 800 m sur 8 m de large, homologuée FFSA. Karts 4 temps 270cc (9 ch) adultes et 160cc (5 ch) enfants. Ouvert toute l''année sur réservation : mercredi, vendredi, samedi et dimanche hors vacances, horaires élargis pendant les vacances. Certains créneaux sont réservés à l''entraînement des licenciés.'),
  ('Bretagne Karting', 'Ménez Frug, sortie L’Avantage', '29120', 'Combrit', 'Finistère', false, 700, '270cc · biplace', true,
   extensions.st_setsrid(extensions.st_makepoint(-4.18757, 47.92136), 4326)::extensions.geography, null,
   'https://www.bretagne-karting.bzh/', '02 98 94 25 09',
   'Piste extérieure de 700 m près de Pont-l''Abbé et Quimper : karts 270cc, biplaces et karts adaptés PMR, live timing en ligne. Ouvert toute l''année : du mercredi au dimanche de 14 h à 20 h hors vacances, 7 j/7 pendant les vacances, et 7 j/7 de 11 h à 21 h du 15 juin au 15 septembre.'),
  ('Brest Karting Électrique', '35 avenue de la 1ère DFL', '29200', 'Brest', 'Finistère', true, 540, 'Électrique Sodikart RSX / LRX', true,
   extensions.st_setsrid(extensions.st_makepoint(-4.4745, 48.4235), 4326)::extensions.geography, null,
   'https://www.brestkartingelectrique.fr/', '02 98 30 14 26',
   'Karting indoor 100 % électrique de 540 m : Sodikart RSX dès 14 ans (70 km/h max) et LRX pour les 7–13 ans (45 km/h max). Du mercredi au dimanche hors vacances (lundi et mardi réservés aux groupes), tous les jours pendant les vacances, sur réservation.'),
  ('La Récré des 3 Curés – Karting', 'Les Trois Curés', '29290', 'Milizac-Guipronvel', 'Finistère', false, 450, 'Karts enfants / adultes · biplace', true,
   extensions.st_setsrid(extensions.st_makepoint(-4.52642, 48.4729), 4326)::extensions.geography, null,
   'https://www.larecredes3cures.com/parc-et-attractions/attractions-et-jeux/le-karting/', '02 98 07 95 59',
   'Le karting du parc d''attractions de la Récré des 3 Curés : piste d''environ 450 m, karts enfants dès 8 ans, adultes dès 14 ans et biplace. Payant en plus du billet du parc. Ouvert uniquement les jours d''ouverture du parc, du 5 avril au 20 décembre 2026 : consulte le calendrier du parc avant de venir.'),
  ('Kart West Indoor', '4 rue du Stade de Kerhuel, ZI de l’Hippodrome', '29000', 'Quimper', 'Finistère', true, 350, '200cc · 160cc enfant', true,
   extensions.st_setsrid(extensions.st_makepoint(-4.07923, 47.99912), 4326)::extensions.geography, null,
   'https://kartwest.fr/', '02 98 53 03 03',
   'Karting indoor à Quimper : karts 4 temps 200cc adultes et 160cc enfants dès 8 ans, avec laser game. Piste de 350 m selon une fiche, 200 m selon les sources récentes. Du mercredi au dimanche hors vacances, 7 j/7 de 14 h à 22 h pendant les vacances (fermé le 25 décembre et le 1er janvier).'),
  ('SpeedPark Brest', '63–65 rue Amiral Romain-Desfossés, ZC Kergaradec', '29200', 'Brest', 'Finistère', true, 215, 'Électrique', true,
   extensions.st_setsrid(extensions.st_makepoint(-4.470775, 48.426816), 4326)::extensions.geography, null,
   'https://speedpark.fr/brest/', '02 98 34 47 83',
   'Karting électrique indoor de plus de 215 m dans la zone de Kergaradec, avec loisirs. Adultes dès 15 ans (1,50 m), juniors de 11 à 14 ans (1,30 m, pas après 20 h). Ouvert tous les jours, horaires élargis pendant les vacances.')
on conflict ((lower(name)), (lower(city))) do update set
  address = excluded.address, postal_code = excluded.postal_code, region = excluded.region, is_indoor = excluded.is_indoor,
  length_m = excluded.length_m, kart_power = excluded.kart_power, is_verified = true, location = excluded.location,
  website = coalesce(public.tracks.website, excluded.website), phone = coalesce(public.tracks.phone, excluded.phone),
  description = coalesce(public.tracks.description, excluded.description);
