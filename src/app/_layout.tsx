import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { Loading } from '@/components/ui/state-views';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { useMyProfile } from '@/features/profile/api';
import { colors } from '@/theme';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.neon,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

function RootNavigator() {
  const { isLoading, userId } = useAuth();
  const profile = useMyProfile();

  if (isLoading || (userId && profile.isPending)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <Loading />
      </View>
    );
  }

  const hasProfile = !!profile.data;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!userId}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!userId && !hasProfile}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!!userId && hasProfile}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={navigationTheme}>
          <StatusBar style="light" />
          <RootNavigator />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
