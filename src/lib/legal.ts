import * as WebBrowser from 'expo-web-browser';

/** Politique de confidentialité, publiée avec GitHub Pages (dossier docs/). */
export const PRIVACY_URL = 'https://maelvanden.github.io/KART-RIVALS/confidentialite.html';

export const openPrivacyPolicy = () => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {});
