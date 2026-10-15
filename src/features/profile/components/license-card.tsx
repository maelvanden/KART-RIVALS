import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { RankBadge } from '@/features/profile/components/rank-badge';
import { colors, radius, rankMeta, rankThresholds, spacing } from '@/theme';
import type { Profile } from '@/types/models';

function nextRankProgress(elo: number) {
  const idx = rankThresholds.findLastIndex((t) => elo >= t.min);
  const current = rankThresholds[idx];
  const next = rankThresholds[idx + 1];
  if (!next) return { next: null, progress: 1, remaining: 0 };
  // Le rang Novice n'a pas de plancher (0) : on mesure la barre sur 150 points, comme les autres rangs.
  const base = current.tier === 'novice' ? next.min - 150 : current.min;
  return {
    next: next.tier,
    progress: Math.min(1, Math.max(0, (elo - base) / (next.min - base))),
    remaining: next.min - elo,
  };
}

export function LicenseCard({ profile }: { profile: Profile }) {
  const { next, progress, remaining } = nextRankProgress(profile.elo);
  const winRate = profile.matches_played > 0 ? Math.round((profile.wins / profile.matches_played) * 100) : 0;
  const accent = rankMeta[profile.rank].color;

  return (
    <LinearGradient
      colors={['#1A2A12', colors.surface, '#2A160C']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}>
      <View style={styles.stripe} />
      <View style={styles.topRow}>
        <Text variant="label" style={styles.neonLabel}>Licence pilote · Kart Rivals</Text>
        {profile.kart_number ? (
          <View style={styles.numberPlate}>
            <Text style={styles.number}>{profile.kart_number}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.identity}>
        <View style={[styles.avatar, { borderColor: accent }]}>
          <Text style={styles.avatarText}>{profile.username.slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={styles.identityText}>
          <Text variant="title" numberOfLines={1}>{profile.username}</Text>
          <RankBadge rank={profile.rank} />
          {profile.home_track ? (
            <Text variant="caption" numberOfLines={1}>
              Circuit favori : {profile.home_track.name} · {profile.home_track.city}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.eloRow}>
        <View>
          <Text variant="label">ELO</Text>
          <Text style={styles.elo}>{profile.elo}</Text>
        </View>
        <View style={styles.progressBlock}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(4, progress * 100)}%` }]} />
          </View>
          <Text variant="caption">
            {next ? `${remaining} pts avant ${rankMeta[next].label}` : 'Rang maximum atteint'}
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat label="Victoires" value={profile.wins} color={colors.neon} />
        <Stat label="Défaites" value={profile.losses} color={colors.danger} />
        <Stat label="Nuls" value={profile.draws} color={colors.textMuted} />
        <Stat label="Win %" value={`${winRate}%`} color={colors.orange} />
      </View>
    </LinearGradient>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text variant="label" style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.xl,
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    right: -40,
    top: -20,
    width: 60,
    height: 260,
    backgroundColor: colors.neonDim,
    transform: [{ rotate: '24deg' }],
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  neonLabel: { color: colors.neon },
  numberPlate: {
    backgroundColor: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  number: { color: colors.background, fontWeight: '900', fontStyle: 'italic', fontSize: 18 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  avatarText: { fontSize: 22, fontWeight: '900', fontStyle: 'italic' },
  identityText: { flex: 1, gap: spacing.sm },
  eloRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xl },
  elo: { fontSize: 48, fontWeight: '900', fontStyle: 'italic', color: colors.neon, fontVariant: ['tabular-nums'], lineHeight: 52 },
  progressBlock: { flex: 1, gap: spacing.sm, paddingBottom: spacing.sm },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.neon, borderRadius: 4 },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
  },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 9 },
});
