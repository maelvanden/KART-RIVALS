import { Pressable } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { ErrorState, Loading } from '@/components/ui/state-views';
import { useAuth } from '@/features/auth/auth-provider';
import { useEloHistory, useMyProfile } from '@/features/profile/api';
import { EloChart } from '@/features/profile/components/elo-chart';
import { LicenseCard } from '@/features/profile/components/license-card';
import { colors } from '@/theme';

export default function LicenseScreen() {
  const { signOut } = useAuth();
  const profile = useMyProfile();
  const history = useEloHistory(profile.data?.id);

  return (
    <Screen
      subtitle="Paddock"
      title="Ma licence"
      refreshing={profile.isRefetching}
      onRefresh={() => {
        profile.refetch();
        history.refetch();
      }}
      right={
        <Pressable accessibilityLabel="Se déconnecter" onPress={signOut} hitSlop={12}>
          <Icon name={icons.logout} color={colors.textMuted} />
        </Pressable>
      }>
      {profile.isPending ? <Loading /> : null}
      {profile.error ? <ErrorState error={profile.error} /> : null}
      {profile.data ? <LicenseCard profile={profile.data} /> : null}
      {history.data ? <EloChart points={history.data} /> : null}
    </Screen>
  );
}
