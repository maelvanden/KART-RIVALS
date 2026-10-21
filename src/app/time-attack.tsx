import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chips } from '@/components/ui/chips';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useMyProfile } from '@/features/profile/api';
import { TIME_ATTACK_ENABLED } from '@/features/time-attack/config';
import { takeTicketPhoto, useStartTimeAttack, useSubmitTicket, useTimeAttackSessions } from '@/features/time-attack/api';
import {
  TicketRejectedError,
  describeTicketRejection,
  formatHour,
  type RejectionMessage,
} from '@/features/time-attack/errors';
import { useTracks } from '@/features/tracks/api';
import { dateTimeFormat, formatLapTime, parseLapTime } from '@/lib/format';
import { colors, spacing } from '@/theme';
import type { TimeAttackSession } from '@/types/models';

export default function TimeAttackScreen() {
  if (!TIME_ATTACK_ENABLED) {
    return (
      <Screen safeTop={false}>
        <EmptyState title="Bientôt disponible" message="Le mode Time Attack solo arrive prochainement." />
      </Screen>
    );
  }
  return <TimeAttack />;
}

function TimeAttack() {
  const sessions = useTimeAttackSessions();
  const active = sessions.data?.find((s) => s.status === 'on_track');
  const history = (sessions.data ?? []).filter((s) => s.status !== 'on_track');

  return (
    <Screen safeTop={false} refreshing={sessions.isRefetching} onRefresh={sessions.refetch}>
      {sessions.isPending ? <Loading /> : null}
      {sessions.error ? <ErrorState error={sessions.error} /> : null}
      {sessions.data ? active ? <OnTrack session={active} /> : <CheckIn /> : null}

      {history.length > 0 ? <Text variant="label">Mes sessions</Text> : null}
      {history.map((s) => (
        <HistoryRow key={s.id} session={s} />
      ))}
    </Screen>
  );
}

/** Avant de rouler : choix du circuit et check-in. */
function CheckIn() {
  const tracks = useTracks();
  const profile = useMyProfile();
  const start = useStartTimeAttack();
  const [trackId, setTrackId] = useState<string | null>(null);
  const selected = trackId ?? profile.data?.home_track_id ?? tracks.data?.[0]?.id ?? null;

  return (
    <>
      <Card style={styles.block}>
        <Text variant="label" style={{ color: colors.neon }}>
          Time Attack solo
        </Text>
        <Text variant="heading">Engage-toi avant de rouler</Text>
        <Rule n={1} text="Appuie sur « Je pars rouler » avant le briefing : l’heure du check-in est enregistrée par le serveur." />
        <Rule n={2} text="Après ta session, prends ton ticket en photo depuis l’app dans les 90 minutes, avec le nom et le meilleur tour qui y figurent." />
        <Rule n={3} text="L’heure de session imprimée sur le ticket doit être postérieure à ton check-in, sinon il est refusé." />
        <Rule n={4} text="Pas de ticket valide au bout de 90 minutes : abandon (DNF) et perte d’ELO." />
      </Card>

      <Text variant="label">Circuit</Text>
      <Chips
        options={(tracks.data ?? []).map((t) => ({ value: t.id, label: `${t.name} · ${t.city}` }))}
        value={selected}
        onChange={setTrackId}
      />

      <Button title="Je pars rouler" disabled={!selected} loading={start.isPending} onPress={() => selected && start.mutate(selected)} />
      {start.error ? <Text style={{ color: colors.danger }}>{start.error.message}</Text> : null}
    </>
  );
}

/** En piste : compte à rebours et envoi du ticket. */
function OnTrack({ session: s }: { session: TimeAttackSession }) {
  const submit = useSubmitTicket();
  const remaining = useRemaining(s.deadline_at);
  const [pickError, setPickError] = useState<string | null>(null);
  const [ticketName, setTicketName] = useTicketName();
  const [lapInput, setLapInput] = useState('');
  const expired = remaining <= 0;
  const bestLapMs = parseLapTime(lapInput);
  const canSend = ticketName.trim().length >= 2 && bestLapMs !== null && bestLapMs >= 10_000;

  async function sendTicket() {
    if (!canSend) return;
    setPickError(null);
    submit.reset();
    try {
      const photo = await takeTicketPhoto();
      if (photo) submit.mutate({ sessionId: s.id, photo, ticketName: ticketName.trim(), bestLapMs });
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Impossible d’ouvrir l’appareil photo.');
    }
  }

  // Refus de cet envoi, ou à défaut le dernier refus enregistré sur la session (ex. app relancée).
  const rejection: RejectionMessage | null =
    submit.error instanceof TicketRejectedError
      ? describeTicketRejection(submit.error.rejection)
      : !submit.error && !submit.isPending && s.last_rejection_code
        ? describeTicketRejection({
            code: s.last_rejection_code,
            check_in_at: s.check_in_at,
            deadline_at: s.deadline_at,
            ticket_at: s.last_rejected_ticket_at ?? undefined,
          })
        : null;
  const otherError = submit.error && !(submit.error instanceof TicketRejectedError) ? submit.error.message : pickError;

  return (
    <>
      <Card style={[styles.block, { borderColor: expired ? colors.danger : colors.orange }]}>
        <Text variant="label" style={{ color: expired ? colors.danger : colors.orange }}>
          {expired ? 'Délai expiré' : 'En piste'}
        </Text>
        <Text variant="title" style={styles.title}>
          {s.track.name}
        </Text>
        <Meta icon={icons.check} text={`Check-in à ${formatHour(s.check_in_at)}`} />
        <Meta icon={icons.timer} text={`Ticket à envoyer avant ${formatHour(s.deadline_at)}`} />
        <Text variant="display" style={[styles.countdown, { color: expired ? colors.danger : colors.text }]}>
          {formatRemaining(remaining)}
        </Text>
        <Text variant="caption">
          {expired
            ? 'Sans ticket valide, la session va passer en abandon (DNF) avec une perte d’ELO.'
            : `Seul un ticket dont l’heure de session est après ${formatHour(s.check_in_at)} sera accepté.`}
        </Text>
      </Card>

      {!expired ? (
        <Card style={styles.block}>
          <Text variant="caption">Recopie ce qui est imprimé sur ton ticket, puis photographie-le en entier, à plat et bien éclairé : on vérifie le circuit, ton nom, ton temps et l’heure de la session.</Text>
          <Input
            label="Nom sur le ticket"
            value={ticketName}
            onChangeText={setTicketName}
            placeholder="Jean Dupont"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={60}
          />
          <Input
            label="Meilleur tour"
            value={lapInput}
            onChangeText={setLapInput}
            placeholder="47.312"
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
          />
          {lapInput.trim() && bestLapMs === null ? (
            <Text variant="caption" style={{ color: colors.orange }}>
              Format attendu : 47.312 ou 1:02.345
            </Text>
          ) : null}
        </Card>
      ) : null}

      {!expired ? (
        <Button
          title={submit.isPending ? 'Lecture du ticket…' : 'Prendre le ticket en photo'}
          loading={submit.isPending}
          disabled={!canSend}
          onPress={sendTicket}
        />
      ) : null}

      {rejection ? <RejectionCard rejection={rejection} attempts={s.rejection_count} /> : null}
      {otherError ? <Text style={{ color: colors.danger }}>{otherError}</Text> : null}
    </>
  );
}

