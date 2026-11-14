import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { ActionLine } from '@/features/admin/components/action-line';
import {
  daysSince,
  isAbsent,
  useAdminDissolveTeam,
  useAdminModerateTeam,
  useAdminRenameTeam,
  useAdminTeam,
  useAdminTransferTeam,
  type AdminTeamDetail,
  type AdminTeamMember,
} from '@/features/admin/teams';
import { SectionTitle } from '@/features/social/components/section-title';
import { TeamCrest } from '@/features/social/components/team-crest';
import { roleLabel } from '@/features/social/roles';
import { confirmAction } from '@/lib/confirm';
import { colors, spacing } from '@/theme';

/** Modération d'une écurie par un admin appli : nom, tag, blason, message, Team Principal, dissolution. */
export default function AdminTeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const team = useAdminTeam(id, isAppAdmin);
  const t = team.data;

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  return (
    <Screen safeTop={false} refreshing={team.isRefetching} onRefresh={team.refetch}>
      <Stack.Screen options={{ title: t ? `${t.name} [${t.tag}]` : 'Écurie' }} />
      {team.isPending ? <Loading /> : null}
      {team.error ? <ErrorState error={team.error} /> : null}
      {/* La clé remet le formulaire à zéro quand le nom ou le tag change côté serveur. */}
      {t ? <TeamModeration key={`${t.id}-${t.name}-${t.tag}`} team={t} /> : null}
    </Screen>
  );
}

