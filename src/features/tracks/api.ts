import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { demoTracks, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { Coords } from '@/features/nearby/api';
import type { Track } from '@/types/models';

export function useTracks() {
  return useQuery({
    queryKey: ['tracks'],
    queryFn: async (): Promise<Track[]> => {
      if (isDemoMode) return [...demoTracks];
      const { data, error } = await supabase.from('tracks').select('id, name, city').order('name');
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Ajoute un circuit. Sans géocodage pour l'instant : il est placé à la position approximative
 * du pilote, qui l'ajoute en général depuis sa région.
 */
export function useCreateTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, city, coords }: { name: string; city: string; coords: Coords }): Promise<Track> => {
      if (isDemoMode) {
        const track = { id: `t-${Date.now()}`, name, city };
        demoTracks.push(track);
        return track;
      }
      const { data, error } = await supabase
        .from('tracks')
        .insert({ name, city, location: `SRID=4326;POINT(${coords.lng} ${coords.lat})` })
        .select('id, name, city')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tracks'] }),
  });
}
