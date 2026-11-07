import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '@/features/auth/auth-provider';
import { demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

/** Ouvre la galerie, recadrage carré. Renvoie l'URI locale, ou null si annulé. */
export async function pickSquarePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Autorise l’accès à tes photos pour choisir une photo de profil.');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  return result.canceled ? null : result.assets[0].uri;
}

/** Côté d'une photo de profil : affichée au plus en 84 px, 512 px suffisent pour les écrans Retina. */
const AVATAR_SIZE = 512;

async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  // Recadrée carrée par le sélecteur : redimensionnée en JPEG léger (quelques dizaines de Ko au lieu de plusieurs Mo).
  const context = ImageManipulator.manipulate(localUri);
  context.resize({ width: AVATAR_SIZE, height: AVATAR_SIZE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  const blob = await (await fetch(saved.uri)).arrayBuffer();
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage.from('avatars').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // Même chemin à chaque envoi : le paramètre de version force le rafraîchissement des caches.
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Envoie la photo choisie (ou la retire avec null) et met à jour la licence. */
export function useSetAvatar() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (localUri: string | null) => {
      if (isDemoMode) {
        demoProfile.avatar_url = localUri;
        return;
      }
      const url = localUri ? await uploadAvatar(userId!, localUri) : null;
      if (!localUri) {
        // On retire les anciens fichiers ; l'échec éventuel n'empêche pas de retirer la photo du profil.
        await supabase.storage.from('avatars').remove([`${userId}/avatar.jpg`, `${userId}/avatar.png`]);
      }
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId!);
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
        queryClient.invalidateQueries({ queryKey: ['nearby'] }),
        queryClient.invalidateQueries({ queryKey: ['search-pilots'] }),
      ]),
  });
}