function TeamModeration({ team: t }: { team: AdminTeamDetail }) {
  const rename = useAdminRenameTeam();
  const moderate = useAdminModerateTeam();
  const transfer = useAdminTransferTeam();
  const dissolve = useAdminDissolveTeam();
  const [reason, setReason] = useState('');
  const [name, setName] = useState(t.name);
  const [tag, setTag] = useState(t.tag);

  const error = [rename, moderate, transfer, dissolve].find((m) => m.error)?.error;
  const busy = rename.isPending || moderate.isPending || transfer.isPending || dissolve.isPending;
  const sent = reason.trim() ? `Motif envoyé : « ${reason.trim()} »` : 'Aucun motif indiqué.';
  const changed = name.trim() !== t.name || tag.trim().toUpperCase() !== t.tag;
  const principal = t.members.find((m) => m.role === 'team_principal');

  /** Nom et tag sans signification, pour remplacer un nom inapproprié en un geste. */
  function neutral() {
    const n = String(Math.floor(1000 + Math.random() * 9000));
    setName(`Écurie ${n}`);
    setTag(`E${n.slice(0, 3)}`);
  }

  return (
    <>
      <Card style={styles.summary}>
        <TeamCrest tag={t.tag} logoUrl={t.logo_url} color={t.color} size={64} />
        <View style={styles.flex}>
          <Text variant="heading">{t.name}</Text>
          <Text variant="caption">
            [{t.tag}] · {t.members.length} pilote{t.members.length > 1 ? 's' : ''} · créée le {new Date(t.created_at).toLocaleDateString('fr-FR')}
            {t.founder ? ` par ${t.founder}` : ''}
          </Text>
          <Text variant="caption">{t.recruiting ? 'Recrutement ouvert' : 'Recrutement fermé'}</Text>
        </View>
      </Card>
      <Button title="Voir la page de l’écurie" variant="secondary" onPress={() => router.push({ pathname: '/team/[id]', params: { id: t.id } })} />

      <Input
        label="Motif de ta décision"
        value={reason}
        onChangeText={setReason}
        placeholder="Noté au journal et envoyé aux pilotes concernés"
        multiline
        maxLength={280}
        style={styles.multiline}
      />
      {error ? <Text style={styles.error}>{error.message}</Text> : null}

      <SectionTitle title="Nom et tag" />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Input label="Nom" value={name} onChangeText={setName} maxLength={30} autoCorrect={false} />
        </View>
        <View style={styles.small}>
          <Input label="Tag" value={tag} onChangeText={(v) => setTag(v.toUpperCase())} maxLength={4} autoCapitalize="characters" autoCorrect={false} />
        </View>
      </View>
      <View style={styles.row}>
        <Button title="Nom neutre" variant="quiet" style={styles.flex} disabled={busy} onPress={neutral} />
        <Button
          title="Renommer"
          variant="secondary"
          style={styles.flex}
          disabled={!changed || busy}
          loading={rename.isPending}
          onPress={() =>
            confirmAction(
              `Renommer en ${name.trim()} [${tag.trim().toUpperCase()}] ?`,
              `Tous les pilotes de l’écurie sont prévenus. ${sent}`,
              'Renommer',
              () => rename.mutate({ id: t.id, name, tag, reason }),
            )
          }
        />
      </View>

      <SectionTitle title="Blason et message de recrutement" />
      {t.recruiting_message ? <Text variant="caption">Message affiché : « {t.recruiting_message} »</Text> : null}
      {!t.logo_url && !t.recruiting_message ? (
        <Text variant="caption">Blason par défaut et aucun message : rien à modérer.</Text>
      ) : null}
      {t.logo_url ? (
        <Button
          title="Retirer le blason"
          variant="secondary"
          disabled={busy}
          onPress={() =>
            confirmAction('Retirer le blason ?', `L’écurie retrouve l’écusson par défaut à son tag. ${sent}`, 'Retirer', () =>
              moderate.mutate({ id: t.id, action: 'remove_logo', reason }),
            )
          }
        />
      ) : null}
      {t.recruiting_message ? (
        <Button
          title="Effacer le message"
          variant="secondary"
          disabled={busy}
          onPress={() =>
            confirmAction('Effacer le message de recrutement ?', sent, 'Effacer', () =>
              moderate.mutate({ id: t.id, action: 'clear_message', reason }),
            )
          }
        />
      ) : null}

      <SectionTitle title="Effectif" detail={`${t.members.length}`} />
      {!principal ? <Text style={styles.flag}>Cette écurie n’a plus de Team Principal : nomme-en un.</Text> : null}
      {principal && (principal.restricted || isAbsent(principal.last_activity)) && t.members.length > 1 ? (
        <Text style={styles.flag}>
          {principal.username} {principal.restricted ? 'est sanctionné' : 'est absent'} : tu peux confier l’écurie à un autre pilote.
        </Text>
      ) : null}
      {t.members.map((m) => (
        <Member
          key={m.id}
          member={m}
          busy={busy}
          onPromote={() =>
            confirmAction(
              `Confier l’écurie à ${m.username} ?`,
              `${principal ? `${principal.username} redevient Pilote officiel. ` : ''}Les deux pilotes sont prévenus. ${sent}`,
              'Nommer Team Principal',
              () => transfer.mutate({ id: t.id, pilotId: m.id, reason }),
            )
          }
        />
      ))}

      <SectionTitle title="Dissolution" accent={colors.danger} />
      <Text variant="caption">
        L’écurie, son canal Radio Paddock, ses invitations et ses candidatures sont supprimés. Ses pilotes redeviennent
        libres et sont prévenus. Irréversible.
      </Text>
      <Button
        title="Dissoudre l’écurie"
        variant="quiet"
        disabled={busy}
        loading={dissolve.isPending}
        onPress={() =>
          confirmAction(`Dissoudre ${t.name} ?`, `${t.members.length} pilote${t.members.length > 1 ? 's' : ''} concerné${t.members.length > 1 ? 's' : ''}. ${sent}`, 'Dissoudre', () =>
            dissolve.mutate({ id: t.id, reason }, { onSuccess: () => router.back() }),
          )
        }
      />

      {t.actions.length > 0 ? (
        <>
          <SectionTitle title="Historique admin" detail={`${t.actions.length}`} />
          <Card style={styles.card}>
            {t.actions.map((a) => (
              <ActionLine key={a.id} action={a} />
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

function Member({ member: m, busy, onPromote }: { member: AdminTeamMember; busy: boolean; onPromote: () => void }) {
  const seen = daysSince(m.last_activity);
  const activity = seen == null ? 'jamais actif' : seen === 0 ? 'actif aujourd’hui' : `actif il y a ${seen} j`;
  // Le bouton reste hors de la ligne : celle-ci est un lien vers la licence du pilote.
  return (
    <View style={styles.member}>
      <View style={styles.flex}>
        <PilotRow
          pilotId={m.id}
          username={m.username}
          avatarUrl={m.avatar_url}
          rank={m.rank}
          elo={m.elo}
          subtitle={`${roleLabel[m.role]} · ${m.restricted ? 'sanctionné' : activity}`}
        />
      </View>
      {m.role !== 'team_principal' && !m.restricted ? (
        <Button title="Nommer TP" variant="quiet" disabled={busy} onPress={onPromote} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  small: { width: 96 },
  row: { flexDirection: 'row', gap: spacing.md },
  card: { gap: spacing.sm },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flag: { fontSize: 13, fontWeight: '700', color: colors.orange },
  multiline: { minHeight: 80, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
});
