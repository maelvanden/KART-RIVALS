import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { pickBanner } from '@/features/tournaments/api';
import { TournamentBanner } from '@/features/tournaments/components/tournament-banner';
import { colors, spacing } from '@/theme';

type Props = {
  /** Image affichée : URI locale choisie, ou bannière déjà en ligne. */
  uri: string | null;
  /** Photo du circuit, montrée tant qu'aucune bannière n'est choisie. */
  coverUrl?: string | null;
  onChange: (localUri: string | null) => void;
};

/** Aperçu de la bannière avec « Choisir une image » et « Retirer ». */
export function BannerField({ uri, coverUrl, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    setError(null);
    try {
      const picked = await pickBanner();
      if (picked) onChange(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d’ouvrir la galerie.');
    }
  }

  return (
    <View style={styles.field}>
      <TournamentBanner bannerUrl={uri} coverUrl={coverUrl} height={150} />
      <View style={styles.actions}>
        <Button title={uri ? 'Changer l’image' : 'Choisir une image'} variant="secondary" style={styles.action} onPress={choose} />
        {uri ? <Button title="Retirer" variant="quiet" onPress={() => onChange(null)} /> : null}
      </View>
      <Text variant="caption">
        {uri
          ? 'Format large (2:1), recadré à l’envoi.'
          : coverUrl
            ? 'Sans image, la photo du circuit sert de bannière.'
            : 'Sans image, le tournoi garde le fond par défaut.'}
      </Text>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  action: { flex: 1 },
});
