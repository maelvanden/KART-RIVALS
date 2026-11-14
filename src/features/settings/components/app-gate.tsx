import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { APP_VERSION, storeUrl, type AppSettings } from '@/features/settings/app-settings';
import { colors, spacing } from '@/theme';

/** Écran affiché à la place de l'appli pendant une maintenance décidée par un admin. */
export function MaintenanceScreen({ settings, checking, onRetry }: { settings: AppSettings; checking: boolean; onRetry: () => void }) {
  return (
    <View style={styles.screen}>
      <Icon name={icons.clock} size={44} color={colors.orange} />
      <Text variant="display" style={styles.center}>
        Arrêt au stand
      </Text>
      <Text style={styles.center}>
        {settings.maintenance_message ?? 'Kart Rivals est en maintenance. On repart très vite, merci de ta patience.'}
      </Text>
      <Button title="Vérifier à nouveau" variant="secondary" loading={checking} onPress={onRetry} />
    </View>
  );
}

/** Écran affiché quand l'appli installée est plus ancienne que la version minimale exigée. */
export function UpdateRequiredScreen({ settings, checking, onRetry }: { settings: AppSettings; checking: boolean; onRetry: () => void }) {
  const url = storeUrl(settings);
  return (
    <View style={styles.screen}>
      <Icon name={icons.trending} size={44} color={colors.neon} />
      <Text variant="display" style={styles.center}>
        Mise à jour nécessaire
      </Text>
      <Text style={styles.center}>
        Cette version de Kart Rivals n’est plus prise en charge. Installe la dernière version pour continuer à rouler.
      </Text>
      <Text variant="caption" style={styles.center}>
        Version installée : {APP_VERSION} · version minimale : {settings.min_version}
      </Text>
      {url ? (
        <Button title="Mettre à jour" onPress={() => Linking.openURL(url).catch(() => {})} />
      ) : (
        <Text variant="caption" style={styles.center}>
          Ouvre l’App Store ou Google Play, cherche « Kart Rivals » et mets l’appli à jour.
        </Text>
      )}
      <Button title="Vérifier à nouveau" variant="secondary" loading={checking} onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, padding: 32, backgroundColor: colors.background },
  center: { textAlign: 'center' },
});
