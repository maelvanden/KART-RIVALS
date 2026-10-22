import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { usePilotStandings, type PilotStandings } from '@/features/leaderboard/api';
import { DEPARTMENT_NAMES, ofDepartment, ofRegion, ordinal } from '@/lib/regions';
import { colors, radius, spacing } from '@/theme';

export type StandingsScope = 'department' | 'region' | 'global';

/** « 3e des Hauts-de-France, 1er du Nord » : la phrase qui résume les positions d'un pilote. */
export function standingsHeadline(s: PilotStandings): string | null {
  const parts = [
    s.region && s.region_position ? `${ordinal(s.region_position)} ${ofRegion(s.region)}` : null,
    s.department && s.department_position ? `${ordinal(s.department_position)} ${ofDepartment(s.department)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

type Props = {
  pilotId: string;
  /** Le pilote connecté : messages pour l'aider à entrer au classement. */
  isMe?: boolean;
  /** Touche une case : ouvre ce classement (sinon, ouvre l'onglet Classement). */
  onSelect?: (scope: StandingsScope) => void;
  active?: StandingsScope;
};

/** Positions départementale, régionale et nationale d'un pilote. */
export function StandingsCard({ pilotId, isMe, onSelect, active }: Props) {
  const standings = usePilotStandings(pilotId);
  const s = standings.data;
  if (!s) return null;

  const ranked = s.national != null;
  if (!ranked && !isMe) return null;
  const headline = standingsHeadline(s);
  const open = (scope: StandingsScope) => (onSelect ? onSelect(scope) : router.push('/leaderboard'));

  return (
    <Card style={styles.card}>
      <Text variant="label" style={{ color: colors.neon }}>
        {isMe ? 'Mes classements' : 'Classements'}
      </Text>
      {headline ? <Text style={styles.headline}>{headline}</Text> : null}
      {!ranked ? (
        <Text variant="caption">Valide ton premier défi pour entrer au classement de ton département, de ta région et de France.</Text>
      ) : !s.region && isMe ? (
        <Text variant="caption">Choisis ton circuit favori dans ton profil pour apparaître au classement de ta région.</Text>
      ) : null}
      {ranked ? (
        <View style={styles.row}>
          {s.department ? (
            <Tile
              label={DEPARTMENT_NAMES[s.department] ?? s.department}
              position={s.department_position}
              total={s.department_total}
              selected={active === 'department'}
              onPress={() => open('department')}
            />
          ) : null}
          {s.region ? (
            <Tile
              label={s.region}
              position={s.region_position}
              total={s.region_total}
              selected={active === 'region'}
              onPress={() => open('region')}
            />
          ) : null}
          <Tile label="France" position={s.national} total={s.national_total} selected={active === 'global'} onPress={() => open('global')} />
        </View>
      ) : null}
    </Card>
  );
}

function Tile({
  label,
  position,
  total,
  selected,
  onPress,
}: {
  label: string;
  position: number | null;
  total: number | null;
  selected: boolean;
  onPress: () => void;
}) {
  const podium = position != null && position <= 3;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${position ? ordinal(position) : 'Non classé'} sur ${total ?? 0}, ${label}`}
      onPress={onPress}
      style={[styles.tile, selected && styles.selected]}>
      <Text style={[styles.position, podium && { color: colors.neon }]}>{position ? ordinal(position) : '—'}</Text>
      <Text variant="caption" numberOfLines={1}>
        sur {total ?? 0}
      </Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  headline: { fontSize: 18, fontWeight: '900' },
  row: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    gap: 2,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  selected: { borderColor: colors.neon },
  position: { fontSize: 22, fontWeight: '900', fontStyle: 'italic', fontVariant: ['tabular-nums'] },
  label: { fontSize: 12, fontWeight: '800' },
});
