-- Kart Rivals : Karting de Loudun recalé sur le circuit (recensement des équipements sportifs, au nord-ouest du
-- hameau de la Boule d'Or) ; le point précédent tombait ~2,5 km trop au nord.
update public.tracks set
  location = extensions.st_setsrid(extensions.st_makepoint(0.0717, 47.0649), 4326)::extensions.geography
where lower(name) = 'karting de loudun';
