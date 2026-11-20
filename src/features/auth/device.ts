import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

const KEY = 'kart-rivals.device-id';

/** Identifiant aléatoire au format UUID : aucun lien avec le matériel, la publicité ou le numéro de série. */
function randomId(): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

let cached: Promise<string | null> | null = null;

/**
 * Identifiant de cette installation, créé au premier lancement et gardé dans le trousseau sécurisé du téléphone (sur
 * iPhone, il survit à une réinstallation de l'appli). Sert uniquement à repérer qu'un même téléphone a servi à
 * plusieurs comptes : voir la section « Comptes liés » de la fiche admin d'un pilote.
 */
export function getDeviceId(): Promise<string | null> {
  cached ??= (async () => {
    try {
      const existing = await SecureStore.getItemAsync(KEY);
      if (existing) return existing;
      const created = randomId();
      await SecureStore.setItemAsync(KEY, created);
      return created;
    } catch {
      // Trousseau indisponible : pas d'identifiant, et donc pas de liaison. L'appli fonctionne normalement.
      return null;
    }
  })();
  return cached;
}

/**
 * Enregistre l'appareil pour le compte connecté (RPC register_device, une écriture par heure au plus côté base).
 * À appeler dès que le profil est chargé, y compris quand le compte est suspendu ou banni : c'est justement là que
 * la liaison est utile. Sans effet sur le web et en démonstration ; ne bloque jamais l'ouverture de l'appli.
 */
export function useRegisterDevice(userId: string | null | undefined, ready: boolean) {
  useEffect(() => {
    if (!userId || !ready || isDemoMode || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return;
    getDeviceId()
      .then((id) => (id ? supabase.rpc('register_device', { p_device: id, p_platform: Platform.OS }) : null))
      .catch(() => {});
  }, [userId, ready]);
}
