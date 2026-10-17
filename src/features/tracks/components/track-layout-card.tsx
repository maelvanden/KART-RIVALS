import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { trackLayout } from '@/features/tracks/layouts';
import { colors, spacing } from '@/theme';
import type { TrackDetails } from '@/types/models';

/** Tracé du circuit ; touche pour l'agrandir. */
export function TrackLayoutCard({ track }: { track: TrackDetails }) {
  const source = trackLayout(track);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  if (!source) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Icon name={icons.route} size={18} color={colors.neon} />
        <Text variant="label" style={styles.title}>
          Tracé
        </Text>
        {track.length_m ? <Text variant="label">{track.length_m.toLocaleString('fr-FR')} m</Text> : null}
      </View>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel="Agrandir le tracé" onPress={() => setOpen(true)}>
        <Image source={source} style={styles.layout} contentFit="contain" transition={150} />
      </Pressable>
      <Text variant="caption" style={styles.hint}>
        Sens de la course : suis les flèches. Touche pour agrandir.
      </Text>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.viewer}>
          <Image source={source} style={styles.full} contentFit="contain" />
          <Pressable
            accessibilityLabel="Fermer"
            onPress={() => setOpen(false)}
            hitSlop={12}
            style={[styles.close, { top: insets.top + 12 }]}>
            <Icon name={icons.close} color={colors.text} size={26} />
          </Pressable>
        </View>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.text },
  layout: { width: '100%', aspectRatio: 1.1 },
  hint: { textAlign: 'center' },
  viewer: { flex: 1, backgroundColor: 'rgba(10, 12, 16, 0.97)', justifyContent: 'center' },
  full: { width: '100%', height: '85%' },
  close: { position: 'absolute', right: 20 },
});
