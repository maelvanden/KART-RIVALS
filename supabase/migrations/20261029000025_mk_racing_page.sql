-- Kart Rivals : fiche MK Racing (Saint-Christophe-du-Bois) complétée et position corrigée (La Malmongère).
-- Pas de réservation en ligne : l'app propose « Réserver par téléphone ».
update public.tracks set
  location = extensions.st_setsrid(extensions.st_makepoint(-0.9766, 47.0577), 4326)::extensions.geography,
  description = 'Circuit outdoor de 816 m pour 7 m de large dans un décor vallonné, entre Cholet, Nantes et Angers. '
             || 'Ses passages clés : le Run Off, le Pif-Paf, le Cœur et le Virage en aveugle avant la ligne. '
             || 'Réservation conseillée ; par mauvais temps (neige, verglas, orage), appelle avant de venir.',
  website = 'https://www.kartingcholet.fr/',
  phone = '02 41 63 54 13'
where lower(name) = 'mk racing' and lower(city) = 'saint-christophe-du-bois';
