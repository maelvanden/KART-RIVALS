import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { colors, spacing } from '@/theme';

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.neon} />
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <Card style={styles.empty}>
      <Text variant="heading">{title}</Text>
      {message ? <Text variant="caption" style={styles.message}>{message}</Text> : null}
    </Card>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Erreur inconnue';
  return <EmptyState title="Oups, sortie de piste" message={message} />;
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  message: { textAlign: 'center' },
});
