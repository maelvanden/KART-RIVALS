/**
 * Affiche le Time Attack dans l'app. Repasser à false pour le masquer, par exemple si la lecture
 * des tickets (Edge Function time-attack-ticket, secret OCR_SPACE_API_KEY) ne fonctionne plus :
 * sans elle, aucun ticket ne serait validé et chaque check-in finirait en DNF.
 */
export const TIME_ATTACK_ENABLED = true;
