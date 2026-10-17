import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

import { colors } from '@/theme';

/** Ouvre un site dans le navigateur intégré (onglet sur le web), aux couleurs de l'app. */
export function openLink(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener');
    return;
  }
  WebBrowser.openBrowserAsync(url, { controlsColor: colors.neon, toolbarColor: colors.background }).catch(() =>
    Linking.openURL(url),
  );
}

export function callPhone(phone: string) {
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
}
