import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useSearchPilots } from '@/features/nearby/api';
import {
  useFriendships,
  useRemoveFriend,
  useRespondFriendRequest,
  useSendFriendRequest,
} from '@/features/social/friends';
import { useOpenDirectRadio } from '@/features/social/radio';
import { colors, fonts, radius, spacing } from '@/theme';
import type { Friendship } from '@/types/models';

/** Coéquipiers (pilotes suivis) : recherche @pseudo, demandes, et défi / radio en un geste. */
export default function FriendsScreen() {
  const friendships = useFriendships();
  const send = useSendFriendRequest();
  const respond = useRespondFriendRequest();
  const remove = useRemoveFriend();
  const openRadio = useOpenDirectRadio();
  const [query, setQuery] = useState('');
  const q = query.replace(/^@/, '').trim();
  const search = useSearchPilots(q);

  const all = friendships.data ?? [];
  const byPilot = new Map(all.map((f) => [f.pilot.id, f]));
  const received = all.filter((f) => f.status === 'pending' && !f.outgoing);
  const sent = all.filter((f) => f.status === 'pending' && f.outgoing);
  const teammates = all.filter((f) => f.status === 'accepted').sort((a, b) => b.pilot.elo - a.pilot.elo);
  const error = (send.error ?? respond.error ?? remove.error ?? openRadio.error) as Error | null;

  async function radio(f: Friendship) {
    const id = await openRadio.mutateAsync(f.pilot.id);
    router.push({ pathname: '/radio/[id]', params: { id } });
  }

  function challenge(f: Friendship) {
    router.push({ pathname: '/challenge/new', params: { opponentId: f.pilot.id, username: f.pilot.username } });
  }

  return (
    <Screen safeTop={false} refreshing={friendships.isRefetching} onRefresh={friendships.refetch}>
      <Input
        label="Ajouter un pilote"
        value={query}
        onChangeText={setQuery}
        placeholder="@pseudo"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {q.length >= 2 ? (
        <View style={styles.list}>
          {search.isPending ? <Loading /> : null}
          {search.data?.length === 0 ? <EmptyState title="Aucun pilote trouvé" /> : null}
          {search.data?.map((p) => {
            const f = byPilot.get(p.id);
            // Demande reçue de ce pilote : « Accepter » (renvoyer une demande l'accepte côté serveur).
            const trailing =
              f?.status === 'accepted' ? (
                <Text variant="caption" style={styles.status}>
                  Coéquipier
                </Text>
              ) : f?.outgoing ? (
                <Text variant="caption">Demande envoyée</Text>
              ) : (
                <Chip title={f ? 'Accepter' : 'Suivre'} onPress={() => send.mutate(p.id)} disabled={send.isPending} />
              );
            return (
              <PilotRow
                key={p.id}
                pilotId={p.id}
                username={p.username}
                avatarUrl={p.avatar_url}
                rank={p.rank}
                elo={p.elo}
                subtitle={`@${p.username}`}
                trailing={trailing}
              />
            );
          })}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      {friendships.isPending ? <Loading /> : null}
      {friendships.error ? <ErrorState error={friendships.error} /> : null}

      {received.length > 0 ? (
        <>
          <SectionTitle title="Demandes reçues" detail={`${received.length}`} accent />
          {received.map((f) => (
            <Card key={f.id} style={styles.request}>
              <PilotRow
                pilotId={f.pilot.id}
                username={f.pilot.username}
                avatarUrl={f.pilot.avatar_url}
                rank={f.pilot.rank}
                elo={f.pilot.elo}
                subtitle="Veut faire équipe"
              />
              <View style={styles.requestActions}>
                <Chip title="Refuser" variant="dark" onPress={() => respond.mutate({ id: f.id, accept: false })} disabled={respond.isPending} />
                <Chip title="Accepter" onPress={() => respond.mutate({ id: f.id, accept: true })} disabled={respond.isPending} />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <SectionTitle title="Coéquipiers" detail={`${teammates.length}`} />
      {friendships.data && teammates.length === 0 ? (
        <EmptyState
          title="Aucun coéquipier"
          message="Cherche un pilote par son @pseudo et envoie-lui une demande : vous pourrez vous défier en un geste et parler sur la Radio Paddock."
        />
      ) : null}
      <View style={styles.list}>
        {teammates.map((f) => (
          <PilotRow
            key={f.id}
            pilotId={f.pilot.id}
            username={f.pilot.username}
            avatarUrl={f.pilot.avatar_url}
            rank={f.pilot.rank}
            elo={f.pilot.elo}
            subtitle={`${f.pilot.elo} ELO`}
            trailing={
              <View style={styles.actions}>
                <IconAction label={`Radio avec ${f.pilot.username}`} icon={icons.radio} onPress={() => radio(f)} />
                <IconAction label={`Défier ${f.pilot.username}`} icon={icons.challenge} onPress={() => challenge(f)} primary />
              </View>
            }
          />
        ))}
      </View>

      {sent.length > 0 ? (
        <>
          <SectionTitle title="Demandes envoyées" detail={`${sent.length}`} />
          {sent.map((f) => (
            <View key={f.id} style={styles.sentRow}>
              <Icon name={icons.clock} size={14} color={colors.textMuted} />
              <Text style={styles.sentName}>{f.pilot.username}</Text>
              <Chip title="Annuler" variant="dark" onPress={() => remove.mutate(f.pilot.id)} disabled={remove.isPending} />
            </View>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function SectionTitle({ title, detail, accent }: { title: string; detail?: string; accent?: boolean }) {
  return (
    <View style={styles.section}>
      <View style={[styles.sectionBar, accent && { backgroundColor: colors.orange }]} />
      <Text variant="label" style={styles.sectionTitle}>
        {title}
      </Text>
      {detail ? <Text variant="label">{detail}</Text> : null}
    </View>
  );
}

function Chip({ title, onPress, disabled, variant = 'volt' }: { title: string; onPress: () => void; disabled?: boolean; variant?: 'volt' | 'dark' }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, variant === 'dark' && styles.chipDark, (pressed || disabled) && styles.pressed]}>
      <Text style={[styles.chipText, variant === 'dark' && { color: colors.text }]}>{title}</Text>
    </Pressable>
  );
}

function IconAction({ label, icon, onPress, primary }: { label: string; icon: (typeof icons)[keyof typeof icons]; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconAction, primary && styles.iconActionPrimary, pressed && styles.pressed]}>
      <Icon name={icon} size={18} color={primary ? colors.onNeon : colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  status: { color: colors.neon },
  error: { color: colors.danger },
  section: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  sectionBar: { width: 10, height: 3, backgroundColor: colors.neon },
  sectionTitle: { flex: 1, color: colors.text },
  request: { gap: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.orange },
  requestActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sentName: { flex: 1, fontWeight: '700' },
  chip: { backgroundColor: colors.neon, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipDark: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderStrong },
  chipText: { fontFamily: fonts.display, fontSize: 14, letterSpacing: 1, color: colors.onNeon, textTransform: 'uppercase' },
  iconAction: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionPrimary: { backgroundColor: colors.neon, borderColor: colors.neon },
  pressed: { opacity: 0.7 },
});
