import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { holdsRecord, targetGapMs, targetHeadline, targetSubline } from '@/features/lap-progress/targets';
import { formatLapTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { LapTarget } from '@/types/models';

type Props = {
  targets: LapTarget[];
  myId: string | null | undefined;
  /** Sur la fiche d'un circuit : l'objectif de ce circuit seulement, sans lien vers lui. */
  trackId?: string;
  /** Nombre de circuits affichés sur l'accueil. */
  limit?: number;
};

/** « Il te manque 0,32 s pour battre Lucas » : le prochain pilote à doubler, circuit par circuit. */
export function LapTargetsCard({ targets, myId, trackId, limit = 3 }: Props) {
  const list = trackId ? targets.filter((t) => t.track_id === trackId) : targets.slice(0, limit);
  if (list.length === 0) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="label">{trackId ? 'Ton objectif ici' : 'Tes objectifs'}</Text>
        <Icon name={icons.challenge} size={16} color={colors.textMuted} />
      </View>
      {list.map((t) => (
        <TargetRow key={t.track_id} target={t} myId={myId} showTrack={!trackId} />
      ))}
    </Card>
  );
}

function TargetRow({ target: t, myId, showTrack }: { target: LapTarget; myId: Props['myId']; showTrack: boolean }) {
  const record = holdsRecord(t, myId);
  const gap = targetGapMs(t);
  const headline = targetHeadline(t, myId);
  const subline = targetSubline(t, myId);
  // Sur l'accueil, la ligne ouvre le circuit ; sur la fiche circuit, elle ouvre le pilote à battre.
  const open = showTrack
    ? () => router.push({ pathname: '/track/[id]', params: { id: t.track_id } })
    : t.target_id
      ? () => router.push({ pathname: '/pilot/[id]', params: { id: t.target_id! } })
      : null;

  return (
    <Pressable
      accessibilityRole={open ? 'button' : undefined}
      accessibilityLabel={`${showTrack ? `${t.track_name}. ` : ''}${headline}. ${subline}.`}
      disabled={!open}
      onPress={() => open?.()}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.text}>
        {showTrack ? <Text variant="caption">{t.track_name}</Text> : null}
        <Text style={[styles.headline, record && { color: colors.neon }]}>{headline}</Text>
        <Text variant="caption">{subline}</Text>
      </View>
      <View style={styles.right}>
        {record ? (
          <Icon name={icons.crown} size={18} color={colors.neon} />
        ) : (
          <Text style={styles.gap}>{gap === null ? formatLapTime(t.lap_ms) : `−${formatLapTime(gap)}`}</Text>
        )}
        {open ? <Icon name={icons.chevron} size={14} color={colors.textMuted} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pressed: { opacity: 0.6 },
  text: { flex: 1, gap: 2 },
  headline: { fontSize: 15, fontWeight: '800' },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  gap: { fontSize: 16, fontWeight: '900', fontStyle: 'italic', color: colors.orange, fontVariant: ['tabular-nums'] },
});
