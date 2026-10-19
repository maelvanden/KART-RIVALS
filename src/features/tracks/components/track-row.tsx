import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { OfficialBadge } from '@/features/tracks/components/official-badge';
import { Text } from '@/components/ui/text';
import { formatKm, formatLapTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import type { TrackDetails } from '@/types/models';

type Props = { track: TrackDetails; distanceKm?: number | null; favorite?: boolean; recordMs?: number | null };

export function TrackTypeBadge({ indoor }: { indoor: boolean }) {
  const color = indoor ? colors.neon : colors.orange;
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: indoor ? colors.neonDim : colors.orangeDim }]}>
      <Text style={[styles.badgeText, { color }]}>{indoor ? 'Indoor' : 'Outdoor'}</Text>
    </View>
  );
}

export function TrackRow({ track, distanceKm, favorite, recordMs }: Props) {
  const facts = [
    track.length_m ? `${track.length_m.toLocaleString('fr-FR')} m` : null,
    track.kart_power,
    distanceKm != null ? `à ${formatKm(distanceKm)}` : null,
  ].filter(Boolean);

  return (
    <Link href={{ pathname: '/track/[id]', params: { id: track.id } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${track.name}, ${track.city}`}
        style={({ pressed }) => pressed && styles.pressed}>
        <View style={[styles.row, favorite && styles.favorite]}>
          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Text variant="heading" numberOfLines={1} style={styles.name}>
                {track.name}
              </Text>
              {track.is_official ? <OfficialBadge compact /> : null}
              {favorite ? <Icon name={icons.star} size={16} color={colors.neon} /> : null}
            </View>
            <Text variant="caption" numberOfLines={2}>
              {track.city}
              {facts.length ? ` · ${facts.join(' · ')}` : ''}
            </Text>
            {recordMs ? (
              <View style={styles.record}>
                <Icon name={icons.timer} size={12} color="#FFC83D" />
                <Text style={styles.recordText}>Record {formatLapTime(recordMs)}</Text>
              </View>
            ) : null}
          </View>
          <TrackTypeBadge indoor={track.is_indoor} />
          <Icon name={icons.chevron} size={18} color={colors.textMuted} />
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  favorite: { borderColor: colors.neon },
  pressed: { opacity: 0.85 },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1 },
  record: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recordText: { fontSize: 12, fontWeight: '800', color: '#FFC83D', fontVariant: ['tabular-nums'] },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
});
