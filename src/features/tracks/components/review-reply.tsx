import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { isStaff, useAdminRoles, useCanManageTrack } from '@/features/admin/api';
import { REPLY_MAX, REPLY_MIN, useDeleteReply, useReplyToReview, type TrackReview } from '@/features/tracks/reviews';
import { confirmAction } from '@/lib/confirm';
import { colors, radius, spacing } from '@/theme';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Réponse du circuit sous un avis : visible de tous, signée du circuit. Les admins du circuit (et les admins appli)
 * peuvent répondre, modifier ou retirer ; l'équipe Kart Rivals peut retirer une réponse inappropriée.
 * `manage` désactive les boutons (ex. sur son propre avis).
 */
export function ReviewReply({ review, trackId, trackName, manage = true }: { review: TrackReview; trackId: string; trackName: string; manage?: boolean }) {
  const canManage = useCanManageTrack(trackId) && manage;
  const staff = isStaff(useAdminRoles().data) && manage;
  const reply = useReplyToReview();
  const remove = useDeleteReply();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState('');
  const r = review.reply;
  const ready = body.trim().length >= REPLY_MIN;

  function open() {
    reply.reset();
    setBody(r?.body ?? '');
    setEditing(true);
  }

  return (
    <View style={styles.wrap}>
      {r && !editing ? (
        <View style={styles.reply}>
          <Text variant="label" style={styles.label}>
            Réponse de {trackName}
          </Text>
          <Text style={styles.body}>{r.body}</Text>
          <Text variant="caption">
            {dateFmt.format(new Date(r.updated_at))}
            {r.updated_at !== r.created_at ? ' · modifiée' : ''}
          </Text>
        </View>
      ) : null}

      {editing ? (
        <View style={styles.form}>
          <Input
            label={`Réponse publique, signée ${trackName} (${body.trim().length}/${REPLY_MAX})`}
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={REPLY_MAX}
            placeholder="Merci pour ton retour… Reste courtois : ta réponse est visible de tous les pilotes."
            style={styles.multiline}
          />
          {reply.error ? <Text style={styles.error}>{reply.error.message}</Text> : null}
          <View style={styles.actions}>
            <Button title="Annuler" variant="quiet" onPress={() => setEditing(false)} />
            <Button
              title={r ? 'Mettre à jour' : 'Publier la réponse'}
              loading={reply.isPending}
              disabled={!ready}
              onPress={() => reply.mutate({ reviewId: review.id, body }, { onSuccess: () => setEditing(false) })}
            />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          {canManage ? <Button title={r ? 'Modifier la réponse' : 'Répondre'} variant="secondary" onPress={open} /> : null}
          {r && (canManage || staff) ? (
            <Button
              title="Retirer la réponse"
              variant="quiet"
              disabled={remove.isPending}
              onPress={() =>
                confirmAction('Retirer la réponse ?', 'Elle disparaît de l’avis pour tous les pilotes.', 'Retirer', () => remove.mutate(review.id))
              }
            />
          ) : null}
        </View>
      )}
      {remove.error ? <Text style={styles.error}>{remove.error.message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  reply: { gap: 2, padding: spacing.md, borderRadius: radius.md, borderLeftWidth: 3, borderLeftColor: colors.neon, backgroundColor: colors.surfaceAlt },
  label: { color: colors.neon },
  body: { lineHeight: 21 },
  form: { gap: spacing.sm },
  multiline: { minHeight: 90, paddingTop: 14, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  error: { color: colors.danger },
});
