import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { Oswald_600SemiBold } from '@expo-google-fonts/oswald/600SemiBold';
import { Oswald_700Bold } from '@expo-google-fonts/oswald/700Bold';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { RestrictedAccount } from '@/features/admin/components/restricted-account';
import { useAccountStatus } from '@/features/admin/panel';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { useChallengesRealtime } from '@/features/challenges/realtime';
import { useSocialRealtime } from '@/features/social/realtime';
import { useMyProfile } from '@/features/profile/api';
import { colors } from '@/theme';

// L'écran de lancement reste affiché jusqu'au chargement des polices (pas de saut de typo).
SplashScreen.preventAutoHideAsync().catch(() => {});

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

const detailHeader = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  // Titre en Oswald majuscules, comme le reste des titres de l'app.
  headerTitle: ({ children }: { children: string }) => (
    <Text variant="heading" numberOfLines={1}>
      {children}
    </Text>
  ),
  headerBackButtonDisplayMode: 'minimal' as const,
};

function RootNavigator() {
  const { isLoading, userId, signOut } = useAuth();
  const profile = useMyProfile();
  const account = useAccountStatus(profile.data ? userId : null);
  useChallengesRealtime(userId);
  useSocialRealtime(userId);

  if (isLoading || (userId && profile.isPending)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <Loading />
      </View>
    );
  }

  // Profil impossible à charger (réseau…) : on ne renvoie surtout pas vers la création de licence.
  if (userId && profile.error && profile.data === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: colors.background }}>
        <ErrorState error={profile.error} />
        <Button title="Réessayer" loading={profile.isFetching} onPress={() => profile.refetch()} />
      </View>
    );
  }

  const hasProfile = !!profile.data;

  // Compte suspendu ou banni par un admin : on bloque l'appli et on affiche le motif.
  const restriction = account.data;
  if (hasProfile && restriction && (restriction.banned_at || restriction.suspended_until)) {
    return <RestrictedAccount status={restriction} onSignOut={signOut} onRetry={() => account.refetch()} />;
  }

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
        <Stack.Screen
          name="challenge/new"
          options={{ ...detailHeader, presentation: 'modal', title: 'Lancer un défi' }}
        />
        <Stack.Screen name="challenge/[id]" options={{ ...detailHeader, title: 'Défi' }} />
        <Stack.Screen name="pilot/[id]" options={{ ...detailHeader, title: 'Pilote' }} />
        <Stack.Screen name="track/[id]" options={{ ...detailHeader, title: 'Circuit' }} />
        <Stack.Screen name="race/new" options={{ ...detailHeader, presentation: 'modal', title: 'Organiser une course' }} />
        <Stack.Screen name="race/[id]" options={{ ...detailHeader, title: 'Course' }} />
        <Stack.Screen name="time-attack" options={{ ...detailHeader, title: 'Time Attack' }} />
        <Stack.Screen name="shop" options={{ ...detailHeader, title: 'Boutique' }} />
        <Stack.Screen name="team/index" options={{ ...detailHeader, title: 'Mon Écurie' }} />
        <Stack.Screen name="team/new" options={{ ...detailHeader, presentation: 'modal', title: 'Fonder une écurie' }} />
        <Stack.Screen name="team/invite" options={{ ...detailHeader, presentation: 'modal', title: 'Recruter' }} />
        <Stack.Screen name="team/[id]" options={{ ...detailHeader, title: 'Écurie' }} />
        <Stack.Screen name="teams" options={{ ...detailHeader, title: 'Écuries' }} />
        <Stack.Screen name="friends" options={{ ...detailHeader, title: 'Coéquipiers' }} />
        <Stack.Screen name="feed/new" options={{ ...detailHeader, presentation: 'modal', title: 'Publier' }} />
        <Stack.Screen name="feed/[id]" options={{ ...detailHeader, title: 'Publication' }} />
        <Stack.Screen name="sessions/index" options={{ ...detailHeader, title: 'Sessions ouvertes' }} />
        <Stack.Screen name="sessions/new" options={{ ...detailHeader, presentation: 'modal', title: 'Je roule !' }} />
        <Stack.Screen name="sessions/[id]" options={{ ...detailHeader, title: 'Session ouverte' }} />
        <Stack.Screen name="events" options={{ ...detailHeader, title: 'Agenda des kartings' }} />
        <Stack.Screen name="event/[id]" options={{ ...detailHeader, title: 'Événement' }} />
        <Stack.Screen name="admin/event" options={{ ...detailHeader, presentation: 'modal', title: 'Publier' }} />
        <Stack.Screen name="admin/index" options={{ ...detailHeader, title: 'Administration' }} />
        <Stack.Screen name="admin/reports" options={{ ...detailHeader, title: 'Signalements' }} />
        <Stack.Screen name="admin/track/[id]" options={{ ...detailHeader, title: 'Gérer la fiche' }} />
        <Stack.Screen name="admin/track/new" options={{ ...detailHeader, presentation: 'modal', title: 'Nouveau circuit' }} />
        <Stack.Screen name="admin/pilots" options={{ ...detailHeader, title: 'Pilotes' }} />
        <Stack.Screen name="admin/pilot/[id]" options={{ ...detailHeader, title: 'Pilote' }} />
        <Stack.Screen name="admin/tracks" options={{ ...detailHeader, title: 'Circuits' }} />
        <Stack.Screen name="admin/announcements" options={{ ...detailHeader, title: 'Annonces' }} />
        <Stack.Screen name="admin/journal" options={{ ...detailHeader, title: 'Journal admin' }} />
        <Stack.Screen name="admin/content" options={{ ...detailHeader, title: 'Modération' }} />
        <Stack.Screen name="radio/index" options={{ ...detailHeader, title: 'Radio Paddock' }} />
        <Stack.Screen name="radio/[id]" options={{ ...detailHeader, title: 'Radio Paddock' }} />
        <Stack.Screen
          name="edit-profile"
          options={{ ...detailHeader, presentation: 'modal', title: 'Modifier ma licence' }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Oswald_600SemiBold,
    Oswald_700Bold,
  });
  // En cas d'échec, on continue avec les polices système plutôt que de bloquer l'app.
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

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
