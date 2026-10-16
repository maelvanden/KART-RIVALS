import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, spacing } from '@/theme';

/** Titre de section des écrans communauté : petit trait d'accent, libellé, compteur à droite. */
export function SectionTitle({ title, detail, accent = colors.neon }: { title: string; detail?: string; accent?: string }) {
  return (
    <View style={styles.section}>
      <View style={[styles.bar, { backgroundColor: accent }]} />
      <Text variant="label" style={styles.title}>
        {title}
      </Text>
      {detail ? <Text variant="label">{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  bar: { width: 10, height: 3 },
  title: { flex: 1, color: colors.text },
});
