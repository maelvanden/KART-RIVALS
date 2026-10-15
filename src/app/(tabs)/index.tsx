import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { ErrorState, Loading } from '@/components/ui/state-views';
import { useAuth } from '@/features/auth/auth-provider';
import { useBadgeStats, useEloHistory, useMyProfile, usePilotMatches } from '@/features/profile/api';
import { BadgesCard } from '@/features/profile/components/badges-card';
import { EloChart } from '@/features/profile/components/elo-chart';
import { LicenseCard } from '@/features/profile/components/license-card';
import { MatchHistory } from '@/features/profile/components/match-history';
import { colors, spacing } from '@/theme';

export default function LicenseScreen() {
  const { signOut } = useAuth();
  const profile = useMyProfile();
  const history = useEloHistory(profile.data?.id);
  const matches = usePilotMatches(profile.data?.id);
  const badges = useBadgeStats(profile.data?.id);

  return (
    <Screen
      subtitle="Paddock"
      title="Ma licence"
      refreshing={profile.isRefetching}
      onRefresh={() => {
        profile.refetch();
        history.refetch();
        matches.refetch();
        badges.refetch();
      }}
      right={
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel="Modifier ma licence" onPress={() => router.push('/edit-profile')} hitSlop={12}>
            <Icon name={icons.edit} color={colors.text} />
          </Pressable>
          <Pressable accessibilityLabel="Se déconnecter" onPress={signOut} hitSlop={12}>
            <Icon name={icons.logout} color={colors.textMuted} />
          </Pressable>
        </View>
      }>
      {profile.isPending ? <Loading /> : null}
      {profile.error ? <ErrorState error={profile.error} /> : null}
      {profile.data ? <LicenseCard profile={profile.data} /> : null}
      {badges.data ? <BadgesCard stats={badges.data} /> : null}
      {history.data && history.data.length > 1 ? <EloChart points={history.data} /> : null}
      {matches.data ? <MatchHistory matches={matches.data} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl, paddingBottom: spacing.sm },
});
