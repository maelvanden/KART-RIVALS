/**
 * Valeur par défaut du Time Attack, utilisée tant que les réglages à distance ne sont pas chargés (ou hors ligne).
 * Pour le mettre en pause sans mise à jour de l'appli, par exemple si la lecture des tickets (Edge Function
 * time-attack-ticket, secret OCR_SPACE_API_KEY) ne fonctionne plus : Administration > Réglages de l'appli.
 * Dans le code, lire l'état réel avec useTimeAttackEnabled() (src/features/settings/app-settings.ts).
 */
export const TIME_ATTACK_ENABLED = true;
