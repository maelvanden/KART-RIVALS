import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

type AppleModule = typeof import('expo-apple-authentication');

/**
 * Module Apple chargé prudemment : s'il manquait dans la version d'Expo Go installée,
 * le bouton Apple est simplement masqué au lieu de faire planter l'appli au démarrage.
 */
export const Apple: AppleModule | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-apple-authentication') as AppleModule;
  } catch {
    return null;
  }
})();

// Web : ferme la fenêtre de connexion ouverte par openAuthSessionAsync une fois revenue sur l'app.
if (Platform.OS === 'web') WebBrowser.maybeCompleteAuthSession();

/** Erreurs Supabase / Apple / Google traduites. */
const SOCIAL_ERRORS: [string, string][] = [
  ['provider is not enabled', 'Cette méthode de connexion n’est pas encore activée.'],
  ['Unsupported provider', 'Cette méthode de connexion n’est pas encore activée.'],
  ['audience', 'Connexion Apple pas encore configurée pour cette version de l’appli.'],
  ['already registered', 'Un compte existe déjà avec cet e-mail : connecte-toi avec ton mot de passe.'],
];
const socialError = (message: string) => new Error(SOCIAL_ERRORS.find(([en]) => message.includes(en))?.[1] ?? message);

/** Ouvre la session à partir de l'adresse de retour (#access_token=… ou ?code=…, ou une erreur). */
async function sessionFromUrl(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  parsed.searchParams.forEach((value, key) => params.set(key, value));

  const error = params.get('error_description') ?? params.get('error');
  if (error) throw socialError(error);
  const code = params.get('code');
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw socialError(exchangeError.message);
    return;
  }
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) throw new Error('La connexion n’a pas abouti, réessaie.');
  const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
  if (sessionError) throw socialError(sessionError.message);
}

/**
 * Connexion Google : page Google dans une fenêtre sécurisée, puis retour dans l'app (fonctionne dans Expo Go).
 * Renvoie false si le pilote a fermé la fenêtre.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw socialError(error.message);
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  await sessionFromUrl(result.url);
  return true;
}

/** « Se connecter avec Apple » existe sur iPhone (iOS 13+) uniquement. */
export async function isAppleSignInAvailable() {
  return !!Apple && (await Apple.isAvailableAsync());
}

/** Connexion Apple native (Face ID / Touch ID). Renvoie false si le pilote annule. */
export async function signInWithApple(): Promise<boolean> {
  if (!Apple) throw new Error('Connexion Apple indisponible sur cet appareil.');
  let credential: Awaited<ReturnType<AppleModule['signInAsync']>>;
  try {
    credential = await Apple.signInAsync({
      requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false;
    throw e;
  }
  if (!credential.identityToken) throw new Error('Apple n’a pas renvoyé d’identifiant, réessaie.');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
  if (error) throw socialError(error.message);
  return true;
}
