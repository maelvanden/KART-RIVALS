-- Kart Rivals : fiche SpeedPark Angers (Beaucouzé) complétée et position corrigée (Atoll, Ecoparc du Buisson).
update public.tracks set
  location = extensions.st_setsrid(extensions.st_makepoint(-0.6280, 47.4846), 4326)::extensions.geography,
  address = 'Centre commercial L''Atoll, Ecoparc du Buisson',
  length_m = 230,
  description = 'Piste indoor de 230 m signée 360 Karting (2024) au cœur de L''Atoll, avec une partie en étage et son pont '
             || 'au-dessus de la piste. Sessions adultes dès 15 ans et sessions enfants de 11 à 14 ans (1,40 m minimum), '
             || 'jamais mélangées. Réservation conseillée le soir, le week-end et pendant les vacances ; sinon, sur place '
             || 'selon les places disponibles. Bowling, laser game et bar sur place.',
  booking_url = 'https://speedpark.fr/angers-beaucouze/reservation-angers/',
  website = 'https://speedpark.fr/angers-beaucouze/karting/',
  phone = '02 44 51 24 55',
  instagram_url = coalesce(instagram_url, 'https://www.instagram.com/speedparkfrance/')
where lower(name) = 'speedpark angers' and lower(city) = 'beaucouzé';
