import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { useAdminAppeals, useResolveAppeal, type AdminAppeal, type AppealFilter } from '@/features/admin/appeals';
import { waitingFor } from '@/features/admin/queue';
import { confirmAction } from '@/lib/confirm';
import { colors, spacing } from '@/theme';

const FILTERS: { value: AppealFilter; label: string }[] = [
  { value: 'open', label: 'À examiner' },
  { value: 'done', label: 'Traités' },
];

const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

/** Recours : contestations des pilotes suspendus ou bannis. Lever la sanction ou refuser avec une réponse. */
export default function AdminAppealsScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const [filter, setFilter] = useState<AppealFilter>('open');
  const appeals = useAdminAppeals(filter, isAppAdmin);

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  return (
    <Screen safeTop={false} refreshing={appeals.isRefetching} onRefresh={appeals.refetch}>
      <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      <Text variant="caption">
        Le pilote lit ta réponse sur son écran « Compte suspendu ». Un seul recours par sanction : une nouvelle sanction
        rouvre ce droit.
      </Text>
      {appeals.isPending ? <Loading /> : null}
      {appeals.error ? <ErrorState error={appeals.error} /> : null}
      {appeals.data?.length === 0 ? (
        <EmptyState title={filter === 'open' ? 'Aucun recours à examiner' : 'Aucun recours traité'} message={filter === 'open' ? 'Les contestations arrivent ici et dans la file « À traiter ».' : undefined} />
      ) : null}
      {appeals.data?.map((a) => <AppealCard key={a.id} appeal={a} />)}
    </Screen>
  );
}

function AppealCard({ appeal: a }: { appeal: AdminAppeal }) {
  const resolve = useResolveAppeal();
  const [response, setResponse] = useState('');
  const open = a.status === 'open';
  const sanction =
    a.kind === 'ban'
      ? `Bannissement${a.banned_at ? ` du ${day(a.banned_at)}` : ''}`
      : `Suspension${a.suspended_until ? ` jusqu’au ${day(a.suspended_until)}` : ''}`;
  const sent = response.trim() ? `Réponse envoyée : « ${response.trim()} »` : 'Aucune réponse écrite.';

  return (
    <Card style={[styles.card, open && styles.open]}>
      <View style={styles.head}>
        <Text style={styles.name}>{a.username}</Text>
        <Text variant="caption">
          {open ? `depuis ${waitingFor(a.created_at)}` : `${a.status === 'accepted' ? 'Accepté' : 'Refusé'}${a.handled_by ? ` par ${a.handled_by}` : ''}`}
        </Text>
      </View>
      <Text style={styles.bold}>{sanction}</Text>
      {a.sanction_reason ? <Text variant="caption">Motif : « {a.sanction_reason} »</Text> : null}
      <Text variant="caption">
        {a.warnings} avertissement{a.warnings > 1 ? 's' : ''} · {a.reports} signalement{a.reports > 1 ? 's' : ''} reçu{a.reports > 1 ? 's' : ''}
      </Text>
      <View style={styles.quote}>
        <Text>« {a.message} »</Text>
      </View>
      {open && !a.still_active ? (
        <Text style={styles.flag}>La sanction a été levée ou remplacée depuis ce recours : vérifie la fiche avant de répondre.</Text>
      ) : null}
      {!open && a.response ? <Text variant="caption">Réponse : « {a.response} »</Text> : null}

      {open ? (
        <>
          <Input
            label="Réponse au pilote"
            value={response}
            onChangeText={setResponse}
            placeholder="Obligatoire pour refuser, facultative pour lever la sanction"
            multiline
            maxLength={500}
            style={styles.multiline}
          />
          {resolve.error ? <Text style={styles.error}>{resolve.error.message}</Text> : null}
          <Button title="Voir sa fiche" variant="ghost" onPress={() => router.push({ pathname: '/admin/pilot/[id]', params: { id: a.profile_id } })} />
          <View style={styles.actions}>
            <Button
              title="Lever la sanction"
              style={styles.flex}
              disabled={resolve.isPending}
              onPress={() =>
                confirmAction(
                  `Lever la sanction de ${a.username} ?`,
                  `Son compte redevient actif aussitôt et il est prévenu. ${sent}`,
                  'Lever la sanction',
                  () => resolve.mutate({ id: a.id, decision: 'lift', response }),
                )
              }
            />
            <Button
              title="Refuser"
              variant="secondary"
              style={styles.flex}
              disabled={resolve.isPending || response.trim().length < 3}
              onPress={() =>
                confirmAction(
                  `Refuser le recours de ${a.username} ?`,
                  `La sanction est maintenue et il ne pourra pas contester à nouveau. ${sent}`,
                  'Refuser',
                  () => resolve.mutate({ id: a.id, decision: 'reject', response }),
                )
              }
            />
          </View>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.sm },
  open: { borderLeftWidth: 3, borderLeftColor: colors.orange },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  name: { fontSize: 18, fontWeight: '900' },
  bold: { fontWeight: '800' },
  quote: { padding: spacing.md, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  flag: { fontSize: 13, fontWeight: '700', color: colors.orange },
  actions: { flexDirection: 'row', gap: spacing.sm },
  multiline: { minHeight: 70, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
});
