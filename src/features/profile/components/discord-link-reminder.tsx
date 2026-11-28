import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { DiscordLinkCard } from '@/features/profile/components/discord-link-card';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme';

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** One reminder per week and account on this device; never shown over onboarding/promo consent. */
export function DiscordLinkReminder({ profileId, enabled }: { profileId: string; enabled: boolean }) {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [linking, setLinking] = useState(false);
  const storageKey = 'discord-link-reminder:' + profileId;
  const link = useQuery({
    queryKey: ['discord-link', profileId],
    enabled: ready && !isDemoMode,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_discord_link');
      if (error) throw error;
      return data as { discord_id?: string };
    },
    staleTime: 0,
  });

  useFocusEffect(useCallback(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (enabled && !isDemoMode && !dismissed) {
      void AsyncStorage.getItem(storageKey).then((value) => {
        const last = Number(value);
        if (active && (!last || Date.now() - last >= WEEK)) {
          timer = setTimeout(() => { if (active) setReady(true); }, 4000);
        }
      }).catch(() => {});
    }
    return () => {
      active = false;
      clearTimeout(timer);
      setReady(false);
    };
  }, [enabled, dismissed, storageKey]));

  const close = () => {
    setDismissed(true);
    setReady(false);
    void AsyncStorage.setItem(storageKey, String(Date.now())).catch(() => {});
  };
  const visible = ready && enabled && !dismissed && link.isSuccess && !link.isFetching && !link.data?.discord_id;
  return (
    <BottomSheet visible={visible || (ready && linking && !dismissed)} onClose={close} title="Ton compte Discord">
      <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
        {linking ? <DiscordLinkCard profileId={profileId} /> : (
          <View style={{ gap: spacing.lg }}>
            <Text variant="label" style={{ color: colors.neon }}>REJOINS LE PADDOCK</Text>
            <Text variant="title">Tes chronos, aussi sur Discord.</Text>
            <Text>Lie ton compte Kart Rivals pour retrouver ton profil et tes records sans retaper ton pseudo.</Text>
            <Button title="Lier mon compte" onPress={() => setLinking(true)} />
            <Button title="Plus tard" variant="quiet" onPress={close} />
            <Text variant="caption">Facultatif. Tu peux aussi le faire dans Modifier ma licence.</Text>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
