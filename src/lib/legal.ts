import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

/** Pages légales, publiées sur le site kartrivals.fr. */
export const PRIVACY_URL = 'https://kartrivals.fr/confidentialite';
export const TERMS_URL = 'https://kartrivals.fr/cgu';

/** Page ouverte par le lien de confirmation reçu par e-mail (à autoriser dans Supabase → Auth → URL Configuration). */
export const EMAIL_CONFIRMED_URL = 'https://kartrivals.fr/confirmation';

export const openPrivacyPolicy = () => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {});
export const openTerms = () => WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {});

/** Adresse de l'équipe (écran de compte suspendu, où l'appli est bloquée). */
export const CONTACT_EMAIL = 'contact@kartrivals.fr';

export const emailTeam = (subject: string) =>
  Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`).catch(() => {});
