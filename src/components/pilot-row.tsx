import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Text } from '@/components/ui/text';
import { RankBadge } from '@/features/profile/components/rank-badge';
import { TeamTag } from '@/features/social/components/team-tag';
import { colors, rankMeta, spacing } from '@/theme';
import type { RankTier } from '@/types/models';

type Props = {
  /** Si fourni, la ligne ouvre la fiche de ce pilote. */
  pilotId?: string;
  username: string;
  avatarUrl?: string | null;
  rank: RankTier;
  elo: number;
  subtitle: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  highlighted?: boolean;
};

export function PilotRow({ pilotId, username, avatarUrl = null, rank, elo, subtitle, leading, trailing, highlighted }: Props) {
  const row = (
    <View style={[styles.row, highlighted && styles.highlighted]}>
      {leading}
      <Avatar username={username} url={avatarUrl} size={42} borderColor={rankMeta[rank].color} />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <TeamTag pilotId={pilotId} />
          <Text variant="heading" numberOfLines={1} style={styles.name}>{username}</Text>
        </View>
        {/* Rang sur la 2e ligne : le pseudo (et le tag d'écurie) gardent toute la largeur. */}
        <View style={styles.metaRow}>
          <RankBadge rank={rank} size="sm" />
          <Text variant="caption" numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
        </View>
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  subtitle: { flexShrink: 1 },
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
  highlighted: { borderColor: colors.neon, backgroundColor: colors.selected },
  pressed: { opacity: 0.85 },
  body: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1, fontSize: 16 },
  elo: { fontSize: 18, fontWeight: '900', color: colors.neon, fontVariant: ['tabular-nums'] },
});
