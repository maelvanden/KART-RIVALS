import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import {
  useCancelChallenge,
  useChallenge,
  useConfirmMatch,
  useDisputeMatch,
  useMatchEloDelta,
  useRespondChallenge,
  useSubmitResult,
} from '@/features/challenges/api';
import { ChallengeCard } from '@/features/challenges/components/challenge-card';
import { ResultForm } from '@/features/challenges/components/result-form';
import { ResultSummary } from '@/features/challenges/components/result-summary';
import { challengeStep } from '@/features/challenges/state';
import { colors, spacing } from '@/theme';

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const challenge = useChallenge(id);
  const respond = useRespondChallenge();
  const cancel = useCancelChallenge();
  const submit = useSubmitResult();
  const confirm = useConfirmMatch();
  const dispute = useDisputeMatch();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');

  const c = challenge.data;
  const isDone = c?.status === 'completed' || c?.match?.status === 'confirmed';
  const eloDelta = useMatchEloDelta(c?.match?.id, isDone);
  const actionError = [respond, cancel, submit, confirm, dispute].find((m) => m.error)?.error as Error | undefined;

  if (challenge.isPending) return <Screen safeTop={false}><Loading /></Screen>;
  if (challenge.error) return <Screen safeTop={false}><ErrorState error={challenge.error} /></Screen>;
  if (!c || !userId) return <Screen safeTop={false}><EmptyState title="Défi introuvable" /></Screen>;

  const step = challengeStep(c, userId);
  const rival = c.challenger_id === userId ? c.opponent : c.challenger;

  return (
    <Screen safeTop={false} refreshing={challenge.isRefetching} onRefresh={challenge.refetch}>
      <ChallengeCard challenge={c} myId={userId} />

      {step === 'awaiting_my_answer' ? (
        <View style={styles.actions}>
          <Button
            title="Refuser"
            variant="secondary"
            style={styles.action}
            onPress={() => respond.mutate({ id: c.id, accept: false })}
            disabled={respond.isPending}
          />
          <Button
            title="Accepter"
            style={styles.action}
            onPress={() => respond.mutate({ id: c.id, accept: true })}
            loading={respond.isPending}
          />
        </View>
      ) : null}

      {step === 'awaiting_their_answer' ? (
        <Notice text={`${rival.username} n’a pas encore répondu. Le défi expire 72 h après l’envoi.`} />
      ) : null}

      {step === 'to_race' ? (
        <>
          {c.match?.status === 'disputed' ? (
            <Notice
              tone="warning"
              text={`Résultat contesté${c.match.dispute_reason ? ` : « ${c.match.dispute_reason} »` : ''}. Saisissez à nouveau le bon résultat.`}
            />
          ) : null}
          <ResultForm
            challenge={c}
            myId={userId}
            submitting={submit.isPending}
            onSubmit={(result) => submit.mutate({ challengeId: c.id, result })}
          />
        </>
      ) : null}

      {c.match && (step === 'awaiting_my_validation' || step === 'awaiting_their_validation' || step === 'done') ? (
        <ResultSummary challenge={c} match={c.match} />
      ) : null}

      {step === 'awaiting_my_validation' && c.match ? (
        disputing ? (
          <Card style={styles.dispute}>
            <Input
              label="Qu’est-ce qui ne va pas ? (optionnel)"
              value={reason}
              onChangeText={setReason}
              placeholder="J’étais devant à l’arrivée"
              maxLength={500}
            />
            <View style={styles.actions}>
              <Button title="Annuler" variant="secondary" style={styles.action} onPress={() => setDisputing(false)} />
              <Button
                title="Contester"
                style={[styles.action, { backgroundColor: colors.orange }]}
                loading={dispute.isPending}
                onPress={() =>
                  dispute.mutate(
                    { matchId: c.match!.id, reason: reason.trim() || null },
                    { onSuccess: () => setDisputing(false) },
                  )
                }
              />
            </View>
          </Card>
        ) : (
          <View style={styles.actions}>
            <Button title="Contester" variant="secondary" style={styles.action} onPress={() => setDisputing(true)} />
            <Button title="Valider" style={styles.action} loading={confirm.isPending} onPress={() => confirm.mutate(c.match!.id)} />
          </View>
        )
      ) : null}

      {step === 'awaiting_their_validation' ? (
        <Notice text={`Résultat envoyé. L’ELO sera mis à jour dès que ${rival.username} l’aura validé.`} />
      ) : null}

      {step === 'done' ? (
        <Notice
          tone={eloDelta.data !== undefined && eloDelta.data !== null && eloDelta.data < 0 ? 'warning' : 'success'}
          text={
            eloDelta.data === undefined || eloDelta.data === null
              ? 'Résultat validé par les deux pilotes. L’ELO a été mis à jour.'
              : `Résultat validé · ${eloDelta.data >= 0 ? '+' : ''}${eloDelta.data} ELO pour toi.`
          }
        />
      ) : null}

      {step === 'closed' ? <Notice text={closedText[c.status] ?? 'Ce défi est clos.'} /> : null}

      {actionError ? <Text style={{ color: colors.danger }}>{actionError.message}</Text> : null}

      {step === 'awaiting_their_answer' || step === 'to_race' ? (
        <Button
          title="Annuler le défi"
          variant="quiet"
          loading={cancel.isPending}
          onPress={() => cancel.mutate(c.id)}
        />
      ) : null}
    </Screen>
  );
}

const closedText: Partial<Record<string, string>> = {
  declined: 'Défi refusé.',
  cancelled: 'Défi annulé.',
  expired: 'Défi expiré : pas de réponse dans les 72 h.',
  pending: 'Défi expiré : pas de réponse dans les 72 h.',
};

function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'success' | 'warning' }) {
  const color = tone === 'success' ? colors.neon : tone === 'warning' ? colors.orange : colors.textMuted;
  return (
    <Card style={[styles.notice, { borderColor: tone === 'info' ? colors.border : color }]}>
      <Text style={{ color }}>{text}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
  dispute: { gap: spacing.md },
  notice: { paddingVertical: spacing.md },
});
