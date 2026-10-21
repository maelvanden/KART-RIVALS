import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { PendingWarning } from '@/features/admin/panel';
import { colors, radius, spacing } from '@/theme';

const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);

/** Avertissement officiel de l'équipe, affiché en plein écran tant que le pilote n'a pas confirmé l'avoir lu. */
export function WarningScreen({ warning, loading, onAcknowledge }: { warning: PendingWarning; loading: boolean; onAcknowledge: () => void }) {
  return (
    <View style={styles.screen}>
      <Icon name={icons.report} size={40} color={colors.orange} />
      <Text variant="label" style={styles.kicker}>
        {ordinal(warning.number)} avertissement
      </Text>
      <Text variant="display" style={styles.center}>
        Message de l’équipe Kart Rivals
      </Text>
      <View style={styles.message}>
        <Text style={styles.body}>{warning.message}</Text>
        <Text variant="caption">
          Le {new Date(warning.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>
      </View>
      <Text variant="caption" style={styles.center}>
        Kart Rivals doit rester fair-play. En cas de récidive, ton compte peut être suspendu ou banni.
      </Text>
      <Button title="J’ai compris" size="lg" loading={loading} onPress={onAcknowledge} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, padding: 28, backgroundColor: colors.background },
  kicker: { color: colors.orange },
  center: { textAlign: 'center' },
  message: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.orange,
    backgroundColor: colors.surface,
  },
  body: { fontSize: 16, lineHeight: 23 },
  button: { alignSelf: 'stretch' },
});
