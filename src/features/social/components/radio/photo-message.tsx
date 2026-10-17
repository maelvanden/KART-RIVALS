import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, icons } from '@/components/ui/icon';
import { useRadioPhotoUrl } from '@/features/social/radio';
import { colors, radius } from '@/theme';
import type { ImagePayload } from '@/types/models';

/** Photo envoyée dans la Radio (bucket privé, adresse signée) ; touche pour l'afficher en plein écran. */
export function PhotoMessage({ image }: { image: ImagePayload }) {
  const url = useRadioPhotoUrl(image.path);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const ratio = image.width && image.height ? image.width / image.height : 4 / 3;
  const width = 240;
  const height = Math.min(Math.max(width / ratio, 140), 320);

  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel="Agrandir la photo" onPress={() => setOpen(true)}>
        <View style={[styles.frame, { width, height }]}>
          {url.data ? (
            <Image source={{ uri: url.data }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : (
            <ActivityIndicator color={colors.neon} />
          )}
        </View>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.viewer}>
          {url.data ? <Image source={{ uri: url.data }} style={styles.full} contentFit="contain" /> : null}
          <Pressable
            accessibilityLabel="Fermer"
            onPress={() => setOpen(false)}
            hitSlop={12}
            style={[styles.close, { top: insets.top + 12 }]}>
            <Icon name={icons.close} color={colors.text} size={26} />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewer: { flex: 1, backgroundColor: 'rgba(10, 12, 16, 0.96)', justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
  close: { position: 'absolute', right: 20 },
});
