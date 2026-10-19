import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { placesLeft, type OpenSession } from '@/features/sessions/api';
import { sessionWhen } from '@/features/sessions/format';
import { colors, radius, rankMeta, spacing } from '@/theme';

type Props = { session: OpenSession; distanceKm?: number | null; hideTrack?: boolean; joined?: boolean };

/** Carte d'une session ouverte : quand, où, qui organise, places restantes et pilotes déjà inscrits. */
export function SessionCard({ session: s, distanceKm, hideTrack, joined }: Props) {
  const left = placesLeft(s);
  const started = s.status === 'started';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: s.id } })}
      style={({ pressed }) => [styles.card, joined && styles.joined, pressed && styles.pressed]}>
      <View style={styles.top}>
        <Text style={styles.when}>{sessionWhen(s.starts_at)}</Text>
        <Text style={[styles.places, left === 0 && styles.full, started && styles.started]}>
          {started ? 'Lancée' : left === 0 ? 'Complet' : `${left} place${left > 1 ? 's' : ''}`}
        </Text>
      </View>
      {!hideTrack && s.track ? (
        <Text style={styles.track} numberOfLines={1}>
          {s.track.name}
          <Text variant="caption">
            {' '}
            · {s.track.city}
            {distanceKm != null ? ` · à ${Math.round(distanceKm)} km` : ''}
          </Text>
        </Text>
      ) : null}
      {s.message ? (
        <Text variant="caption" numberOfLines={2}>
          « {s.message} »
        </Text>
      ) : null}
      <View style={styles.bottom}>
        <View style={styles.avatars}>
          {s.participants.slice(0, 5).map((p, i) =>
            p.pilot ? (
              <View key={p.profile_id} style={[styles.avatar, { marginLeft: i === 0 ? 0 : -10 }]}>
                <Avatar username={p.pilot.username} url={p.pilot.avatar_url} size={28} borderColor={rankMeta[p.pilot.rank].color} />
              </View>
            ) : null,
          )}
        </View>
        <Text variant="caption" style={styles.flex} numberOfLines={1}>
          {s.participants.length}/{s.spots} · par {s.host?.username ?? 'un pilote'}
        </Text>
        {s.visibility === 'teammates' ? <Icon name={icons.teammates} size={14} color={colors.textMuted} /> : null}
        <Text style={styles.format}>{s.format === 'lap_time' ? 'Chrono' : 'Course'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.neon,
    backgroundColor: colors.surface,
  },
  joined: { borderColor: colors.neon },
  pressed: { opacity: 0.8 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  when: { fontWeight: '900', fontSize: 15, textTransform: 'capitalize', flexShrink: 1 },
  places: { fontWeight: '800', fontSize: 13, color: colors.neon },
  full: { color: colors.orange },
  started: { color: colors.textMuted },
  track: { fontWeight: '800' },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  avatars: { flexDirection: 'row' },
  avatar: { borderRadius: 16, borderWidth: 2, borderColor: colors.surface },
  flex: { flex: 1 },
  format: { fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
});
