-- Kart Rivals : Time Attack vérifié par OCR (sans IA).
-- Le pilote déclare le nom imprimé sur son ticket et son meilleur tour ; l'Edge Function vérifie qu'ils
-- figurent sur la photo. On garde le nom déclaré et le texte lu, utiles en cas de contestation.
alter table public.time_attack_sessions
  add column ticket_name text check (char_length(ticket_name) <= 60),
  add column ocr_text text;
