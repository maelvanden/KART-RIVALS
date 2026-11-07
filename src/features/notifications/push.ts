import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

/** Jeton de l'appareil, gardé pour le retirer à la déconnexion. */
const TOKEN_KEY = 'kart-rivals.push-token';

// Appli ouverte : la notification s'affiche quand même en bannière.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Demande l'autorisation (une seule fois) puis enregistre le jeton de l'appareil pour le pilote connecté. */
async function register() {
  let { status } = await Notifications.getPermissionsAsync();
  if (status === 'undetermined') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const { data: token } = await Notifications.getExpoPushTokenAsync();
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  if (error) throw error;
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

/** À la déconnexion : cet appareil ne reçoit plus les notifications du compte. */
export async function unregisterPushToken() {
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  if (!token) return;
  await supabase.rpc('unregister_push_token', { p_token: token });
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
}

/**
 * Notifications push du pilote connecté (`ready` : licence chargée, appli utilisable) :
 * enregistre l'appareil et ouvre l'écran de la notification touchée (data.url), y compris au lancement.
 */
export function usePushNotifications(userId: string | null, ready: boolean) {
  useEffect(() => {
    if (!userId || !ready || isDemoMode || !Device.isDevice) return;
    // Pas de notification (refus, simulateur, Android sans service de push) : l'appli fonctionne normalement.
    register().catch(() => {});
  }, [userId, ready]);

  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!ready || !response) return;
    const url = response.notification.request.content.data?.url;
    Notifications.clearLastNotificationResponse();
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
  }, [ready, response]);
}
