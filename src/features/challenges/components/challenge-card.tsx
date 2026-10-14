import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { RankBadge } from '@/features/profile/components/rank-badge';
import { colors, radius, spacing } from '@/theme';
import type { Challenge } from '@/types/models';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

type Props = {
  challenge: Challenge;
  myId: string;
  onRespond?: (accept: boolean) => void;
  responding?: boolean;
};

export function ChallengeCard({ challenge, myId, onRespond, responding }: Props) {
  const incoming = challenge.opponent_id === myId;
  const rival = incoming ? challenge.challenger : challenge.opponent;
  const awaitingMe = incoming && challenge.status === 'pending';
  const statusLabel =
    challenge.status === 'accepted' ? 'Accepté · à courir' : incoming ? 'Défi reçu' : 'En attente de réponse';

  return (
    <Card style={[styles.card, awaitingMe && styles.highlight]}>
      <View style={styles.header}>
        <View style={[styles.status, { backgroundColor: challenge.status === 'accepted' ? colors.neonDim : colors.orangeDim }]}>
          <Text style={[styles.statusText, { color: challenge.status === 'accepted' ? colors.neon : colors.orange }]}>
            {statusLabel}
          </Text>
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
        {challenge.scheduled_at ? <Detail icon={icons.clock} text={dateFormat.format(new Date(challenge.scheduled_at))} /> : null}
        <Detail icon={icons.bolt} text={challenge.format === 'lap_time' ? 'Meilleur tour' : 'Position à l’arrivée'} />
      </View>

      {challenge.message ? <Text style={styles.message}>« {challenge.message} »</Text> : null}

      {awaitingMe && onRespond ? (
        <View style={styles.actions}>
          <Button title="Refuser" variant="secondary" style={styles.action} onPress={() => onRespond(false)} disabled={responding} />
          <Button title="Accepter" style={styles.action} onPress={() => onRespond(true)} loading={responding} />
        </View>
      ) : null}
    </Card>
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
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
});
