import { Tabs } from 'expo-router/js-tabs';
import { Platform, type ColorValue } from 'react-native';

import { Icon, icons, type IconName } from '@/components/ui/icon';
import { colors } from '@/theme';

const tabIcon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon name={name} color={color} size={size} />;
  };

export default function TabsLayout() {
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
      <Tabs.Screen name="challenges" options={{ title: 'Défis', tabBarIcon: tabIcon(icons.challenge) }} />
      <Tabs.Screen name="nearby" options={{ title: 'Pilotes', tabBarIcon: tabIcon(icons.nearby) }} />
      <Tabs.Screen name="leaderboard" options={{ title: 'Classement', tabBarIcon: tabIcon(icons.trophy) }} />
    </Tabs>
  );
}
