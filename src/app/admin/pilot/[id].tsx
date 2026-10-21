import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { ActionLine } from '@/features/admin/components/action-line';
import {
  useAdminPilot,
  useModeratePilot,
  useSetElo,
  useWarnPilot,
  type AdminPilotDetail,
  type ModerationAction,
} from '@/features/admin/panel';
import { SectionTitle } from '@/features/social/components/section-title';
import { REPORT_REASONS } from '@/features/social/safety';
import { confirmAction } from '@/lib/confirm';
import { formatMessageTime } from '@/lib/format';
import { colors, radius, rankMeta, spacing } from '@/theme';

const DURATIONS = [
  { value: '1', label: '1 j' },
  { value: '3', label: '3 j' },
  { value: '7', label: '7 j' },
  { value: '30', label: '30 j' },
];

const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Fiche admin d'un pilote : activité, signalements reçus, sanctions, badge vérifié, ELO. */
export default function AdminPilotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pilot = useAdminPilot(id);
  const p = pilot.data;

  return (
    <Screen safeTop={false} refreshing={pilot.isRefetching} onRefresh={pilot.refetch}>
      <Stack.Screen options={{ title: p ? p.username : 'Pilote' }} />
      {pilot.isPending ? <Loading /> : null}
      {pilot.error ? <ErrorState error={pilot.error} /> : null}
      {p ? <PilotAdmin pilot={p} /> : null}
    </Screen>
  );
}

