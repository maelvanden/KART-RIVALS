-- Kart Rivals : nouveau type de conversation « tournament » (discussion des inscrits d'un tournoi).
-- Seul dans sa migration : une valeur d'énumération ajoutée ne peut servir qu'une fois la transaction validée.
alter type public.conversation_kind add value if not exists 'tournament';
