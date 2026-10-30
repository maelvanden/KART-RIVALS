import * as WebBrowser from 'expo-web-browser';

/** Pages légales, publiées avec GitHub Pages (dossier docs/). */
export const PRIVACY_URL = 'https://maelvanden.github.io/KART-RIVALS/confidentialite.html';
export const TERMS_URL = 'https://maelvanden.github.io/KART-RIVALS/cgu.html';

export const openPrivacyPolicy = () => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {});
export const openTerms = () => WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {});
