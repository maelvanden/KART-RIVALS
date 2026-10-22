import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { DELETE_CONFIRMATION, useDeleteAccount } from '@/features/auth/delete-account';
import { confirmAction } from '@/lib/confirm';
import { colors, spacing } from '@/theme';

/** Zone de danger du profil : suppression définitive du compte (RGPD). */
export function DeleteAccountCard() {
  const remove = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const confirmed = typed.trim().toUpperCase() === DELETE_CONFIRMATION;

  if (!open) {
    return <Button title="Supprimer mon compte" variant="quiet" onPress={() => setOpen(true)} />;
  }
  return (
    <Card style={styles.card}>
      <Text variant="heading" style={{ color: colors.danger }}>
        Supprimer mon compte
      </Text>
      <Text variant="caption">
        Tout est effacé définitivement : licence, ELO et résultats, défis et courses, Time Attack et tickets, messages
        de la Radio, publications et photos, avis, points et équipement, position. Tes adversaires gardent leur ELO
        mais vos matchs disparaissent de leur historique. Si tu diriges une écurie, elle passe à un Directeur Sportif
        (ou au pilote le plus ancien).
      </Text>
      <Text variant="caption">Ce n’est pas réversible : pour revenir, il faudra recréer un compte à zéro.</Text>
      <Input
        label={`Tape ${DELETE_CONFIRMATION} pour confirmer`}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={DELETE_CONFIRMATION}
      />
      {remove.error ? <Text style={styles.error}>{remove.error.message}</Text> : null}
      <Button
        title="Supprimer définitivement"
        disabled={!confirmed}
        loading={remove.isPending}
        onPress={() =>
          confirmAction('Dernière confirmation', 'Ton compte et toutes tes données seront supprimés.', 'Supprimer', () =>
            remove.mutate(),
          )
        }
      />
      <Button title="Annuler" variant="ghost" onPress={() => (setOpen(false), setTyped(''), remove.reset())} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, borderColor: colors.danger },
  error: { color: colors.danger },
});
