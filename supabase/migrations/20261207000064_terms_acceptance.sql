-- Kart Rivals : acceptation des CGU et de la politique de confidentialité à la création de la licence.
-- L'app impose une case à cocher avant de créer le profil ; la date est posée par le serveur (heure de
-- l'insertion), jamais envoyée par le client. Les licences créées avant cette migration restent à null
-- (acceptation implicite par la mention de l'écran de connexion).

alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles alter column terms_accepted_at set default now();

-- Ni lisible ni modifiable par les pilotes (pas de grant sur la colonne) ; consultable depuis le tableau de bord.
comment on column public.profiles.terms_accepted_at is
  'Date d''acceptation des CGU et de la politique de confidentialité (case cochée à la création de la licence).';
