import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import {
  placesLeft,
  useCancelSession,
  useJoinSession,
  useLeaveSession,
  useOpenSession,
  useStartSession,
} from '@/features/sessions/api';
import { sessionWhen } from '@/features/sessions/format';
import { confirmAction } from '@/lib/confirm';
import { colors, spacing } from '@/theme';

/** Une session ouverte : infos, pilotes inscrits, rejoindre / quitter, et pour l'organisateur lancer ou annuler. */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const session = useOpenSession(id);
  const join = useJoinSession();
  const leave = useLeaveSession();
  const cancel = useCancelSession();
  const start = useStartSession();
  const s = session.data;

  const isHost = s?.host_id === userId;
  const isIn = !!s?.participants.some((p) => p.profile_id === userId);
  const left = s ? placesLeft(s) : 0;
  const open = s?.status === 'open';
  const error = (join.error ?? leave.error ?? cancel.error ?? start.error) as Error | null;

  function openResult(raceId: string | null, challengeId: string | null) {
    if (raceId) router.replace({ pathname: '/race/[id]', params: { id: raceId } });
    else if (challengeId) router.replace({ pathname: '/challenge/[id]', params: { id: challengeId } });
  }

  return (
    <Screen safeTop={false} refreshing={session.isRefetching} onRefresh={session.refetch}>
      <Stack.Screen options={{ title: 'Session ouverte' }} />
      {session.isPending ? <Loading /> : null}
      {session.error ? <ErrorState error={session.error} /> : null}
      {session.data === null ? <EmptyState title="Session introuvable" message="Elle a peut-être été annulée." /> : null}
      {s ? (
        <>
          <Card style={styles.hero}>
            <Text style={styles.when}>{sessionWhen(s.starts_at)}</Text>
            {s.track ? (
              <View style={styles.line}>
                <Icon name={icons.pin} size={16} color={colors.textMuted} />
                <Text style={styles.link} onPress={() => router.push({ pathname: '/track/[id]', params: { id: s.track!.id } })}>
                  {s.track.name} · {s.track.city}
                </Text>
              </View>
            ) : null}
            <View style={styles.line}>
              <Icon name={icons.challenge} size={16} color={colors.textMuted} />
              <Text>
                {s.format === 'lap_time' ? 'Meilleur tour' : 'Classement'} · {s.participants.length}/{s.spots} pilotes
                {s.visibility === 'teammates' ? ' · coéquipiers' : ''}
              </Text>
            </View>
            {s.message ? <Text style={styles.message}>« {s.message} »</Text> : null}
            <Text style={[styles.status, !open && styles.statusMuted]}>
              {s.status === 'started'
                ? 'Session lancée'
                : s.status === 'cancelled'
                  ? 'Session annulée'
                  : s.status === 'expired'
                    ? 'Personne n’a rejoint : session expirée'
                    : left === 0
                      ? 'Complet'
                      : `Il reste ${left} place${left > 1 ? 's' : ''}`}
            </Text>
          </Card>

          {s.status === 'started' && (s.race_id || s.challenge_id) ? (
            <Button
              title={s.race_id ? 'Voir la course' : 'Voir le défi'}
              size="lg"
              onPress={() => openResult(s.race_id, s.challenge_id)}
            />
          ) : null}

          {open && !isIn ? (
            <Button
              title={left === 0 ? 'Complet' : 'Je rejoins la session'}
              size="lg"
              disabled={left === 0}
              loading={join.isPending}
              onPress={() => join.mutate(s.id)}
            />
          ) : null}
          {open && isIn && !isHost ? (
            <>
              <View style={styles.inRow}>
                <Icon name={icons.checkCircle} size={18} color={colors.neon} />
                <Text style={styles.inText}>Tu es inscrit. La course se créera toute seule à l’heure prévue.</Text>
              </View>
              <Button title="Me désinscrire" variant="quiet" loading={leave.isPending} onPress={() => leave.mutate(s.id)} />
            </>
          ) : null}
          {open && isHost ? (
            <Card style={styles.host}>
              <Text variant="label">Tu organises</Text>
              <Text variant="caption">
                À {sessionWhen(s.starts_at).split(' · ')[1]}, la session se lance automatiquement avec les inscrits. Tu peux
                aussi la lancer dès maintenant.
              </Text>
              <Button
                title="Lancer maintenant"
                disabled={s.participants.length < 2}
                loading={start.isPending}
                onPress={() => start.mutate(s.id, { onSuccess: (r) => openResult(r.race_id, r.challenge_id) })}
              />
              {s.participants.length < 2 ? <Text variant="caption">Il faut au moins un autre pilote.</Text> : null}
              <Button
                title="Annuler la session"
                variant="quiet"
                disabled={cancel.isPending}
                onPress={() =>
                  confirmAction('Annuler la session ?', 'Les pilotes inscrits ne pourront plus la rejoindre.', 'Annuler la session', () =>
                    cancel.mutate(s.id),
                  )
                }
              />
            </Card>
          ) : null}
          {error ? <Text style={styles.error}>{error.message}</Text> : null}

          <Text variant="label">Pilotes inscrits</Text>
          {s.participants.map((p) =>
            p.pilot ? (
              <PilotRow
                key={p.profile_id}
                pilotId={p.pilot.id}
                username={p.pilot.username}
                avatarUrl={p.pilot.avatar_url}
                rank={p.pilot.rank}
                elo={p.pilot.elo}
                subtitle={p.profile_id === s.host_id ? 'Organisateur' : 'Inscrit'}
                highlighted={p.profile_id === userId}
              />
            ) : null,
          )}
          {open
            ? Array.from({ length: left }, (_, i) => (
                <View key={`free-${i}`} style={styles.free}>
                  <Text variant="caption">Place libre</Text>
                </View>
              ))
            : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.neon },
  when: { fontSize: 22, fontWeight: '900', textTransform: 'capitalize' },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  link: { color: colors.neon, fontWeight: '700' },
  message: { color: colors.textMuted, fontStyle: 'italic' },
  status: { fontWeight: '900', color: colors.neon },
  statusMuted: { color: colors.textMuted },
  inRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inText: { flex: 1, fontWeight: '700' },
  host: { gap: spacing.sm },
  error: { color: colors.danger },
  free: {
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
  },
});
