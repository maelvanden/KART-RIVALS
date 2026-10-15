import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { acceptedEntries, raceNeedsMe, raceStep, raceStepLabel } from '@/features/races/state';
import { dateTimeFormat } from '@/lib/format';
import { colors, radius, rankMeta, spacing } from '@/theme';
import type { Race } from '@/types/models';

export function RaceCard({ race, myId }: { race: Race; myId: string }) {
  const step = raceStep(race, myId);
  const myTurn = raceNeedsMe(step);
  const accepted = acceptedEntries(race);
  const organizer = race.entries.find((e) => e.pilot_id === race.organizer_id)?.pilot;
  const tone = myTurn ? colors.orange : step === 'done' ? colors.neon : colors.textMuted;

  return (
    <Link href={{ pathname: '/race/[id]', params: { id: race.id } }} asChild>
      <Pressable accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
        <Card style={[styles.card, myTurn && styles.highlight]}>
          <View style={styles.header}>
            <View style={[styles.status, { backgroundColor: myTurn ? colors.orangeDim : step === 'done' ? colors.neonDim : colors.surfaceAlt }]}>
              <Text style={[styles.statusText, { color: tone }]}>{raceStepLabel[step]}</Text>
            </View>
            <View style={styles.count}>
              <Icon name={icons.group} size={16} color={colors.textMuted} />
              <Text variant="caption">
                {accepted.length}/{race.entries.length}
              </Text>
            </View>
          </View>

          <Text variant="heading">Course à {race.entries.length} · {race.track.name}</Text>
          <Text variant="caption">
            {organizer ? `Organisée par ${race.organizer_id === myId ? 'toi' : organizer.username}` : ''}
            {race.scheduled_at ? ` · ${dateTimeFormat.format(new Date(race.scheduled_at))}` : ''}
            {race.format === 'lap_time' ? ' · meilleur tour' : ' · position'}
          </Text>

          <View style={styles.avatars}>
            {race.entries.map((e, i) => (
              <View
                key={e.pilot_id}
                style={[styles.avatarSlot, { marginLeft: i === 0 ? 0 : -10, opacity: e.status === 'declined' ? 0.3 : 1 }]}>
                <Avatar username={e.pilot.username} url={e.pilot.avatar_url} size={32} borderColor={rankMeta[e.pilot.rank].color} />
              </View>
            ))}
          </View>
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
  avatars: { flexDirection: 'row', marginTop: spacing.xs },
  avatarSlot: { borderRadius: 18, borderWidth: 2, borderColor: colors.surface },
});