function RejectionCard({ rejection, attempts }: { rejection: RejectionMessage; attempts: number }) {
  const color = rejection.severe ? colors.danger : colors.orange;
  return (
    <Card style={[styles.block, { borderColor: color }]} accessibilityRole="alert">
      <Text variant="heading" style={{ color }}>
        {rejection.title}
      </Text>
      <Text>{rejection.message}</Text>
      {rejection.hint ? <Text variant="caption">{rejection.hint}</Text> : null}
      {attempts > 1 ? <Text variant="caption">{attempts} tickets refusés pour cette session.</Text> : null}
    </Card>
  );
}

function HistoryRow({ session: s }: { session: TimeAttackSession }) {
  const validated = s.status === 'validated';
  return (
    <Card style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {s.track.name}
        </Text>
        <Text variant="caption">
          {dateTimeFormat.format(new Date(s.check_in_at))}
          {validated && s.ticket_at ? ` · session de ${formatHour(s.ticket_at)}` : ''}
        </Text>
      </View>
      {validated ? (
        <View style={styles.validated}>
          <Text style={styles.lap}>{s.best_lap_ms ? formatLapTime(s.best_lap_ms) : 'Validé'}</Text>
          {s.best_lap_ms ? (
            <Text
              style={styles.share}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/feed/new', params: { sessionId: s.id } })}>
              Publier dans l’actu
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.dnf}>
          {s.status === 'rejected' ? 'Refusé par un admin' : `DNF${s.elo_penalty ? ` · −${s.elo_penalty} ELO` : ''}`}
        </Text>
      )}
    </Card>
  );
}

function Rule({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.rule}>
      <Text style={styles.ruleNumber}>{n}</Text>
      <Text variant="caption" style={styles.ruleText}>
        {text}
      </Text>
    </View>
  );
}

function Meta({ icon, text }: { icon: (typeof icons)[keyof typeof icons]; text: string }) {
  return (
    <View style={styles.meta}>
      <Icon name={icon} size={14} color={colors.textMuted} />
      <Text variant="caption">{text}</Text>
    </View>
  );
}

/** Nom imprimé sur le ticket, mémorisé pour la prochaine session. */
function useTicketName(): [string, (name: string) => void] {
  const [name, setName] = useState('');
  useEffect(() => {
    AsyncStorage.getItem(TICKET_NAME_KEY)
      .then((saved) => saved && setName((current) => current || saved))
      .catch(() => {});
  }, []);
  return [
    name,
    (value: string) => {
      setName(value);
      AsyncStorage.setItem(TICKET_NAME_KEY, value).catch(() => {});
    },
  ];
}

const TICKET_NAME_KEY = 'time-attack:ticket-name';

/** Millisecondes restantes avant l'échéance, rafraîchies chaque seconde. */
function useRemaining(deadline: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return new Date(deadline).getTime() - now;
}

/** 4 512 000 → "1:15:12" */
function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const sec = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

const styles = StyleSheet.create({
  validated: { alignItems: 'flex-end', gap: 2 },
  share: { fontSize: 12, fontWeight: '800', color: colors.neon },
  block: { gap: spacing.sm },
  title: { fontSize: 26 },
  countdown: { fontVariant: ['tabular-nums'], marginTop: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rule: { flexDirection: 'row', gap: spacing.sm },
  ruleNumber: { width: 18, fontWeight: '900', fontStyle: 'italic', color: colors.neon },
  ruleText: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontWeight: '800' },
  lap: { fontSize: 16, fontWeight: '900', fontStyle: 'italic', color: colors.neon, fontVariant: ['tabular-nums'] },
  dnf: { fontWeight: '800', color: colors.danger },
});
