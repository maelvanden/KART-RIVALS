import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { formatLapTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { PilotLapRecord } from '@/types/models';

const GOLD = '#FFC83D';

/** Meilleur tour du pilote sur chaque circuit où il a couru au chrono. */
export function LapRecordsCard({ records, isMe }: { records: PilotLapRecord[]; isMe: boolean }) {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="label">Records du tour</Text>
        <Icon name={icons.timer} size={16} color={colors.textMuted} />
      </View>
      {records.length === 0 ? (
        <Text variant="caption">
          {isMe
            ? 'Aucun chrono validé pour l’instant. Lance un défi au format « meilleur tour » pour poser ton premier temps.'
            : 'Aucun chrono validé pour l’instant.'}
        </Text>
      ) : (
        records.map((r) => {
          const holder = r.position === 1;
          return (
            <Link key={r.track_id} href={{ pathname: '/track/[id]', params: { id: r.track_id } }} asChild>
              <Pressable accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
                <View style={styles.row}>
                  <View style={styles.body}>
                    <Text style={styles.track} numberOfLines={1}>
                      {r.track_name}
                    </Text>
                    <Text variant="caption" style={holder ? { color: GOLD } : undefined}>
                      {holder ? 'Record du circuit' : `${r.position}e sur ${r.pilots} pilotes`}
                    </Text>
                  </View>
                  <Text style={[styles.lap, holder && { color: GOLD }]}>{formatLapTime(r.lap_ms)}</Text>
                </View>
              </Pressable>
            </Link>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pressed: { opacity: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  body: { flex: 1, gap: 2 },
  track: { fontSize: 15, fontWeight: '800' },
  lap: { fontSize: 22, fontWeight: '900', fontStyle: 'italic', color: colors.neon, fontVariant: ['tabular-nums'] },
});