function PilotAdmin({ pilot: p }: { pilot: AdminPilotDetail }) {
  const moderate = useModeratePilot();
  const setElo = useSetElo();
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const [elo, setEloInput] = useState(String(p.elo));
  const [eloReason, setEloReason] = useState('');

  const act = (action: ModerationAction, title: string, message: string, label: string, extra?: { days?: number }) =>
    confirmAction(title, message, label, () =>
      moderate.mutate({ pilotId: p.id, action, reason, ...extra }, { onSuccess: () => setReason('') }),
    );

  return (
    <>
      <Card style={styles.header}>
        <View style={styles.headerRow}>
          <Avatar username={p.username} url={p.avatar_url} size={56} borderColor={rankMeta[p.rank].color} />
          <View style={styles.flex}>
            <Text variant="heading">{p.username}</Text>
            <Text variant="caption">
              {rankMeta[p.rank].label} · {p.elo} ELO{p.kart_number ? ` · n°${p.kart_number}` : ''}
            </Text>
            <Text variant="caption">Inscrit le {day(p.created_at)}</Text>
            <Text variant="caption">
              {p.last_activity ? `Dernière activité ${formatMessageTime(p.last_activity)}` : 'Aucune activité'}
              {p.home_track ? ` · ${p.home_track}` : ''}
            </Text>
          </View>
        </View>
        {p.banned_at ? (
          <Status color={colors.danger} title={`Banni depuis le ${day(p.banned_at)}`} reason={p.moderation_reason} />
        ) : p.suspended_until ? (
          <Status color={colors.orange} title={`Suspendu jusqu’au ${day(p.suspended_until)}`} reason={p.moderation_reason} />
        ) : null}
        {p.is_admin ? <Text style={styles.adminNote}>Admin appli : retire son rôle avant toute sanction.</Text> : null}
        <Button title="Voir sa licence" variant="ghost" onPress={() => router.push({ pathname: '/pilot/[id]', params: { id: p.id } })} />
      </Card>

      <View style={styles.grid}>
        <Stat label="Défis" value={`${p.matches}`} sub={`${p.wins} victoires`} />
        <Stat label="Courses" value={`${p.races}`} />
        <Stat label="Time Attack" value={`${p.validated_sessions}`} sub="validés" />
        <Stat label="Publications" value={`${p.posts}`} />
        <Stat label="Messages" value={`${p.messages}`} />
        <Stat label="Signalements" value={`${p.reports.length}`} alert={p.reports.some((r) => r.status === 'open')} />
      </View>

      {moderate.error ? <Text style={styles.error}>{moderate.error.message}</Text> : null}

      <Warnings pilot={p} />

      <SectionTitle title="Sanctions" />
      <Card style={styles.card}>
        <Input
          label="Motif (visible par le pilote)"
          value={reason}
          onChangeText={setReason}
          placeholder="Insultes répétées sur la Radio…"
          maxLength={300}
        />
        {p.suspended_until && !p.banned_at ? (
          <Button
            title="Lever la suspension"
            variant="secondary"
            loading={moderate.isPending}
            onPress={() => act('unsuspend', `Lever la suspension de ${p.username} ?`, 'Il pourra de nouveau tout utiliser.', 'Lever')}
          />
        ) : !p.banned_at ? (
          <>
            <Text variant="label">Suspendre pendant</Text>
            <Segmented options={DURATIONS} value={days} onChange={setDays} />
            <Button
              title={`Suspendre ${days} jour${days === '1' ? '' : 's'}`}
              variant="secondary"
              disabled={p.is_admin}
              loading={moderate.isPending}
              onPress={() =>
                act(
                  'suspend',
                  `Suspendre ${p.username} ${days} jour${days === '1' ? '' : 's'} ?`,
                  'Il ne pourra plus rien publier, lancer de défi ni écrire, et verra le motif à l’ouverture de l’appli.',
                  'Suspendre',
                  { days: Number(days) },
                )
              }
            />
          </>
        ) : null}
        {p.banned_at ? (
          <Button
            title="Lever le bannissement"
            variant="secondary"
            loading={moderate.isPending}
            onPress={() => act('unban', `Débannir ${p.username} ?`, 'Son compte redevient normal.', 'Débannir')}
          />
        ) : (
          <Button
            title="Bannir définitivement"
            variant="quiet"
            disabled={p.is_admin}
            loading={moderate.isPending}
            onPress={() =>
              act(
                'ban',
                `Bannir ${p.username} ?`,
                'Son compte est bloqué et il disparaît des classements et des recherches. Réversible depuis cette fiche.',
                'Bannir',
              )
            }
          />
        )}
      </Card>

      <SectionTitle title="Badge pilote vérifié" />
      <Card style={styles.card}>
        <Text variant="caption">
          {p.validated_sessions > 0
            ? `${p.validated_sessions} Time Attack validé${p.validated_sessions > 1 ? 's' : ''} par ticket.`
            : 'Aucun Time Attack validé : pas de badge.'}
          {p.verified_revoked ? ' Badge retiré par un admin.' : ''}
        </Text>
        {p.verified_revoked ? (
          <Button
            title="Rétablir le badge"
            variant="secondary"
            loading={moderate.isPending}
            onPress={() => moderate.mutate({ pilotId: p.id, action: 'restore_verified' })}
          />
        ) : (
          <Button
            title="Retirer le badge vérifié"
            variant="quiet"
            loading={moderate.isPending}
            onPress={() =>
              act('revoke_verified', `Retirer le badge de ${p.username} ?`, 'Ses Time Attack restent, mais le badge disparaît.', 'Retirer')
            }
          />
        )}
      </Card>

      <SectionTitle title="Corriger l’ELO" />
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.eloInput}>
            <Input label="Nouvel ELO" value={elo} onChangeText={setEloInput} keyboardType="number-pad" maxLength={4} />
          </View>
          <View style={styles.flex}>
            <Input label="Raison" value={eloReason} onChangeText={setEloReason} placeholder="Résultat saisi par erreur" />
          </View>
        </View>
        {setElo.error ? <Text style={styles.error}>{setElo.error.message}</Text> : null}
        <Button
          title="Corriger l’ELO"
          variant="secondary"
          disabled={Number(elo) === p.elo}
          loading={setElo.isPending}
          onPress={() =>
            confirmAction(`Passer ${p.username} à ${elo} ELO ?`, `Actuellement ${p.elo}. La correction est notée dans le journal.`, 'Corriger', () =>
              setElo.mutate({ pilotId: p.id, elo: Number(elo), reason: eloReason }, { onSuccess: () => setEloReason('') }),
            )
          }
        />
      </Card>

      <SectionTitle title="Signalements reçus" detail={`${p.reports.length}`} />
      {p.reports.length === 0 ? <Text variant="caption">Aucun signalement.</Text> : null}
      {p.reports.map((r) => (
        <Card key={r.id} style={[styles.card, r.status === 'open' && styles.open]}>
          <Text style={styles.bold}>{REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}</Text>
          {r.details ? <Text variant="caption">« {r.details} »</Text> : null}
          <Text variant="caption">
            {r.reporter ?? 'pilote supprimé'} · {formatMessageTime(r.created_at)} ·{' '}
            {r.status === 'open' ? 'à traiter' : r.status === 'reviewed' ? 'traité' : 'rejeté'}
          </Text>
        </Card>
      ))}
      {p.reports.some((r) => r.status === 'open') ? (
        <Button title="Ouvrir les signalements" variant="ghost" onPress={() => router.push('/admin/reports')} />
      ) : null}

      {p.actions.length > 0 ? (
        <>
          <SectionTitle title="Historique admin" />
          <Card style={styles.card}>
            {p.actions.map((a) => (
              <ActionLine key={`${a.action}-${a.created_at}`} action={a} />
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

const PRESETS = [
  {
    label: 'Insultes',
    text: 'Les insultes et le harcèlement sont interdits sur Kart Rivals (Radio, Actu, commentaires). Reste respectueux envers les autres pilotes.',
  },
  {
    label: 'Spam / pub',
    text: 'Les publicités et les messages répétés ne sont pas autorisés. Merci de garder l’Actu et la Radio pour le karting.',
  },
  {
    label: 'Triche',
    text: 'Un de tes résultats a été signalé comme suspect. Déclare uniquement des résultats réels : la triche entraîne une suspension.',
  },
  {
    label: 'Contenu',
    text: 'Un de tes contenus a été jugé inapproprié et a été masqué. Merci de respecter les règles de la communauté.',
  },
];

/** Avertissement officiel avant sanction : le pilote le lit en plein écran à l'ouverture de l'appli. */
function Warnings({ pilot: p }: { pilot: AdminPilotDetail }) {
  const warn = useWarnPilot();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<number | null>(null);
  const list = p.warnings ?? [];

  return (
    <>
      <SectionTitle title="Avertissements" detail={`${list.length}`} accent={list.length > 0 ? colors.orange : undefined} />
      <Card style={styles.card}>
        <Text variant="caption">
          Un message officiel numéroté ({list.length === 0 ? '1er' : `${list.length + 1}e`} avertissement), affiché en plein
          écran à sa prochaine ouverture de l’appli. Il doit confirmer l’avoir lu.
        </Text>
        <View style={styles.presets}>
          {PRESETS.map((x) => (
            <Pressable key={x.label} accessibilityRole="button" onPress={() => (setMessage(x.text), setSent(null))} style={styles.preset}>
              <Text style={styles.presetText}>{x.label}</Text>
            </Pressable>
          ))}
        </View>
        <Input
          label={`Message (${message.length}/500)`}
          value={message}
          onChangeText={(v) => (setMessage(v), setSent(null))}
          multiline
          maxLength={500}
          style={styles.multiline}
          placeholder="Explique ce qui ne va pas et ce qu’on attend de lui…"
        />
        {warn.error ? <Text style={styles.error}>{warn.error.message}</Text> : null}
        {sent ? <Text style={styles.sent}>Avertissement n°{sent} envoyé ✓</Text> : null}
        <Button
          title="Envoyer l’avertissement"
          variant="secondary"
          disabled={p.is_admin}
          loading={warn.isPending}
          onPress={() =>
            confirmAction(`Avertir ${p.username} ?`, 'Il verra ce message en plein écran à l’ouverture de l’appli.', 'Envoyer', () =>
              warn.mutate(
                { pilotId: p.id, message },
                {
                  onSuccess: (n) => {
                    setSent(n);
                    setMessage('');
                  },
                },
              ),
            )
          }
        />
        {list.map((w, i) => (
          <View key={w.id} style={styles.warning}>
            <Text style={styles.bold}>Avertissement n°{list.length - i}</Text>
            <Text variant="caption">« {w.message} »</Text>
            <Text variant="caption">
              {w.admin ?? 'admin'} · {formatMessageTime(w.created_at)} ·{' '}
              {w.acknowledged_at ? `lu ${formatMessageTime(w.acknowledged_at)}` : 'pas encore lu'}
            </Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function Status({ color, title, reason }: { color: string; title: string; reason: string | null }) {
  return (
    <View style={[styles.status, { borderLeftColor: color }]}>
      <Text style={[styles.bold, { color }]}>{title}</Text>
      {reason ? <Text variant="caption">Motif : {reason}</Text> : null}
    </View>
  );
}

function Stat({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <View style={[styles.stat, alert && styles.statAlert]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text variant="label" numberOfLines={1}>{label}</Text>
      {sub ? <Text variant="caption">{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md },
  headerRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md },
  eloInput: { width: 110 },
  status: { gap: 2, padding: spacing.md, borderLeftWidth: 3, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  adminNote: { color: colors.neon, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: {
    width: '48%',
    flexGrow: 1,
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statAlert: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  statValue: { fontSize: 22, fontWeight: '900' },
  card: { gap: spacing.sm },
  open: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  bold: { fontWeight: '800' },
  error: { color: colors.danger },
  sent: { color: colors.neon, fontWeight: '700' },
  multiline: { minHeight: 100, paddingTop: 14, textAlignVertical: 'top' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  preset: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  presetText: { fontSize: 12, fontWeight: '800', color: colors.text },
  warning: { gap: 2, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
