import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon, icons } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { useMyChallenges } from '@/features/challenges/api';
import { challengeStep, stepLabel } from '@/features/challenges/state';
import { usePilotLapRecords } from '@/features/profile/api';
import { useMyRaces } from '@/features/races/api';
import { acceptedEntries, raceStep, raceStepLabel } from '@/features/races/state';
import { useTimeAttackSessions } from '@/features/time-attack/api';
import { dateTimeFormat, formatLapTime } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import type { SharePayload, ShareType } from '@/types/models';

type Props = { visible: boolean; onClose: () => void; onShare: (share: SharePayload) => void };

const tabs: { value: ShareType; label: string }[] = [
  { value: 'challenge', label: 'Défis' },
  { value: 'race', label: 'Courses' },
  { value: 'lap_record', label: 'Records' },
  { value: 'time_attack', label: 'Solo' },
];

/** Choix d'un défi, d'une course, d'un record ou d'une session Time Attack à partager dans la Radio. */
export function SharePicker({ visible, onClose, onShare }: Props) {
  const [tab, setTab] = useState<ShareType>('challenge');
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Partager" leading={<Icon name={icons.share} color={colors.neon} />}>
      <View style={styles.content}>
        <Segmented options={tabs} value={tab} onChange={setTab} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
          {visible ? <Items type={tab} onShare={onShare} /> : null}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

function Items({ type, onShare }: { type: ShareType; onShare: (share: SharePayload) => void }) {
  const items = useShareables(type);
  if (items === null) return <Loading />;
  if (items.length === 0) {
    return (
      <Text variant="caption" style={styles.empty}>
        {type === 'challenge'
          ? 'Aucun défi pour l’instant.'
          : type === 'race'
            ? 'Aucune course pour l’instant.'
            : type === 'lap_record'
              ? 'Aucun record : valide un défi au meilleur tour pour en établir un.'
              : 'Aucune session Time Attack validée.'}
      </Text>
    );
  }
  return (
    <>
      {items.map((s) => (
        <Pressable
          key={`${s.type}-${s.id}`}
          accessibilityRole="button"
          onPress={() => onShare(s)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {s.title}
            </Text>
            {s.subtitle ? (
              <Text variant="caption" numberOfLines={1}>
                {s.subtitle}
              </Text>
            ) : null}
          </View>
          {s.highlight ? <Text style={styles.highlight}>{s.highlight}</Text> : null}
          <Icon name={icons.send} size={16} color={colors.neon} />
        </Pressable>
      ))}
    </>
  );
}

/** Éléments partageables de l'onglet, au format carte (null pendant le chargement). */
function useShareables(type: ShareType): SharePayload[] | null {
  const { userId } = useAuth();
  const challenges = useMyChallenges();
  const races = useMyRaces();
  const laps = usePilotLapRecords(userId ?? undefined);
  const sessions = useTimeAttackSessions();
  if (!userId) return [];

  switch (type) {
    case 'challenge':
      return challenges.data
        ? challenges.data
            .filter((c) => challengeStep(c, userId) !== 'closed')
            .slice(0, 15)
            .map((c) => {
              const rival = c.challenger_id === userId ? c.opponent : c.challenger;
              const won = c.match?.status === 'confirmed' ? c.match.winner_id : undefined;
              return {
                type,
                id: c.id,
                title: `Défi vs ${rival.username}`,
                subtitle: `${c.track.name} · ${stepLabel[challengeStep(c, userId)]}`,
                highlight: won === undefined ? undefined : won === null ? 'Nul' : won === userId ? 'V' : 'D',
              };
            })
        : null;
    case 'race':
      return races.data
        ? races.data
            .filter((r) => raceStep(r, userId) !== 'closed')
            .slice(0, 15)
            .map((r) => {
              const me = r.entries.find((e) => e.pilot_id === userId);
              return {
                type,
                id: r.id,
                title: `Course · ${r.track.name}`,
                subtitle: `${acceptedEntries(r).length} pilotes · ${raceStepLabel[raceStep(r, userId)]}`,
                highlight: r.status === 'confirmed' && me?.position ? `P${me.position}` : undefined,
              };
            })
        : null;
    case 'lap_record':
      return laps.data
        ? laps.data.map((l) => ({
            type,
            id: l.track_id,
            title: `Record · ${l.track_name}`,
            subtitle: `${l.position}${l.position === 1 ? 'er' : 'e'} sur ${l.pilots} pilote${l.pilots > 1 ? 's' : ''}`,
            highlight: formatLapTime(l.lap_ms),
          }))
        : null;
    case 'time_attack':
      return sessions.data
        ? sessions.data
            .filter((s) => s.status === 'validated')
            .map((s) => ({
              type,
              id: s.id,
              title: `Time Attack · ${s.track.name}`,
              subtitle: dateTimeFormat.format(new Date(s.ticket_at ?? s.check_in_at)),
              highlight: s.best_lap_ms ? formatLapTime(s.best_lap_ms) : undefined,
            }))
        : null;
  }
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  scroll: { maxHeight: 420 },
  list: { gap: spacing.sm, paddingBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.8 },
  text: { flex: 1, gap: 2 },
  title: { fontWeight: '800' },
  highlight: { fontFamily: fonts.display, fontSize: 18, color: colors.neon, fontVariant: ['tabular-nums'] },
  empty: { textAlign: 'center', paddingVertical: spacing.xl },
});
