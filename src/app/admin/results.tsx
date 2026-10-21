import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import {
  useAdminDisputes,
  useAdminTimeAttacks,
  useResolveMatch,
  useResolveRace,
  useReviewTimeAttack,
  useTicketUrl,
  type MatchDispute,
  type RaceDispute,
  type TimeAttackReview,
} from '@/features/admin/panel';
import { confirmAction } from '@/lib/confirm';
import { formatLapTime, formatMessageTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

type Tab = 'disputes' | 'time_attack';

/** Résultats : litiges à trancher et Time Attack suspects à revoir avec le ticket. */
export default function AdminResultsScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const [tab, setTab] = useState<Tab>('disputes');
  const [taFilter, setTaFilter] = useState<'suspect' | 'recent'>('suspect');
  const disputes = useAdminDisputes(isAppAdmin);
  const suspects = useAdminTimeAttacks('suspect', isAppAdmin);
  const timeAttacks = useAdminTimeAttacks(taFilter, isAppAdmin && tab === 'time_attack');

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  return (
    <Screen
      safeTop={false}
      refreshing={disputes.isRefetching || timeAttacks.isRefetching}
      onRefresh={() => {
        disputes.refetch();
        suspects.refetch();
        timeAttacks.refetch();
      }}>
      <Segmented
        options={[
          { value: 'disputes', label: `Litiges ${disputes.data?.length || ''}`.trim() },
          { value: 'time_attack', label: `Time Attack ${suspects.data?.length || ''}`.trim() },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'disputes' ? (
        <>
          <Text variant="caption">
            Défis et courses contestés, ou en attente de confirmation depuis plus de 3 jours. Valider applique l’ELO comme
            une confirmation normale ; annuler ne change rien à l’ELO.
          </Text>
          {disputes.isPending ? <Loading /> : null}
          {disputes.error ? <ErrorState error={disputes.error} /> : null}
          {disputes.data?.length === 0 ? <EmptyState title="Aucun litige" message="Tous les résultats sont réglés." /> : null}
          {disputes.data?.map((d) => (d.kind === 'match' ? <MatchCard key={d.id} dispute={d} /> : <RaceCard key={d.id} dispute={d} />))}
        </>
      ) : (
        <>
          <Segmented
            options={[
              { value: 'suspect', label: 'Suspects' },
              { value: 'recent', label: 'Récents' },
            ]}
            value={taFilter}
            onChange={setTaFilter}
          />
          <Text variant="caption">
            {taFilter === 'suspect'
              ? 'Chronos validés à plus de 3 % sous le meilleur temps précédent du circuit. Compare avec la photo du ticket.'
              : 'Les 30 derniers Time Attack validés.'}
          </Text>
          {timeAttacks.isPending ? <Loading /> : null}
          {timeAttacks.error ? <ErrorState error={timeAttacks.error} /> : null}
          {timeAttacks.data?.length === 0 ? (
            <EmptyState title={taFilter === 'suspect' ? 'Aucun chrono suspect' : 'Aucun Time Attack'} />
          ) : null}
          {timeAttacks.data?.map((t) => <TimeAttackCard key={t.id} session={t} />)}
        </>
      )}
    </Screen>
  );
}

function Header({ title, track, date, waiting }: { title: string; track: string; date: string; waiting: boolean }) {
  return (
    <View style={styles.head}>
      <Text style={[styles.kind, { color: waiting ? colors.textMuted : colors.orange }]}>{waiting ? 'En attente' : title}</Text>
      <Text style={styles.bold}>{track}</Text>
      <Text variant="caption">Déclaré {formatMessageTime(date)}</Text>
    </View>
  );
}

function MatchCard({ dispute: d }: { dispute: MatchDispute }) {
  const resolve = useResolveMatch();
  const [note, setNote] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const lap = d.format === 'lap_time';
  const value = (pos: number | null, ms: number | null) => (lap ? (ms ? formatLapTime(ms) : '—') : pos ? `${pos}e` : '—');
  const contester = d.submitted_by === d.challenger.username ? d.opponent.username : d.challenger.username;
  // Saisie de la correction : position (1, 2) ou chrono (« 32.456 » ou « 1:02.345 »).
  const parse = (v: string) => {
    if (!lap) return Number(v);
    const m = v.trim().replace(',', '.').match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
    return m ? Math.round((Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000) : NaN;
  };

  const decide = (decision: 'validate' | 'correct' | 'cancel', title: string, message: string) =>
    confirmAction(title, message, 'Confirmer', () =>
      resolve.mutate({
        matchId: d.id,
        decision,
        note,
        ...(decision === 'correct'
          ? lap
            ? { challengerLapMs: parse(a), opponentLapMs: parse(b) }
            : { challengerPosition: parse(a), opponentPosition: parse(b) }
          : {}),
      }),
    );

  return (
    <Card style={[styles.card, d.status === 'disputed' && styles.disputed]}>
      <Header title="Défi contesté" track={d.track} date={d.created_at} waiting={d.status !== 'disputed'} />
      {[
        { p: d.challenger, v: value(d.challenger_position, d.challenger_best_lap_ms) },
        { p: d.opponent, v: value(d.opponent_position, d.opponent_best_lap_ms) },
      ].map(({ p, v }) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/admin/pilot/[id]', params: { id: p.id } })}
          style={styles.pilotRow}>
          <Text style={[styles.flex, styles.bold, d.winner === p.username && styles.winner]}>
            {p.username} <Text variant="caption">· {p.elo}</Text>
          </Text>
          <Text style={styles.value}>{v}</Text>
        </Pressable>
      ))}
      <Text variant="caption">
        Déclaré par {d.submitted_by ?? '?'} · {d.winner ? `vainqueur : ${d.winner}` : 'égalité'}
      </Text>
      {d.dispute_reason ? (
        <View style={styles.quote}>
          <Text variant="caption">Contestation de {contester} :</Text>
          <Text style={styles.italic}>« {d.dispute_reason} »</Text>
        </View>
      ) : null}

      {correcting ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Input label={d.challenger.username} value={a} onChangeText={setA} placeholder={lap ? '32.456' : '1'} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.flex}>
            <Input label={d.opponent.username} value={b} onChangeText={setB} placeholder={lap ? '33.012' : '2'} keyboardType="numbers-and-punctuation" />
          </View>
        </View>
      ) : null}
      <Input label="Note (journal)" value={note} onChangeText={setNote} placeholder="Vidéo vérifiée, témoins…" />
      {resolve.error ? <Text style={styles.error}>{resolve.error.message}</Text> : null}
      {correcting ? (
        <Button
          title="Valider la correction"
          loading={resolve.isPending}
          onPress={() => decide('correct', 'Valider ce résultat corrigé ?', 'L’ELO des deux pilotes sera calculé sur ta correction.')}
        />
      ) : (
        <Button
          title="Valider le résultat déclaré"
          loading={resolve.isPending}
          onPress={() => decide('validate', 'Valider le résultat déclaré ?', 'L’ELO des deux pilotes est mis à jour.')}
        />
      )}
      <View style={styles.row}>
        <Button
          title={correcting ? 'Retour' : 'Corriger'}
          variant="secondary"
          style={styles.flex}
          onPress={() => setCorrecting((c) => !c)}
        />
        <Button
          title="Annuler le défi"
          variant="quiet"
          style={styles.flex}
          disabled={resolve.isPending}
          onPress={() => decide('cancel', 'Annuler ce défi ?', 'Aucun ELO ne change, le défi est clos.')}
        />
      </View>
    </Card>
  );
}

