import { useMutation } from '@tanstack/react-query';

import { socialError } from '@/features/social/errors';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

export type CorrectionKind = 'hours' | 'closed' | 'position' | 'contact' | 'info' | 'other';

/** Types d'erreur qu'un pilote peut signaler sur une fiche circuit. */
export const CORRECTION_KINDS: { value: CorrectionKind; label: string; hint: string }[] = [
  { value: 'hours', label: 'Horaires faux', hint: 'Quels sont les bons horaires ou jours d’ouverture ?' },
  { value: 'closed', label: 'Circuit fermé', hint: 'Fermé définitivement, en travaux, changement de nom ?' },
  { value: 'position', label: 'Mauvaise position', hint: 'Où se trouve vraiment la piste ? Tu peux envoyer ta position si tu es sur place.' },
  { value: 'contact', label: 'Téléphone / site faux', hint: 'Le bon numéro, le bon site ou le bon lien de réservation.' },
  { value: 'info', label: 'Infos piste fausses', hint: 'Longueur, karts, indoor / outdoor, description…' },
  { value: 'other', label: 'Autre', hint: 'Dis-nous ce qui ne va pas.' },
];

export function useSubmitTrackCorrection(trackId: string) {
  return useMutation({
    mutationFn: async ({ kind, message, lat, lng }: { kind: CorrectionKind; message: string; lat?: number; lng?: number }) => {
      if (kind !== 'closed' && !message.trim() && lat == null) throw new Error('Explique en quelques mots ce qui est faux.');
      if (isDemoMode) return;
      const { error } = await supabase.rpc('submit_track_correction', {
        p_track_id: trackId,
        p_kind: kind,
        p_message: message.trim() || null,
        p_lat: lat ?? null,
        p_lng: lng ?? null,
      });
      if (error) throw socialError(error);
    },
  });
}
