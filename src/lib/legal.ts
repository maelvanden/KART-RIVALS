import * as WebBrowser from 'expo-web-browser';

/** Politique de confidentialité publiée avec GitHub Pages (dossier docs/), CGU sur le site kartrivals.fr. */
export const PRIVACY_URL = 'https://maelvanden.github.io/KART-RIVALS/confidentialite.html';
export const TERMS_URL = 'https://kartrivals.fr/cgu';

export const openPrivacyPolicy = () => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {});
export const openTerms = () => WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {});
