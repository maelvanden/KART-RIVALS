import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { computeBadges, type Badge } from '@/features/profile/badges';
import { colors, radius, spacing } from '@/theme';
import type { BadgeStats } from '@/types/models';

const toneColor = { neon: colors.neon, orange: colors.orange, gold: '#FFC83D' } as const;

export function BadgesCard({ stats }: { stats: BadgeStats }) {
  const badges = computeBadges(stats);
  const unlocked = badges.filter((b) => b.unlocked).length;
  // Débloqués d'abord, puis les plus proches d'être obtenus.
  const sorted = [...badges].sort(
    (a, b) =>
      Number(b.unlocked) - Number(a.unlocked) ||
      (b.progress ? b.progress.value / b.progress.target : 0) - (a.progress ? a.progress.value / a.progress.target : 0),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = badges.find((b) => b.id === selectedId) ?? null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="label">
          Badges · {unlocked}/{badges.length}
        </Text>
        {stats.current_streak >= 2 ? (
          <View style={styles.streak}>
            <Icon name={icons.flame} size={14} color={colors.orange} />
            <Text style={styles.streakText}>{stats.current_streak} victoires d’affilée</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.grid}>
        {sorted.map((b) => (
          <BadgeTile
            key={b.id}
            badge={b}
            selected={b.id === selectedId}
            onPress={() => setSelectedId(b.id === selectedId ? null : b.id)}
          />
        ))}
      </View>

      <Text variant="caption" style={styles.detail}>
        {selected
          ? `${selected.title} — ${selected.description}${
              !selected.unlocked && selected.progress
                ? ` (${selected.progress.value}/${selected.progress.target})`
                : selected.unlocked
                  ? ' Débloqué.'
                  : ''
            }`
          : 'Touche un badge pour voir comment l’obtenir.'}
      </Text>
    </Card>
  );
}

function BadgeTile({ badge, selected, onPress }: { badge: Badge; selected: boolean; onPress: () => void }) {
  const color = badge.unlocked ? toneColor[badge.tone] : colors.textMuted;
  const ratio = badge.progress ? badge.progress.value / badge.progress.target : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${badge.title}${badge.unlocked ? ', débloqué' : ', verrouillé'}`}
      onPress={onPress}
      style={[styles.tile, selected && { borderColor: color }, !badge.unlocked && styles.locked]}>
      <View
        style={[
          styles.medal,
          { borderColor: color, backgroundColor: badge.unlocked ? `${color}22` : colors.surfaceAlt },
        ]}>
        <Icon name={badge.icon} size={22} color={color} />
        {!badge.unlocked ? (
          <View style={styles.lock}>
            <Icon name={icons.lock} size={10} color={colors.textMuted} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.title, { color: badge.unlocked ? colors.text : colors.textMuted }]} numberOfLines={2}>
        {badge.title}
      </Text>
      {!badge.unlocked && badge.progress && badge.progress.target > 1 ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(ratio * 100, 4)}%` }]} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.orangeDim,
  },
  streakText: { color: colors.orange, fontSize: 12, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '31.5%',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  locked: { opacity: 0.75 },
  medal: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lock: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  progressTrack: { width: '70%', height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.textMuted },
  detail: { minHeight: 36 },
});
