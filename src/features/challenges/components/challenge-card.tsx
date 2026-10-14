import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { challengeStep, needsMe, stepLabel } from '@/features/challenges/state';
import { RankBadge } from '@/features/profile/components/rank-badge';
import { dateTimeFormat } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import type { Challenge } from '@/types/models';

type Props = {
  challenge: Challenge;
  myId: string;
  /** Rend la carte cliquable vers l'écran du défi. */
  linked?: boolean;
};

export function ChallengeCard({ challenge, myId, linked }: Props) {
  const rival = challenge.opponent_id === myId ? challenge.challenger : challenge.opponent;
  const step = challengeStep(challenge, myId);
  const myTurn = needsMe(step);
  const tone = myTurn ? colors.orange : step === 'done' ? colors.neon : colors.textMuted;

  const card = (
    <Card style={[styles.card, myTurn && styles.highlight]}>
      <View style={styles.header}>
        <View style={[styles.status, { backgroundColor: myTurn ? colors.orangeDim : step === 'done' ? colors.neonDim : colors.surfaceAlt }]}>
          <Text style={[styles.statusText, { color: tone }]}>{stepLabel[step]}</Text>
        </View>
        <Icon name={challenge.format === 'lap_time' ? icons.timer : icons.challenge} size={18} color={colors.textMuted} />
      </View>

      <View style={styles.versus}>
        <Text variant="heading" style={styles.vs}>VS</Text>
        <View style={styles.rival}>
          <Text variant="heading">{rival.username}</Text>
          <View style={styles.rivalMeta}>
            <RankBadge rank={rival.rank} size="sm" />
            <Text variant="caption">{rival.elo} ELO</Text>
          </View>
        </View>
      </View>

      <View style={styles.details}>
        <Detail icon={icons.pin} text={`${challenge.track.name} · ${challenge.track.city}`} />
        {challenge.scheduled_at ? <Detail icon={icons.clock} text={dateTimeFormat.format(new Date(challenge.scheduled_at))} /> : null}
        <Detail icon={icons.bolt} text={challenge.format === 'lap_time' ? 'Meilleur tour' : 'Position à l’arrivée'} />
      </View>

      {challenge.message ? <Text style={styles.message}>« {challenge.message} »</Text> : null}
    </Card>
  );

  if (!linked) return card;
  return (
    <Link href={{ pathname: '/challenge/[id]', params: { id: challenge.id } }} asChild>
      <Pressable accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
        {card}
      </Pressable>
    </Link>
  );
}

function Detail({ icon, text }: { icon: (typeof icons)[keyof typeof icons]; text: string }) {
  return (
    <View style={styles.detail}>
      <Icon name={icon} size={14} color={colors.textMuted} />
      <Text variant="caption">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  highlight: { borderColor: colors.orange },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  statusText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  versus: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  vs: { color: colors.orange, fontStyle: 'italic', fontSize: 22 },
  rival: { gap: spacing.xs },
  rivalMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  details: { gap: spacing.xs },
  detail: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  message: { fontStyle: 'italic', color: colors.textMuted },
  pressed: { opacity: 0.85 },
});
