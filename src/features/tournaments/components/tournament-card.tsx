import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { eliminatedIn, isStillIn, matchLabel, myCurrentMatch, roundCount, statusLabel } from '@/features/tournaments/bracket';
import { dateTimeFormat } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import type { Tournament } from '@/types/models';

/** Où en est le pilote connecté dans ce tournoi (null s'il n'y est pas inscrit). */
function myStatus(t: Tournament, myId: string): { text: string; urgent: boolean } | null {
  if (!t.entries.some((e) => e.pilot_id === myId)) return null;
  if (t.status === 'registration') return { text: 'Inscrit', urgent: false };
  if (t.status === 'completed') {
    if (t.champion_id === myId) return { text: '🏆 Vainqueur', urgent: false };
    if (t.runner_up_id === myId) return { text: 'Finaliste', urgent: false };
  }
  const current = myCurrentMatch(t, myId);
  if (current) return { text: `${matchLabel(current.round, roundCount(t.size))} à courir`, urgent: true };
  if (t.status === 'running' && isStillIn(t, myId)) return { text: 'Qualifié · en attente', urgent: false };
  const out = eliminatedIn(t, myId);
  return out ? { text: `Éliminé · ${matchLabel(out.round, roundCount(t.size)).toLowerCase()}`, urgent: false } : null;
}

export function TournamentCard({ tournament: t, myId }: { tournament: Tournament; myId: string }) {
  const mine = myStatus(t, myId);
  const champion = t.champion_id ? t.entries.find((e) => e.pilot_id === t.champion_id)?.pilot : undefined;
  const tone = mine?.urgent ? colors.orange : t.status === 'registration' ? colors.neon : colors.textMuted;

  return (
    <Link href={{ pathname: '/tournament/[id]', params: { id: t.id } }} asChild>
      <Pressable accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
        <Card style={[styles.card, mine?.urgent && styles.highlight]}>
          <View style={styles.header}>
            <View style={[styles.status, { backgroundColor: mine?.urgent ? colors.orangeDim : t.status === 'registration' ? colors.neonDim : colors.surfaceAlt }]}>
              <Text style={[styles.statusText, { color: tone }]}>{mine?.text ?? statusLabel[t.status]}</Text>
            </View>
            <View style={styles.count}>
              <Icon name={icons.group} size={16} color={colors.textMuted} />
              <Text variant="caption">
                {t.entries.length}/{t.size}
              </Text>
            </View>
          </View>

          <View style={styles.titleRow}>
            <Icon name={icons.trophy} size={20} color={t.status === 'completed' ? colors.neon : colors.textMuted} />
            <Text variant="heading" numberOfLines={1} style={styles.title}>
              {t.name}
            </Text>
          </View>
          <Text variant="caption">
            {t.track.name} · {t.track.city}
            {t.starts_at ? ` · ${dateTimeFormat.format(new Date(t.starts_at))}` : ''}
            {t.format === 'lap_time' ? ' · meilleur tour' : ' · position'}
          </Text>
          {champion ? <Text style={styles.champion}>Vainqueur : {champion.username}</Text> : null}
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  card: { gap: spacing.sm },
  highlight: { borderColor: colors.orange },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  statusText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
  champion: { color: colors.neon, fontWeight: '800' },
});
