import { Tabs } from 'expo-router/js-tabs';
import { Platform, type ColorValue } from 'react-native';

import { Icon, icons, type IconName } from '@/components/ui/icon';
import { useAuth } from '@/features/auth/auth-provider';
import { useMyChallenges } from '@/features/challenges/api';
import { challengeStep, needsMe } from '@/features/challenges/state';
import { useMyRaces } from '@/features/races/api';
import { raceNeedsMe, raceStep } from '@/features/races/state';
import { colors } from '@/theme';

const tabIcon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon name={name} color={color} size={size} />;
  };

export default function TabsLayout() {
  const { userId } = useAuth();
  const challenges = useMyChallenges();
  const races = useMyRaces();
  // Pastille sur l'onglet Défis : nombre de défis où c'est au pilote d'agir.
  const todo = userId
    ? (challenges.data ?? []).filter((c) => needsMe(challengeStep(c, userId))).length +
      (races.data ?? []).filter((r) => raceNeedsMe(raceStep(r, userId))).length
    : 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.neon,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          // Sur le web, pas d'inset bas : on laisse de la place au libellé sous l'icône.
          ...(Platform.OS === 'web' ? { height: 60, paddingBottom: 6 } : {}),
        },
        tabBarLabelStyle: { fontWeight: '700', fontSize: 11, lineHeight: 14 },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Licence', tabBarIcon: tabIcon(icons.license) }} />
      <Tabs.Screen
        name="challenges"
        options={{
          title: 'Défis',
          tabBarIcon: tabIcon(icons.challenge),
          tabBarBadge: todo > 0 ? todo : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.orange, color: colors.background, fontWeight: '800' },
        }}
      />
      <Tabs.Screen name="nearby" options={{ title: 'Pilotes', tabBarIcon: tabIcon(icons.nearby) }} />
      <Tabs.Screen name="tracks" options={{ title: 'Circuits', tabBarIcon: tabIcon(icons.map) }} />
      <Tabs.Screen name="leaderboard" options={{ title: 'Classement', tabBarIcon: tabIcon(icons.trophy) }} />
    </Tabs>
  );
}
