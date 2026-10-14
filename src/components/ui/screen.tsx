import type { PropsWithChildren, ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { colors, spacing } from '@/theme';

type Props = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** false quand l'écran a déjà un en-tête de navigation qui gère l'encoche. */
  safeTop?: boolean;
}>;

export function Screen({ title, subtitle, right, refreshing = false, onRefresh, safeTop = true, children }: Props) {
  return (
    <SafeAreaView edges={safeTop ? ['top'] : []} style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.neon} /> : undefined
        }>
        {title ? (
          <View style={styles.header}>
            <View style={styles.headerText}>
              {subtitle ? <Text variant="label">{subtitle}</Text> : null}
              <Text variant="title">{title}</Text>
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: spacing.xs },
  headerText: { gap: spacing.xs, flexShrink: 1 },
});
