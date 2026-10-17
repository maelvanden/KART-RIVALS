import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useCanManageTrack, useMyTrackRequest, useRequestTrackAdmin } from '@/features/admin/api';
import { colors, spacing } from '@/theme';

/** Bas de la fiche circuit : « Gérer la fiche » pour ses admins, sinon demande d'accès pour l'exploitant. */
export function TrackManageLink({ trackId, trackName }: { trackId: string; trackName: string }) {
  const canManage = useCanManageTrack(trackId);
  const pending = useMyTrackRequest(canManage ? undefined : trackId);
  const request = useRequestTrackAdmin(trackId);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  if (canManage) {
    return (
      <Button
        title="Gérer la fiche"
        variant="secondary"
        icon={<Icon name={icons.admin} size={18} color={colors.text} />}
        onPress={() => router.push({ pathname: '/admin/track/[id]', params: { id: trackId } })}
      />
    );
  }

  return (
    <View>
      {pending.data ? (
        <View style={styles.pending}>
          <Icon name={icons.clock} size={14} color={colors.textMuted} />
          <Text variant="caption">Demande de gestion envoyée, en attente de validation.</Text>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)} hitSlop={8} style={styles.link}>
          <Icon name={icons.admin} size={14} color={colors.textMuted} />
          <Text variant="caption" style={styles.linkText}>
            Vous gérez ce karting ? Demander l’accès à la fiche
          </Text>
        </Pressable>
      )}
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Gérer la fiche" leading={<Icon name={icons.admin} color={colors.neon} />}>
        <View style={styles.sheet}>
          <Text variant="caption">
            Tu travailles à {trackName} ? Une fois validé par un admin, tu pourras mettre à jour la fiche : présentation,
            réservation, contacts, réseaux sociaux, position et tracé.
          </Text>
          <Input
            label="Ton rôle au karting"
            value={message}
            onChangeText={setMessage}
            placeholder="Gérant, responsable de piste… et un moyen de vérifier (site, téléphone du karting)"
            multiline
            maxLength={500}
            style={styles.multiline}
          />
          {request.error ? <Text style={styles.error}>{request.error.message}</Text> : null}
          <Button
            title="Envoyer la demande"
            loading={request.isPending}
            onPress={() =>
              request.mutate(message, {
                onSuccess: () => {
                  setOpen(false);
                  setMessage('');
                },
              })
            }
          />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  linkText: { textDecorationLine: 'underline' },
  pending: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  sheet: { gap: spacing.md, paddingBottom: spacing.sm },
  multiline: { minHeight: 90, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
});
