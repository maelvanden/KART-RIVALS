-- Kart Rivals : Karting de Loudun, adresse officielle (Circuit de la Boule d'Or, RD 147, Bournand), position
-- recalée sur le circuit et fiche complétée.
update public.tracks set
  location = extensions.st_setsrid(extensions.st_makepoint(0.0781, 47.0862), 4326)::extensions.geography,
  address = 'Circuit de la Boule d''Or, RD 147',
  postal_code = '86120',
  description = 'Circuit outdoor en pleine nature, au milieu d''un parc boisé, avec deux tracés : 1 150 m et 800 m. '
             || 'Location par sessions de 10 minutes, compétition et entraînement. Fermé de début janvier à début février ; '
             || 'les horaires changent selon les vacances scolaires, appelle avant de venir.',
  website = 'https://www.loudun-karting.com/',
  phone = '05 49 98 75 12',
  facebook_url = coalesce(facebook_url, 'https://www.facebook.com/kartingdeloudun/')
where lower(name) = 'karting de loudun';
