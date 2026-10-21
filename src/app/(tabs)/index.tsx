import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { AnnouncementBanner } from '@/features/admin/components/announcement-banner';
import { useAdminRoles } from '@/features/admin/api';
import { useAuth } from '@/features/auth/auth-provider';
import { useMyChallenges } from '@/features/challenges/api';
import { challengeStep, needsMe } from '@/features/challenges/state';
import { useMyPoints } from '@/features/garage/api';
import { VirtualGarage } from '@/features/garage/components/VirtualGarage';
import { MissionsCard } from '@/features/missions/missions-card';
import { CommunityCard } from '@/features/social/components/community-card';
import { useBadgeStats, useEloHistory, useMyProfile, usePilotLapRecords, usePilotMatches } from '@/features/profile/api';
import { BadgesCard } from '@/features/profile/components/badges-card';
import { EloChart } from '@/features/profile/components/elo-chart';
import { LapRecordsCard } from '@/features/profile/components/lap-records-card';
import { MatchHistory } from '@/features/profile/components/match-history';
import { PaddockHero } from '@/features/profile/components/paddock-hero';
import { StatTiles } from '@/features/profile/components/stat-tiles';
import { useMyRaces } from '@/features/races/api';
import { raceNeedsMe, raceStep } from '@/features/races/state';
import { colors, radius, spacing } from '@/theme';

/** Le Paddock : tableau de bord du pilote connecté. */
export default function PaddockScreen() {
  const { userId, signOut } = useAuth();
  const profile = useMyProfile();
  const history = useEloHistory(profile.data?.id);
  const matches = usePilotMatches(profile.data?.id);
  const badges = useBadgeStats(profile.data?.id);
  const laps = usePilotLapRecords(profile.data?.id);
  const points = useMyPoints();
  const challenges = useMyChallenges();
  const races = useMyRaces();
  const roles = useAdminRoles().data;
  // Admins, et tant qu'aucun admin n'existe : accès pour se déclarer.
  const showAdmin = !!roles && (roles.is_app_admin || roles.managed_track_ids.length > 0 || !roles.admin_exists);

  const todo = userId
    ? (challenges.data ?? []).filter((c) => needsMe(challengeStep(c, userId))).length +
      (races.data ?? []).filter((r) => raceNeedsMe(raceStep(r, userId))).length
    : 0;
  const p = profile.data;
  const winRate = p && p.matches_played > 0 ? Math.round((p.wins / p.matches_played) * 100) : 0;

  return (
    <Screen
      refreshing={profile.isRefetching}
      onRefresh={() => {
        profile.refetch();
        history.refetch();
        matches.refetch();
        badges.refetch();
        laps.refetch();
        points.refetch();
        challenges.refetch();
        races.refetch();
      }}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.kicker}>
            <View style={styles.kickerBar} />
            <Text variant="label" style={styles.kickerText}>
              Le Paddock
            </Text>
          </View>
          <View style={styles.headerActions}>
            {showAdmin ? (
              <Pressable accessibilityLabel="Administration" onPress={() => router.push('/admin')} hitSlop={12}>
                <Icon name={icons.admin} color={colors.neon} />
              </Pressable>
            ) : null}
            <Pressable accessibilityLabel="Modifier ma licence" onPress={() => router.push('/edit-profile')} hitSlop={12}>
              <Icon name={icons.edit} color={colors.text} />
            </Pressable>
            <Pressable accessibilityLabel="Se déconnecter" onPress={signOut} hitSlop={12}>
              <Icon name={icons.logout} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
        <Text variant="display">
          Votre pilote,{'\n'}
          <Text variant="display" style={styles.highlight}>
            votre stratégie.
          </Text>
        </Text>
      </View>

      <AnnouncementBanner />

      {profile.isPending ? <Loading /> : null}
      {profile.error ? <ErrorState error={profile.error} /> : null}
      {p ? (
        <>
          <PaddockHero profile={p} />

          {todo > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/challenges')}
              style={({ pressed }) => [styles.alert, pressed && styles.pressed]}>
              <Icon name={icons.flame} color={colors.orange} />
              <View style={styles.alertText}>
                <Text style={styles.alertTitle}>
                  {todo} {todo > 1 ? 'actions attendent' : 'action attend'} ta réponse
                </Text>
                <Text variant="caption">Défis et courses en cours</Text>
              </View>
              <Icon name={icons.chevron} color={colors.textMuted} size={16} />
            </Pressable>
          ) : null}

          <StatTiles
            tiles={[
              { label: 'Victoires', value: p.wins },
              { label: 'Win rate', value: `${winRate}%`, color: colors.orange },
              { label: 'Matchs', value: p.matches_played, color: colors.text },
              { label: 'Points', value: points.data?.toLocaleString('fr-FR') ?? '—' },
            ]}
          />

          <MissionsCard />
          <CommunityCard />
          <VirtualGarage profileId={p.id} editable />
          {badges.data ? <BadgesCard stats={badges.data} /> : null}
          {history.data && history.data.length > 1 ? <EloChart points={history.data} /> : null}
          {laps.data ? <LapRecordsCard records={laps.data} isMe /> : null}
          {matches.data ? <MatchHistory matches={matches.data} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, marginBottom: spacing.xs },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kickerBar: { width: 18, height: 3, backgroundColor: colors.neon },
  kickerText: { color: colors.neon },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  highlight: { color: colors.neon },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.orange,
    backgroundColor: colors.surface,
  },
  alertText: { flex: 1, gap: 2 },
  alertTitle: { fontWeight: '800', fontSize: 15 },
  pressed: { opacity: 0.8 },
});
