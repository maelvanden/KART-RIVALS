import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/** Présentation vue sur cet appareil (une version : la rehausser pour la remontrer après une grosse nouveauté). */
const KEY = 'kart-rivals.welcome-seen.v1';

/** null tant que le stockage n'a pas répondu, puis si la présentation a déjà été vue. */
export function useWelcomeSeen() {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setSeen(v === '1'))
      // Stockage indisponible : on ne bloque pas l'appli.
      .catch(() => setSeen(true));
  }, []);
  const markSeen = useCallback(() => {
    setSeen(true);
    AsyncStorage.setItem(KEY, '1').catch(() => {});
  }, []);
  return { seen, markSeen };
}
