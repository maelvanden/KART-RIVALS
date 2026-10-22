import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

/** Mot à taper pour confirmer : une suppression est définitive. */
export const DELETE_CONFIRMATION = 'SUPPRIMER';

const MESSAGES: Record<string, string> = {
  LAST_ADMIN: 'Tu es le dernier admin de l’appli : nomme un autre admin avant de supprimer ton compte.',
  UNAUTHORIZED: 'Ta session a expiré : reconnecte-toi puis réessaie.',
};

/**
 * Suppression définitive du compte (Edge Function delete-account) : profil, résultats, messages, photos, position…
 * puis déconnexion et effacement des données gardées sur le téléphone.
 */
export function useDeleteAccount() {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (isDemoMode) throw new Error('Mode démo : la suppression de compte est désactivée.');
      const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: DELETE_CONFIRMATION } });
      if (error instanceof FunctionsHttpError) {
        const body = (await (error.context as Response).json().catch(() => null)) as { code?: string } | null;
        throw new Error(MESSAGES[body?.code ?? ''] ?? 'La suppression a échoué, réessaie dans un instant.');
      }
      if (error) throw new Error('Connexion impossible, vérifie ton réseau puis réessaie.');
    },
    onSuccess: async () => {
      await AsyncStorage.clear().catch(() => {});
      queryClient.clear();
      await signOut();
    },
  });
}
