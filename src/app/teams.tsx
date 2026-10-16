import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { withAlpha } from '@/features/social/colors';
import { TeamCrest } from '@/features/social/components/team-crest';
import { useTeamsDirectory } from '@/features/social/recruitment';
import { TEAM_MAX_MEMBERS, useMyTeam } from '@/features/social/teams';
import { colors, fonts, radius, spacing } from '@/theme';
import type { TeamSummary } from '@/types/models';

type Filter = 'recruiting' | 'ranking';

/** Annuaire des écuries : celles qui recrutent, et le classement des écuries (ELO moyen). */
export default function TeamsScreen() {
  const directory = useTeamsDirectory();
  const mine = useMyTeam();
  const [filter, setFilter] = useState<Filter>('recruiting');
  const all = directory.data ?? [];
  const list = filter === 'recruiting' ? all.filter((t) => t.recruiting && t.member_count < TEAM_MAX_MEMBERS) : all;

  return (
    <Screen safeTop={false} refreshing={directory.isRefetching} onRefresh={directory.refetch}>
      <Segmented
        options={[
          { value: 'recruiting', label: 'Qui recrutent' },
          { value: 'ranking', label: 'Classement' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {directory.isPending ? <Loading /> : null}
      {directory.error ? <ErrorState error={directory.error} /> : null}
      {directory.data && list.length === 0 ? (
        <EmptyState
          title={filter === 'recruiting' ? 'Aucune écurie ne recrute' : 'Aucune écurie'}
          message="Fonde la tienne et ouvre le recrutement depuis « Mon Écurie »."
        />
      ) : null}
      <View style={styles.list}>
        {list.map((t) => (
          <TeamRow key={t.id} team={t} mine={t.id === mine.data?.id} showMessage={filter === 'recruiting'} />
        ))}
      </View>
    </Screen>
  );
}

function TeamRow({ team: t, mine, showMessage }: { team: TeamSummary; mine: boolean; showMessage: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => (mine ? router.push('/team') : router.push({ pathname: '/team/[id]', params: { id: t.id } }))}
      style={({ pressed }) => [styles.row, { borderLeftColor: t.color }, mine && styles.mine, pressed && styles.pressed]}>
      <View style={styles.top}>
        <Text style={[styles.position, t.position <= 3 && { color: t.color }]}>{t.position}</Text>
        <TeamCrest tag={t.tag} logoUrl={t.logo_url} color={t.color} size={44} />
        <View style={styles.body}>
          <Text variant="heading" numberOfLines={1} style={styles.name}>
            {t.name}
          </Text>
          <View style={styles.meta}>
            <View style={[styles.tag, { borderColor: t.color, backgroundColor: withAlpha(t.color, 0.12) }]}>
              <Text style={[styles.tagText, { color: t.color }]}>{t.tag}</Text>
            </View>
            <Text variant="caption">
              {t.member_count}/{TEAM_MAX_MEMBERS} pilotes{mine ? ' · ton écurie' : ''}
            </Text>
          </View>
        </View>
        <View style={styles.right}>
          <Text style={styles.elo}>{t.elo}</Text>
          {t.recruiting ? <Text style={[styles.badge, { color: t.color }]}>Recrute</Text> : null}
        </View>
      </View>
      {showMessage && t.recruiting_message ? (
        <Text variant="caption" numberOfLines={2} style={styles.message}>
          « {t.recruiting_message} »
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
  },
  mine: { backgroundColor: colors.selected },
  pressed: { opacity: 0.8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  position: { width: 22, textAlign: 'center', fontFamily: fonts.display, fontSize: 20, color: colors.textMuted },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 18, lineHeight: 23 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 5, transform: [{ skewX: '-12deg' }] },
  tagText: { fontFamily: fonts.display, fontSize: 12, lineHeight: 17, letterSpacing: 0.8 },
  right: { alignItems: 'flex-end', gap: 2 },
  elo: { fontFamily: fonts.display, fontSize: 22, color: colors.text, fontVariant: ['tabular-nums'] },
  badge: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  message: { fontStyle: 'italic', paddingLeft: 22 + spacing.md },
});
