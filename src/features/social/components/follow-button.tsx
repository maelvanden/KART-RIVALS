import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useFriendshipWith, useRemoveFriend, useRespondFriendRequest, useSendFriendRequest } from '@/features/social/friends';
import { useOpenDirectRadio } from '@/features/social/radio';
import { colors, spacing } from '@/theme';

/** Sur la fiche d'un pilote : le suivre, répondre à sa demande, ou ouvrir la radio si vous êtes coéquipiers. */
export function FollowButton({ pilotId, username }: { pilotId: string; username: string }) {
  const friendship = useFriendshipWith(pilotId);
  const send = useSendFriendRequest();
  const respond = useRespondFriendRequest();
  const remove = useRemoveFriend();
  const openRadio = useOpenDirectRadio();
  const error = (send.error ?? respond.error ?? remove.error ?? openRadio.error) as Error | null;

  async function radio() {
    const id = await openRadio.mutateAsync(pilotId);
    router.push({ pathname: '/radio/[id]', params: { id } });
  }

  let content;
  if (friendship?.status === 'accepted') {
    content = (
      <View style={styles.row}>
        <View style={styles.teammate}>
          <Icon name={icons.checkCircle} size={18} color={colors.neon} />
          <Text style={styles.teammateText}>Coéquipier</Text>
        </View>
        <Button
          title="Radio"
          variant="secondary"
          icon={<Icon name={icons.radio} size={18} color={colors.text} />}
          loading={openRadio.isPending}
          onPress={radio}
          style={styles.flex}
        />
      </View>
    );
  } else if (friendship?.status === 'pending' && !friendship.outgoing) {
    content = (
      <View style={styles.row}>
        <Button
          title="Refuser"
          variant="secondary"
          style={styles.flex}
          disabled={respond.isPending}
          onPress={() => respond.mutate({ id: friendship.id, accept: false })}
        />
        <Button
          title="Accepter"
          style={styles.flex}
          loading={respond.isPending}
          onPress={() => respond.mutate({ id: friendship.id, accept: true })}
        />
      </View>
    );
  } else if (friendship?.status === 'pending') {
    content = <Button title="Annuler la demande" variant="quiet" loading={remove.isPending} onPress={() => remove.mutate(pilotId)} />;
  } else {
    content = (
      <Button
        title={`Suivre ${username}`}
        variant="secondary"
        icon={<Icon name={icons.recruit} size={18} color={colors.text} />}
        loading={send.isPending}
        onPress={() => send.mutate(pilotId)}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      {friendship?.status === 'pending' ? (
        <Text variant="caption">{friendship.outgoing ? 'Demande de coéquipier envoyée.' : `${username} veut faire équipe avec toi.`}</Text>
      ) : null}
      {content}
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  teammate: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  teammateText: { fontWeight: '800', color: colors.neon },
  error: { color: colors.danger },
});
