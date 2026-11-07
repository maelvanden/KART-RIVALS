import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useSetPromoPush } from '@/features/profile/api';
import { colors, spacing } from '@/theme';
import type { Profile } from '@/types/models';

/**
 * Demande, une fois, l'accord pour les notifications promos et événements des kartings (jamais activées par défaut :
 * règle 4.5.4 d'Apple et RGPD). Fermer sans répondre : la question revient à la prochaine ouverture.
 */
export function PromoConsentSheet({ profile }: { profile: Profile | null | undefined }) {
  const setPromo = useSetPromoPush();
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pending = profile?.promo_push === null;

  // Laisse d'abord passer la demande d'autorisation des notifications du téléphone.
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setReady(true), 2500);
    return () => clearTimeout(timer);
  }, [pending]);

  const answer = (enabled: boolean) => setPromo.mutate(enabled, { onSuccess: () => setDismissed(true) });

  return (
    <BottomSheet visible={pending && ready && !dismissed} onClose={() => setDismissed(true)}>
      <View style={styles.body}>
        <View style={styles.badge}>
          <Icon name={icons.megaphone} size={26} color={colors.onNeon} />
        </View>
        <Text variant="heading" style={styles.center}>
          Promos et événements des kartings près de chez toi ?
        </Text>
        <Text style={styles.center}>
          Réductions, Grand Prix, soirées nocturnes… On ne t’envoie que ce qui concerne tes circuits.
        </Text>
        <Button title="Oui, je veux en profiter" size="lg" loading={setPromo.isPending && setPromo.variables} onPress={() => answer(true)} />
        <Button title="Non merci" variant="quiet" disabled={setPromo.isPending} onPress={() => answer(false)} />
        <Text variant="caption" style={styles.center}>
          Tu peux changer d’avis à tout moment dans Modifier ma licence.
        </Text>
        {setPromo.error ? <Text style={styles.error}>{setPromo.error.message}</Text> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, alignItems: 'stretch', paddingBottom: spacing.md },
  badge: { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  error: { color: colors.danger, textAlign: 'center' },
});
