-- Kart Rivals : médias de l'Actu limités à 25 Mo (au lieu de 50) ; l'appli limite les vidéos à 30 s et les recompresse.
update storage.buckets set file_size_limit = 25 * 1024 * 1024 where id = 'feed-media';
