import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { useAuth } from '@/features/auth/auth-provider';
import { socialError } from '@/features/social/errors';
import { demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { ReportReason, TrackPhoto } from '@/types/models';

const BUCKET = 'track-photos';
/** Largeur maximale d'une photo de circuit envoyée. */
const PHOTO_MAX_WIDTH = 1600;

const photosKey = (trackId: string) => ['track-photos', trackId] as const;

/** Photos du circuit, des pilotes (en mode démo : celles ajoutées pendant la session). */
const demoPhotos: Record<string, TrackPhoto[]> = {};

const publicUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

/** Galerie d'un circuit, la plus récente d'abord. */
export function useTrackPhotos(trackId: string | undefined) {
  return useQuery({
    queryKey: photosKey(trackId ?? ''),
    enabled: !!trackId,
    queryFn: async (): Promise<TrackPhoto[]> => {
      if (isDemoMode) return [...(demoPhotos[trackId!] ?? [])];
      const { data, error } = await supabase
        .from('track_photos')
        .select('id, track_id, author_id, path, width, height, caption, created_at, author:profiles (username)')
        .eq('track_id', trackId!)
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data as unknown as Omit<TrackPhoto, 'url'>[]).map((p) => ({ ...p, url: publicUrl(p.path) }));
    },
  });
}

/** Ajoute une photo (compressée en JPEG) à la galerie du circuit. */
export function useAddTrackPhoto(trackId: string) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  return useMutation({
    mutationFn: async ({ uri, width, caption }: { uri: string; width: number; caption?: string }) => {
      const context = ImageManipulator.manipulate(uri);
      if (width > PHOTO_MAX_WIDTH) context.resize({ width: PHOTO_MAX_WIDTH });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ compress: 0.78, format: SaveFormat.JPEG });
      if (isDemoMode) {
        (demoPhotos[trackId] ??= []).unshift({
          id: `ph-${Date.now()}`,
          track_id: trackId,
          author_id: demoProfile.id,
          path: saved.uri,
          width: saved.width,
          height: saved.height,
          caption: caption?.trim() || null,
          created_at: new Date().toISOString(),
          url: saved.uri,
          author: { username: demoProfile.username },
        });
        return;
      }
      const bytes = await (await fetch(saved.uri)).arrayBuffer();
      const path = `${trackId}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const upload = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg' });
      if (upload.error) throw upload.error;
      const { error } = await supabase
        .from('track_photos')
        .insert({ track_id: trackId, path, width: saved.width, height: saved.height, caption: caption?.trim() || null });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw socialError(error);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photosKey(trackId) }),
  });
}

/** Supprime une de mes photos (ligne + fichier). */
export function useDeleteTrackPhoto(trackId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (photo: TrackPhoto) => {
      if (isDemoMode) {
        demoPhotos[trackId] = (demoPhotos[trackId] ?? []).filter((p) => p.id !== photo.id);
        return;
      }
      const { error } = await supabase.from('track_photos').delete().eq('id', photo.id);
      if (error) throw socialError(error);
      await supabase.storage.from(BUCKET).remove([photo.path]);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photosKey(trackId) }),
  });
}

/** Signale une photo ; masquée pour tous après 3 signalements. */
export function useReportTrackPhoto() {
  return useMutation({
    mutationFn: async ({ photoId, reason, details }: { photoId: string; reason: ReportReason; details?: string }) => {
      if (isDemoMode) return;
      const { error } = await supabase.rpc('report_track_photo', {
        p_photo_id: photoId,
        p_reason: reason,
        p_details: details?.trim() || null,
      });
      if (error) throw socialError(error);
    },
  });
}
