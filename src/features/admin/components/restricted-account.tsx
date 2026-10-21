import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { AccountStatus } from '@/features/admin/panel';
import { colors, spacing } from '@/theme';

/** Écran affiché à l'ouverture de l'appli quand le compte est suspendu ou banni. */
export function RestrictedAccount({ status, onSignOut, onRetry }: { status: AccountStatus; onSignOut: () => void; onRetry: () => void }) {
  const banned = !!status.banned_at;
  const until = status.suspended_until
    ? new Date(status.suspended_until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <View style={styles.screen}>
      <Icon name={icons.block} size={44} color={banned ? colors.danger : colors.orange} />
      <Text variant="display" style={styles.center}>
        {banned ? 'Compte banni' : 'Compte suspendu'}
      </Text>
      <Text style={styles.center}>
        {banned
          ? 'Ton compte a été bloqué par l’équipe Kart Rivals.'
          : `Ton compte est suspendu jusqu’au ${until}. Tu retrouveras l’appli ensuite.`}
      </Text>
      {status.reason ? <Text variant="caption" style={styles.center}>Motif : {status.reason}</Text> : null}
      <Text variant="caption" style={styles.center}>
        Une erreur ? Réponds au message de l’équipe ou contacte un admin.
      </Text>
      {!banned ? <Button title="Vérifier à nouveau" variant="secondary" onPress={onRetry} /> : null}
      <Button title="Se déconnecter" variant="quiet" onPress={onSignOut} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, padding: 32, backgroundColor: colors.background },
  center: { textAlign: 'center' },
});