function RaceCard({ dispute: d }: { dispute: RaceDispute }) {
  const resolve = useResolveRace();
  const [note, setNote] = useState('');
  const complete = d.entries.every((e) => e.position != null);
  const decide = (decision: 'validate' | 'cancel', title: string, message: string) =>
    confirmAction(title, message, 'Confirmer', () => resolve.mutate({ raceId: d.id, decision, note }));

  return (
    <Card style={[styles.card, d.status === 'disputed' && styles.disputed]}>
      <Header title="Course contestée" track={d.track} date={d.created_at} waiting={d.status !== 'disputed'} />
      {d.entries.map((e) => (
        <Pressable
          key={e.pilot_id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/admin/pilot/[id]', params: { id: e.pilot_id } })}
          style={styles.pilotRow}>
          <Text style={styles.pos}>{e.position ?? '—'}</Text>
          <Text style={[styles.flex, styles.bold]}>
            {e.username} <Text variant="caption">· {e.elo}</Text>
          </Text>
          {e.best_lap_ms ? <Text style={styles.value}>{formatLapTime(e.best_lap_ms)}</Text> : null}
          <Icon name={e.confirmed ? icons.checkCircle : icons.clock} size={16} color={e.confirmed ? colors.neon : colors.textMuted} />
        </Pressable>
      ))}
      <Text variant="caption">Classement déclaré par {d.organizer} · ✓ = a confirmé</Text>
      {d.dispute_reason ? (
        <View style={styles.quote}>
          <Text style={styles.italic}>« {d.dispute_reason} »</Text>
        </View>
      ) : null}
      <Input label="Note (journal)" value={note} onChangeText={setNote} placeholder="Feuille de temps vérifiée…" />
      {resolve.error ? <Text style={styles.error}>{resolve.error.message}</Text> : null}
      <Button
        title="Valider le classement déclaré"
        disabled={!complete}
        loading={resolve.isPending}
        onPress={() => decide('validate', 'Valider ce classement ?', 'L’ELO de tous les participants est mis à jour.')}
      />
      <Button
        title="Annuler la course"
        variant="quiet"
        disabled={resolve.isPending}
        onPress={() => decide('cancel', 'Annuler cette course ?', 'Aucun ELO ne change, la course est close.')}
      />
    </Card>
  );
}

function TimeAttackCard({ session: s }: { session: TimeAttackReview }) {
  const review = useReviewTimeAttack();
  const ticket = useTicketUrl(s.ticket_path);
  const [reason, setReason] = useState('');
  const [showOcr, setShowOcr] = useState(false);

  return (
    <Card style={[styles.card, (s.gap_pct ?? 0) >= 3 && !s.reviewed && styles.disputed]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/admin/pilot/[id]', params: { id: s.pilot_id } })}
        style={styles.head}>
        <Text style={styles.bold}>{s.username}</Text>
        <Text variant="caption">
          {s.track_name} · validé {formatMessageTime(s.validated_at)}
          {s.reviewed ? ' · déjà vérifié' : ''}
        </Text>
      </Pressable>
      <View style={styles.lapRow}>
        <Text style={styles.lap}>{formatLapTime(s.best_lap_ms)}</Text>
        {s.previous_best_ms ? (
          <View style={styles.flex}>
            <Text variant="caption">Record précédent {formatLapTime(s.previous_best_ms)}</Text>
            {s.gap_pct != null ? (
              <Text style={[styles.gap, { color: s.gap_pct >= 3 ? colors.orange : colors.textMuted }]}>
                {s.gap_pct > 0 ? `${s.gap_pct} % plus rapide` : 'dans la norme'}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text variant="caption">Premier chrono du circuit</Text>
        )}
      </View>
      <Text variant="caption">
        Check-in {formatMessageTime(s.check_in_at)}
        {s.ticket_at ? ` · session du ticket ${formatMessageTime(s.ticket_at)}` : ''}
        {s.ticket_name ? ` · « ${s.ticket_name} »` : ''}
      </Text>
      {ticket.data ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Ouvrir le ticket en grand" onPress={() => Linking.openURL(ticket.data!)}>
          <Image source={{ uri: ticket.data }} style={styles.ticket} contentFit="contain" />
        </Pressable>
      ) : s.ticket_path ? (
        ticket.isPending ? <Loading /> : <Text variant="caption">Photo du ticket indisponible.</Text>
      ) : (
        <View style={styles.noTicket}>
          <Icon name={icons.ticket} size={18} color={colors.textMuted} />
          <Text variant="caption">Pas de photo de ticket</Text>
        </View>
      )}
      {s.ocr_text ? (
        <>
          <Button title={showOcr ? 'Masquer le texte lu' : 'Texte lu sur le ticket'} variant="quiet" onPress={() => setShowOcr((v) => !v)} />
          {showOcr ? <Text style={styles.ocr}>{s.ocr_text}</Text> : null}
        </>
      ) : null}
      <Input label="Motif en cas de refus" value={reason} onChangeText={setReason} placeholder="Ticket d’un autre jour, chrono illisible…" />
      {review.error ? <Text style={styles.error}>{review.error.message}</Text> : null}
      <View style={styles.row}>
        <Button
          title="Valide"
          variant="secondary"
          style={styles.flex}
          disabled={s.reviewed}
          loading={review.isPending}
          onPress={() => review.mutate({ id: s.id, valid: true })}
        />
        <Button
          title="Refuser"
          variant="quiet"
          style={styles.flex}
          disabled={review.isPending}
          onPress={() =>
            confirmAction(
              `Refuser le chrono de ${s.username} ?`,
              'Il sort des records et du badge vérifié, ses 30 points sont repris et sa publication perd la mention certifiée.',
              'Refuser',
              () => review.mutate({ id: s.id, valid: false, reason }),
            )
          }
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  disputed: { borderLeftWidth: 3, borderLeftColor: colors.orange },
  head: { gap: 2 },
  kind: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  bold: { fontWeight: '800' },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm },
  pilotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  winner: { color: colors.neon },
  value: { fontWeight: '900', fontSize: 16 },
  pos: { width: 22, fontWeight: '900', color: colors.neon },
  quote: { gap: 2, padding: spacing.md, borderRadius: radius.md, borderLeftWidth: 3, borderLeftColor: colors.borderStrong, backgroundColor: colors.surfaceAlt },
  italic: { fontStyle: 'italic' },
  error: { color: colors.danger },
  lapRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lap: { fontSize: 28, fontWeight: '900', color: colors.neon },
  gap: { fontWeight: '800' },
  ticket: { width: '100%', height: 320, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  noTicket: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  ocr: { fontFamily: 'monospace', fontSize: 12, color: colors.textMuted },
});
