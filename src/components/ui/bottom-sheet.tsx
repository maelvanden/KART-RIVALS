import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors, radius, spacing } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Élément affiché à gauche du titre (icône…). */
  leading?: ReactNode;
  children: ReactNode;
};

/** Panneau qui monte du bas de l'écran (Modal natif : marche dans Expo Go, sur iOS, Android et web). */
export function BottomSheet({ visible, onClose, title, leading, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel="Fermer" onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          {leading}
          <Text variant="heading" style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Pressable accessibilityLabel="Fermer" onPress={onClose} hitSlop={12}>
            <Icon name={icons.close} color={colors.textMuted} />
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { flex: 1 },
});
