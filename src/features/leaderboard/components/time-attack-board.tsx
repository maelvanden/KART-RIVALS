import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Chips } from '@/components/ui/chips';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { formatGap } from '@/features/lap-progress/progress';
import { useTimeAttackLeaderboard, useTimeAttackTracks } from '@/features/leaderboard/time-attack';
import { formatLapTime } from '@/lib/format';
import { colors } from '@/theme';

const podium = ['#FFC83D', '#C0C7D1', '#CD7F32'];

type Props = { myId: string | null; homeTrackId: string | null };

/**
 * Classement Time Attack : on choisit un circuit (le circuit favori du pilote par défaut s'il a des chronos), puis le
 * meilleur tour certifié par ticket de chaque pilote, avec l'écart au premier.
 */
export function TimeAttackBoard({ myId, homeTrackId }: Props) {
  const tracks = useTimeAttackTracks(true);
  const [selected, setSelected] = useState<string | null>(null);

  // Circuit favori en tête de liste, puis les plus disputés.
  const list = [...(tracks.data ?? [])].sort(
    (a, b) => Number(b.track_id === homeTrackId) - Number(a.track_id === homeTrackId),
  );
  const trackId = list.find((t) => t.track_id === selected)?.track_id ?? list[0]?.track_id ?? null;
  const track = list.find((t) => t.track_id === trackId);
  const board = useTimeAttackLeaderboard(trackId);
  const leader = board.data?.[0];

  if (tracks.isLoading) return <Loading />;
  if (tracks.error) return <ErrorState error={tracks.error} />;
  if (list.length === 0) {
    return (
      <EmptyState
        title="Aucun chrono Time Attack"
        message="Lance un Time Attack depuis l’onglet Défis et photographie ton ticket : ton temps ouvrira le classement."
      />
    );
  }

  return (
    <>
      {list.length > 1 ? (
        <Chips
          options={list.map((t) => ({
            value: t.track_id,
            label: `${t.track_name}${t.track_id === homeTrackId ? ' · favori' : ''}`,
          }))}
          value={trackId}
          onChange={setSelected}
        />
      ) : null}
      {track ? (
        <Text variant="label">
          {track.track_name} · {track.pilots} pilote{track.pilots > 1 ? 's' : ''}
        </Text>
      ) : null}
      <Text variant="caption">Meilleur tour certifié par ticket de chaque pilote.</Text>

      {board.isLoading ? <Loading /> : null}
      {board.error ? <ErrorState error={board.error} /> : null}
      {board.data?.map((entry) => (
        <PilotRow
          key={entry.pilot_id}
          pilotId={entry.pilot_id}
          username={entry.username}
          avatarUrl={entry.avatar_url}
          rank={entry.rank}
          elo={0}
          // Court : la ligne partage la place avec le badge de rang.
          subtitle={entry.position === 1 ? 'Record' : `+${formatGap(entry.lap_ms - (leader?.lap_ms ?? entry.lap_ms))}`}
          highlighted={entry.pilot_id === myId}
          leading={
            <Text style={[styles.position, { color: podium[entry.position - 1] ?? colors.textMuted }]}>
              {entry.position}
            </Text>
          }
          trailing={
            <Text style={[styles.lap, entry.position === 1 && { color: podium[0] }]}>{formatLapTime(entry.lap_ms)}</Text>
          }
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  position: { width: 28, textAlign: 'center', fontSize: 20, fontWeight: '900', fontStyle: 'italic' },
  lap: { fontSize: 18, fontWeight: '900', fontStyle: 'italic', color: colors.neon, fontVariant: ['tabular-nums'] },
});
