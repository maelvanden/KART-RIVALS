import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useCanManageTrack } from '@/features/admin/api';
import { useAuth } from '@/features/auth/auth-provider';
import { ReportSheet } from '@/features/social/components/report-sheet';
import { useAddTrackPhoto, useDeleteTrackPhoto, useTrackPhotos } from '@/features/tracks/photos';
import { confirmAction } from '@/lib/confirm';
import { colors, radius, spacing } from '@/theme';
import type { TrackPhoto } from '@/types/models';

/** Photos du circuit postées par les pilotes : défilement horizontal, plein écran, ajout, suppression, signalement. */
export function TrackGallery({ trackId, trackName }: { trackId: string; trackName: string }) {
  const { userId } = useAuth();
  const photos = useTrackPhotos(trackId);
  const add = useAddTrackPhoto(trackId);
  const remove = useDeleteTrackPhoto(trackId);
  const insets = useSafeAreaInsets();
  const canModerate = useCanManageTrack(trackId);
  const [picking, setPicking] = useState(false);
  const [viewing, setViewing] = useState<TrackPhoto | null>(null);
  const [reporting, setReporting] = useState<TrackPhoto | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const list = photos.data ?? [];
  const error = pickError ?? (add.error ?? remove.error)?.message;

  async function pick(source: 'camera' | 'library') {
    setPicking(false);
    setPickError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Autorise l’accès à l’appareil photo dans les réglages.');
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const { uri, width } = result.assets[0];
      add.mutate({ uri, width });
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Impossible d’ajouter la photo.');
    }
  }

  function askDelete(photo: TrackPhoto) {
    confirmAction('Supprimer la photo ?', 'Elle disparaîtra de la galerie du circuit.', 'Supprimer', () => {
      remove.mutate(photo);
      setViewing(null);
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text variant="label" style={styles.title}>
          Photos du circuit
        </Text>
        {list.length > 0 ? <Text variant="label">{list.length}</Text> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajouter une photo du circuit"
          disabled={add.isPending}
          onPress={() => setPicking(true)}
          style={({ pressed }) => [styles.addTile, pressed && styles.pressed]}>
          {add.isPending ? <ActivityIndicator color={colors.neon} /> : <Icon name={icons.camera} size={24} color={colors.neon} />}
          <Text style={styles.addText}>{add.isPending ? 'Envoi…' : 'Ajouter'}</Text>
        </Pressable>
        {list.map((p) => (
          <Pressable key={p.id} accessibilityRole="imagebutton" accessibilityLabel="Voir la photo" onPress={() => setViewing(p)}>
            <Image source={{ uri: p.url }} style={styles.thumb} contentFit="cover" transition={150} />
          </Pressable>
        ))}
      </ScrollView>
      {photos.data && list.length === 0 ? (
        <Text variant="caption">Pas encore de photo : partage la piste, le paddock ou ton meilleur départ.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <BottomSheet visible={picking} onClose={() => setPicking(false)} title="Photo du circuit">
        <View style={styles.sheet}>
          <Button title="Prendre une photo" icon={<Icon name={icons.camera} size={18} color={colors.onNeon} />} onPress={() => pick('camera')} />
          <Button title="Choisir dans la galerie" variant="secondary" onPress={() => pick('library')} />
        </View>
      </BottomSheet>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewer}>
          {viewing ? <Image source={{ uri: viewing.url }} style={styles.full} contentFit="contain" /> : null}
          <Pressable
            accessibilityLabel="Fermer"
            onPress={() => setViewing(null)}
            hitSlop={12}
            style={[styles.close, { top: insets.top + 12 }]}>
            <Icon name={icons.close} color={colors.text} size={26} />
          </Pressable>
          {viewing ? (
            <View style={[styles.viewerBar, { paddingBottom: insets.bottom + spacing.lg }]}>
              <View style={styles.viewerInfo}>
                <Text style={styles.author}>{viewing.author?.username ?? 'Pilote'}</Text>
                <Text variant="caption">
                  {trackName} · {new Date(viewing.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
              {viewing.author_id === userId || canModerate ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Supprimer la photo" hitSlop={10} onPress={() => askDelete(viewing)}>
                  <Icon name={icons.trash} size={22} color={colors.danger} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Signaler la photo"
                  hitSlop={10}
                  onPress={() => {
                    setReporting(viewing);
                    setViewing(null);
                  }}>
                  <Icon name={icons.report} size={22} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          ) : null}
        </View>
      </Modal>

      <ReportSheet
        target={
          reporting
            ? { pilotId: reporting.author_id, username: reporting.author?.username ?? 'ce pilote', photoId: reporting.id }
            : null
        }
        onClose={() => setReporting(null)}
      />
    </View>
  );
}

const THUMB = 116;

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  strip: { gap: spacing.sm },
  addTile: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.neon,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addText: { color: colors.neon, fontWeight: '700', fontSize: 13 },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  error: { color: colors.danger },
  sheet: { gap: spacing.sm, paddingBottom: spacing.sm },
  pressed: { opacity: 0.75 },
  viewer: { flex: 1, backgroundColor: 'rgba(10, 12, 16, 0.97)', justifyContent: 'center' },
  full: { width: '100%', height: '75%' },
  close: { position: 'absolute', right: 20 },
  viewerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  viewerInfo: { flex: 1, gap: 2 },
  author: { fontWeight: '800' },
});
