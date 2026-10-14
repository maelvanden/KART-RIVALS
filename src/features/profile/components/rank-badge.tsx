import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { radius, rankMeta, spacing } from '@/theme';
import type { RankTier } from '@/types/models';

export function RankBadge({ rank, size = 'md' }: { rank: RankTier; size?: 'sm' | 'md' }) {
  const meta = rankMeta[rank];
  return (
    <View style={[styles.badge, size === 'sm' && styles.small, { borderColor: meta.color, backgroundColor: `${meta.color}1F` }]}>
      <Text style={[styles.text, size === 'sm' && styles.smallText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: spacing.sm, paddingVertical: 2 },
  text: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },
  smallText: { fontSize: 10 },
});
