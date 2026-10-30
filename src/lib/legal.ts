import * as WebBrowser from 'expo-web-browser';

/** Pages légales, publiées sur le site kartrivals.fr. */
export const PRIVACY_URL = 'https://kartrivals.fr/confidentialite';
export const TERMS_URL = 'https://kartrivals.fr/cgu';

export const openPrivacyPolicy = () => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {});
export const openTerms = () => WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {});
