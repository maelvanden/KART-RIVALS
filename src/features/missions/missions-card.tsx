import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useClaimMission, useMissions, type Mission } from '@/features/missions/api';
import { colors, fonts, radius, spacing } from '@/theme';

/** Jours restants avant la fin de la semaine de missions (dimanche soir). */
function daysLeft(weekEnd: string) {
  const end = new Date(`${weekEnd}T23:59:59`);
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
}

/** Paddock : missions de la semaine, progression et points à récupérer. */
export function MissionsCard() {
  const missions = useMissions();
  const claim = useClaimMission();
  const list = missions.data ?? [];
  if (list.length === 0) return null;

  const done = list.filter((m) => m.claimed).length;
  const ready = list.filter((m) => !m.claimed && m.progress >= m.target).length;
  const left = daysLeft(list[0].week_end);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Icon name={icons.flame} size={18} color={colors.orange} />
        <Text variant="label" style={styles.title}>
          Missions de la semaine
        </Text>
        <Text variant="caption">
          {done}/{list.length} · {left <= 1 ? 'dernier jour' : `${left} j restants`}
        </Text>
      </View>
      {ready > 0 ? (
        <Text style={styles.ready}>
          {ready} récompense{ready > 1 ? 's' : ''} à récupérer
        </Text>
      ) : null}
      {list.map((m) => (
        <MissionRow key={m.key} mission={m} busy={claim.isPending} onClaim={() => claim.mutate(m.key)} />
      ))}
      {claim.error ? <Text style={styles.error}>{claim.error.message}</Text> : null}
      <Pressable accessibilityRole="link" onPress={() => router.push('/shop')} style={styles.shop} hitSlop={6}>
        <Icon name={icons.shop} size={14} color={colors.neon} />
        <Text style={styles.shopText}>Dépenser mes points à la boutique</Text>
      </Pressable>
    </Card>
  );
}

function MissionRow({ mission: m, busy, onClaim }: { mission: Mission; busy: boolean; onClaim: () => void }) {
  const complete = m.progress >= m.target;
  return (
    <View style={[styles.row, m.claimed && styles.rowDone]}>
      <View style={[styles.check, complete && styles.checkDone]}>
        {complete ? <Icon name={icons.check} size={14} color={colors.onNeon} /> : null}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.missionTitle, m.claimed && styles.muted]} numberOfLines={1}>
            {m.title}
          </Text>
          {m.bonus ? <Text style={styles.bonus}>Bonus</Text> : null}
        </View>
        <Text variant="caption" numberOfLines={2}>
          {m.description}
        </Text>
        {m.target > 1 && !m.claimed ? (
          <View style={styles.progressRow}>
            <View style={styles.bar}>
              <View style={[styles.fill, { width: `${(m.progress / m.target) * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {m.progress}/{m.target}
            </Text>
          </View>
        ) : null}
      </View>
      {m.claimed ? (
        <Text style={styles.claimed}>+{m.points} ✓</Text>
      ) : complete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Récupérer ${m.points} points`}
          disabled={busy}
          onPress={onClaim}
          style={({ pressed }) => [styles.claim, (pressed || busy) && styles.pressed]}>
          <Text style={styles.claimText}>+{m.points}</Text>
        </Pressable>
      ) : (
        <Text style={styles.reward}>+{m.points}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.orange },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.text },
  ready: { fontWeight: '800', color: colors.neon, fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  rowDone: { opacity: 0.6 },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: colors.neon, borderColor: colors.neon },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  missionTitle: { fontWeight: '800', flexShrink: 1 },
  muted: { textDecorationLine: 'line-through' },
  bonus: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.orange,
    borderWidth: 1,
    borderColor: colors.orange,
    borderRadius: 4,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.neon },
  progressText: { fontSize: 12, fontWeight: '800', color: colors.textMuted },
  reward: { fontFamily: fonts.display, fontSize: 16, color: colors.textMuted },
  claimed: { fontWeight: '800', color: colors.neon, fontSize: 13 },
  claim: { backgroundColor: colors.neon, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  claimText: { fontFamily: fonts.display, fontSize: 16, color: colors.onNeon },
  pressed: { opacity: 0.75 },
  error: { color: colors.danger },
  shop: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 2 },
  shopText: { fontSize: 13, fontWeight: '700', color: colors.neon },
});
