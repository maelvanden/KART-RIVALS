import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { thirdPlaces } from '@/features/tournaments/bracket';
import { colors, radius, spacing } from '@/theme';
import type { PilotSummary, Tournament } from '@/types/models';

const GOLD = '#FFC83D';
const SILVER = '#C0C7D1';
const BRONZE = '#CD7F32';

/**
 * Podium : vainqueur au centre, finaliste, et en bronze le vainqueur de la petite finale (sinon les deux
 * demi-finalistes battus, ex æquo).
 */
export function Podium({ tournament: t }: { tournament: Tournament }) {
  const pilot = (id: string | null) => t.entries.find((e) => e.pilot_id === id)?.pilot;
  const champion = pilot(t.champion_id);
  if (!champion) return null;
  const runnerUp = pilot(t.runner_up_id);
  const thirds = thirdPlaces(t).map(pilot).filter((p): p is PilotSummary => !!p);

  return (
    <Card style={styles.card}>
      <Text variant="label" style={styles.title}>
        Podium
      </Text>
      <View style={styles.steps}>
        <Step pilot={runnerUp} place="2" color={SILVER} height={64} points={100} />
        <Step pilot={champion} place="1" color={GOLD} height={92} points={300} champion />
        <Step pilot={thirds[0]} place="3" color={BRONZE} height={44} points={t.third_place ? 50 : undefined} />
      </View>
      {t.third_place && !t.third_place_id && t.status === 'running' ? (
        <Text variant="caption" style={styles.title}>
          La petite finale reste à jouer pour la 3e place.
        </Text>
      ) : null}
      {thirds[1] ? (
        <Text variant="caption" style={styles.title}>
          3e ex æquo : {thirds[1].username}
        </Text>
      ) : null}
    </Card>
  );
}

function Step({
  pilot,
  place,
  color,
  height,
  points,
  champion,
}: {
  pilot: PilotSummary | undefined;
  place: string;
  color: string;
  height: number;
  points?: number;
  champion?: boolean;
}) {
  if (!pilot) return <View style={styles.step} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${place}${place === '1' ? 'er' : 'e'} : ${pilot.username}`}
      onPress={() => router.push({ pathname: '/pilot/[id]', params: { id: pilot.id } })}
      style={styles.step}>
      {champion ? <Icon name={icons.trophy} size={26} color={GOLD} /> : null}
      <Avatar username={pilot.username} url={pilot.avatar_url} size={champion ? 60 : 46} borderColor={color} />
      <Text numberOfLines={1} style={[styles.name, champion && { color: colors.neon }]}>
        {pilot.username}
      </Text>
      <View style={[styles.block, { height, borderColor: color }]}>
        <Text style={[styles.place, { color }]}>{place}</Text>
        {points ? <Text variant="caption">+{points} pts</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, borderColor: colors.neon },
  title: { textAlign: 'center' },
  steps: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  name: { fontWeight: '800', fontSize: 13, maxWidth: '100%' },
  block: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 3,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  place: { fontSize: 24, fontWeight: '900' },
});
