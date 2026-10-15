import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import {
  useCancelRace,
  useConfirmRace,
  useDisputeRace,
  useRace,
  useRaceEloDeltas,
  useRespondRace,
  useSubmitRaceResult,
} from '@/features/races/api';
import { RaceResultForm } from '@/features/races/components/race-result-form';
import { acceptedEntries, confirmationsNeeded, raceStep, raceStepLabel } from '@/features/races/state';
import { dateTimeFormat, formatLapTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { RaceEntry } from '@/types/models';

const podium = ['#FFC83D', '#C0C7D1', '#CD7F32'];
const entryLabel = { invited: 'Invité', accepted: 'Inscrit', declined: 'Absent' } as const;

export default function RaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const race = useRace(id);
  const respond = useRespondRace();
  const cancel = useCancelRace();
  const submit = useSubmitRaceResult();
  const confirm = useConfirmRace();
  const dispute = useDisputeRace();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  const r = race.data;
  const deltas = useRaceEloDeltas(id, r?.status === 'confirmed');

  if (race.isPending) return <Screen safeTop={false}><Loading /></Screen>;
  if (race.error) return <Screen safeTop={false}><ErrorState error={race.error} /></Screen>;
  if (!r || !userId) return <Screen safeTop={false}><EmptyState title="Course introuvable" /></Screen>;

  const step = raceStep(r, userId);
  const accepted = acceptedEntries(r);
  const confirmed = accepted.filter((e) => e.confirmed_at).length;
  const hasResult = r.status === 'awaiting_confirmation' || r.status === 'confirmed';
  const actionError = [respond, cancel, submit, confirm, dispute].find((m) => m.error)?.error as Error | undefined;

  const subtitle = (e: RaceEntry) => {
    if (r.status === 'confirmed' && deltas.data?.[e.pilot_id] !== undefined) {
      const d = deltas.data[e.pilot_id];
      return `${d >= 0 ? '+' : ''}${d} ELO`;
    }
    if (hasResult && e.status === 'accepted') return e.confirmed_at ? 'A validé' : 'Validation en attente';
    return `${e.pilot.elo} ELO${e.pilot_id === r.organizer_id ? ' · organisateur' : ''}`;
  };

  return (
    <Screen safeTop={false} refreshing={race.isRefetching} onRefresh={race.refetch}>
      <Stack.Screen options={{ title: `Course · ${r.track.name}` }} />

      <Card style={styles.header}>
        <Text variant="label" style={{ color: colors.orange }}>
          {raceStepLabel[step]}
        </Text>
        <Text variant="title" style={styles.title}>
          {r.track.name}
        </Text>
        <View style={styles.meta}>
          <Meta icon={icons.group} text={`${accepted.length} inscrits sur ${r.entries.length} pilotes`} />
          {r.scheduled_at ? <Meta icon={icons.clock} text={dateTimeFormat.format(new Date(r.scheduled_at))} /> : null}
          <Meta icon={icons.bolt} text={r.format === 'lap_time' ? 'Classement au meilleur tour' : 'Position à l’arrivée'} />
        </View>
        {r.message ? <Text style={styles.message}>« {r.message} »</Text> : null}
      </Card>

      {r.status === 'disputed' ? (
        <Notice tone="warning" text={`Résultat contesté${r.dispute_reason ? ` : « ${r.dispute_reason} »` : ''}. L’organisateur doit le ressaisir.`} />
      ) : null}

      <Text variant="label">{hasResult ? 'Classement' : 'Participants'}</Text>
      <View style={styles.list}>
        {r.entries.map((e) => (
          <PilotRow
            key={e.pilot_id}
            pilotId={e.pilot_id}
            username={e.pilot.username}
            avatarUrl={e.pilot.avatar_url}
            rank={e.pilot.rank}
            elo={e.pilot.elo}
            highlighted={e.pilot_id === userId}
            subtitle={subtitle(e)}
            leading={
              hasResult && e.position ? (
                <Text style={[styles.position, { color: podium[e.position - 1] ?? colors.textMuted }]}>{e.position}</Text>
              ) : undefined
            }
            trailing={
              hasResult && e.best_lap_ms ? (
                <Text style={styles.lap}>{formatLapTime(e.best_lap_ms)}</Text>
              ) : hasResult && e.confirmed_at ? (
                <Icon name={icons.checkCircle} size={22} color={colors.neon} />
              ) : hasResult ? (
                <View />
              ) : !hasResult ? (
                <Text variant="caption" style={{ color: e.status === 'accepted' ? colors.neon : colors.textMuted }}>
                  {entryLabel[e.status]}
                </Text>
              ) : undefined
            }
          />
        ))}
      </View>

      {step === 'invited' ? (
        <View style={styles.actions}>
          <Button title="Décliner" variant="secondary" style={styles.action} onPress={() => respond.mutate({ id: r.id, accept: false })} disabled={respond.isPending} />
          <Button title="Je participe" style={styles.action} onPress={() => respond.mutate({ id: r.id, accept: true })} loading={respond.isPending} />
        </View>
      ) : null}

      {step === 'waiting_start' ? (
        <>
          <Notice text="Tu es inscrit. L’organisateur saisira le résultat après la course." />
          {r.status === 'open' ? (
            <Button title="Me désister" variant="quiet" onPress={() => respond.mutate({ id: r.id, accept: false })} disabled={respond.isPending} />
          ) : null}
        </>
      ) : null}

      {step === 'to_submit' ? (
        accepted.length >= 3 ? (
          <RaceResultForm race={r} submitting={submit.isPending} onSubmit={(results) => submit.mutate({ id: r.id, results })} />
        ) : (
          <Notice text={`Il faut au moins 3 inscrits pour courir (${accepted.length} pour l’instant). Les invités qui n’ont pas répondu ne compteront pas.`} />
        )
      ) : null}

      {step === 'to_validate' ? (
        disputing ? (
          <Card style={styles.dispute}>
            <Input label="Qu’est-ce qui ne va pas ? (optionnel)" value={reason} onChangeText={setReason} maxLength={500} placeholder="J’ai fini 2e, pas 3e" />
            <View style={styles.actions}>
              <Button title="Annuler" variant="secondary" style={styles.action} onPress={() => setDisputing(false)} />
              <Button
                title="Contester"
                style={[styles.action, { backgroundColor: colors.orange }]}
                loading={dispute.isPending}
                onPress={() => dispute.mutate({ id: r.id, reason: reason.trim() || null }, { onSuccess: () => setDisputing(false) })}
              />
            </View>
          </Card>
        ) : (
          <View style={styles.actions}>
            <Button title="Contester" variant="secondary" style={styles.action} onPress={() => setDisputing(true)} />
            <Button title="Valider" style={styles.action} loading={confirm.isPending} onPress={() => confirm.mutate(r.id)} />
          </View>
        )
      ) : null}

      {hasResult && r.status !== 'confirmed' ? (
        <Notice text={`${confirmed} validation${confirmed > 1 ? 's' : ''} sur ${confirmationsNeeded(r)} nécessaires (majorité des ${accepted.length} participants).`} />
      ) : null}

      {step === 'done' ? <Notice tone="success" text="Course validée. L’ELO de chaque participant a été mis à jour." /> : null}
      {step === 'closed' ? <Notice text={r.status === 'cancelled' ? 'Course annulée.' : 'Tu ne participes pas à cette course.'} /> : null}

      {actionError ? <Text style={{ color: colors.danger }}>{actionError.message}</Text> : null}

      {r.organizer_id === userId && (r.status === 'open' || r.status === 'disputed') ? (
        <Button title="Annuler la course" variant="quiet" loading={cancel.isPending} onPress={() => cancel.mutate(r.id)} />
      ) : null}
    </Screen>
  );
}

function Meta({ icon, text }: { icon: (typeof icons)[keyof typeof icons]; text: string }) {
  return (
    <View style={styles.metaRow}>
      <Icon name={icon} size={14} color={colors.textMuted} />
      <Text variant="caption">{text}</Text>
    </View>
  );
}

function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'success' | 'warning' }) {
  const color = tone === 'success' ? colors.neon : tone === 'warning' ? colors.orange : colors.textMuted;
  return (
    <Card style={[styles.notice, { borderColor: tone === 'info' ? colors.border : color }]}>
      <Text style={{ color }}>{text}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  title: { fontSize: 26 },
  meta: { gap: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  message: { fontStyle: 'italic', color: colors.textMuted },
  list: { gap: spacing.sm },
  position: { width: 28, textAlign: 'center', fontSize: 20, fontWeight: '900', fontStyle: 'italic' },
  lap: { fontSize: 16, fontWeight: '900', fontStyle: 'italic', color: colors.neon, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
  dispute: { gap: spacing.md },
  notice: { paddingVertical: spacing.md },
});
