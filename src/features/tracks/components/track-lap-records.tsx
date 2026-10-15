import { StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Text } from '@/components/ui/text';
import { formatLapTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { TrackLapRecord } from '@/types/models';

const podium = ['#FFC83D', '#C0C7D1', '#CD7F32'];
const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** Top des meilleurs tours d'un circuit. */
export function TrackLapRecords({ records, myId }: { records: TrackLapRecord[]; myId: string | undefined }) {
  return (
    <View style={styles.list}>
      {records.map((r) => (
        <PilotRow
          key={r.pilot_id}
          pilotId={r.pilot_id}
          username={r.username}
          avatarUrl={r.avatar_url}
          rank={r.rank}
          elo={0}
          highlighted={r.pilot_id === myId}
          subtitle={r.position === 1 ? `Record · ${dayFormat.format(new Date(r.set_at))}` : dayFormat.format(new Date(r.set_at))}
          leading={<Text style={[styles.position, { color: podium[r.position - 1] ?? colors.textMuted }]}>{r.position}</Text>}
          trailing={
            <Text style={[styles.lap, r.position === 1 && { color: podium[0] }]}>{formatLapTime(r.lap_ms)}</Text>
          }
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  position: { width: 28, textAlign: 'center', fontSize: 20, fontWeight: '900', fontStyle: 'italic' },
  lap: { fontSize: 18, fontWeight: '900', fontStyle: 'italic', color: colors.neon, fontVariant: ['tabular-nums'] },
});
