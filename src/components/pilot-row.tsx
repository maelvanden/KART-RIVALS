import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { RankBadge } from '@/features/profile/components/rank-badge';
import { colors, rankMeta, spacing } from '@/theme';
import type { RankTier } from '@/types/models';

type Props = {
  /** Si fourni, la ligne ouvre la fiche de ce pilote. */
  pilotId?: string;
  username: string;
  rank: RankTier;
  elo: number;
  subtitle: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  highlighted?: boolean;
};

export function PilotRow({ pilotId, username, rank, elo, subtitle, leading, trailing, highlighted }: Props) {
  const row = (
    <View style={[styles.row, highlighted && styles.highlighted]}>
      {leading}
      <View style={[styles.avatar, { borderColor: rankMeta[rank].color }]}>
        <Text style={styles.avatarText}>{username.slice(0, 2).toUpperCase()}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text variant="heading" numberOfLines={1} style={styles.name}>{username}</Text>
          <RankBadge rank={rank} size="sm" />
        </View>
        <Text variant="caption">{subtitle}</Text>
      </View>
      {trailing ?? <Text style={styles.elo}>{elo}</Text>}
    </View>
  );

  if (!pilotId) return row;
  return (
    <Link href={{ pathname: '/pilot/[id]', params: { id: pilotId } }} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`Voir la licence de ${username}`} style={({ pressed }) => pressed && styles.pressed}>
        {row}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  highlighted: { borderColor: colors.neon, backgroundColor: '#12190F' },
  pressed: { opacity: 0.85 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  avatarText: { fontWeight: '900', fontStyle: 'italic' },
  body: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1, fontSize: 16 },
  elo: { fontSize: 18, fontWeight: '900', color: colors.neon, fontVariant: ['tabular-nums'] },
});
