import { isDemoMode } from '@/lib/demo';

/**
 * Time Attack masqué tant que la lecture des tickets par l'IA n'est pas configurée
 * (secret ANTHROPIC_API_KEY de l'Edge Function) : sans elle, aucun ticket ne serait validé
 * et chaque check-in finirait en DNF. Passer à true une fois la clé en place.
 */
export const TIME_ATTACK_ENABLED = isDemoMode || false;
