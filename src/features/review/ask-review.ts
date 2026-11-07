import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { isDemoMode } from '@/lib/demo';

const KEY = 'kart-rivals.store-review';
/** Victoires vues avant la première demande : le pilote connaît déjà l'appli. */
const MIN_WINS = 2;
/** Pas plus d'une demande tous les 4 mois (Apple en affiche de toute façon 3 par an au maximum). */
const COOLDOWN_MS = 120 * 86_400_000;
/** Une victoire validée il y a plus de 3 jours n'est plus « fraîche ». */
const FRESH_MS = 3 * 86_400_000;

type State = { seen: string[]; wins: number; askedAt: number | null };

async function load(): Promise<State> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return { seen: [], wins: 0, askedAt: null, ...(JSON.parse(raw) as Partial<State>) };
  } catch {}
  return { seen: [], wins: 0, askedAt: null };
}

/**
 * Demande une note App Store juste après une victoire (défi ou course), au moment où le pilote est content.
 * `winKey` : identifiant de la victoire affichée (null si pas de victoire) ; `at` : date de sa validation.
 * Chaque victoire n'est comptée qu'une fois ; la demande vient à partir de la 2e, au plus tous les 4 mois.
 */
export function useAskReviewAfterWin(winKey: string | null, at: string | null) {
  useEffect(() => {
    if (!winKey || Platform.OS === 'web' || isDemoMode) return;
    if (at && Date.now() - Date.parse(at) > FRESH_MS) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const state = await load();
      if (state.seen.includes(winKey)) return;
      const next: State = { ...state, seen: [...state.seen, winKey].slice(-50), wins: state.wins + 1 };
      const due = next.wins >= MIN_WINS && (next.askedAt === null || Date.now() - next.askedAt > COOLDOWN_MS);
      if (due && (await StoreReview.isAvailableAsync()) && (await StoreReview.hasAction())) {
        next.askedAt = Date.now();
        // Laisse le temps de voir le résultat et l'ELO gagné.
        timer = setTimeout(() => StoreReview.requestReview().catch(() => {}), 1800);
      }
      await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    })().catch(() => {});
    return () => clearTimeout(timer);
  }, [winKey, at]);
}
