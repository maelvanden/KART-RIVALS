import { Redirect } from 'expo-router';

/**
 * Retour de la connexion Google : la fenêtre de connexion récupère elle-même l'adresse (social-sign-in.ts).
 * Si le système ouvre quand même l'app sur ce lien (Android), on renvoie simplement vers l'accueil.
 */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
