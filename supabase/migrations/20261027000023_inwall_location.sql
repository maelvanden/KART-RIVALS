-- Kart Rivals : position d'Inwall Kart corrigée (ZAC de Vernusson, ~1 km plus au nord) et page Facebook.
update public.tracks set
  location = extensions.st_setsrid(extensions.st_makepoint(-0.5434, 47.4284), 4326)::extensions.geography,
  facebook_url = coalesce(facebook_url, 'https://www.facebook.com/p/Inwall-Kart-100063520241809/')
where lower(name) = 'inwall kart' and lower(city) = 'les ponts-de-cé';
