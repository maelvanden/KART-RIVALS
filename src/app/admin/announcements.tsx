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
import { AnnouncementCard } from '@/features/admin/components/announcement-banner';
import { useAdminAnnouncements, useArchiveAnnouncement, usePublishAnnouncement, type Announcement } from '@/features/admin/panel';
import { SectionTitle } from '@/features/social/components/section-title';
import { confirmAction } from '@/lib/confirm';
import { colors, spacing } from '@/theme';

const DURATIONS = [
  { value: '1', label: '1 j' },
  { value: '3', label: '3 j' },
  { value: '7', label: '7 j' },
  { value: '14', label: '14 j' },
  { value: '30', label: '30 j' },
];

const isLive = (a: Announcement) => !a.archived_at && Date.parse(a.ends_at) > Date.now();

/** Annonces officielles : affichées en haut de l'accueil et de l'Actu de tous les pilotes jusqu'à leur fin. */
export default function AdminAnnouncementsScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const list = useAdminAnnouncements(isAppAdmin);
  const publish = usePublishAnnouncement();
  const archive = useArchiveAnnouncement();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [days, setDays] = useState('7');
  const [notice, setNotice] = useState<string | null>(null);

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  const live = (list.data ?? []).filter(isLive);
  const past = (list.data ?? []).filter((a) => !isLive(a));
  const preview: Announcement | null =
    title.trim() || body.trim()
      ? { id: 'preview', title: title.trim() || 'Titre', body: body.trim() || 'Message', link_url: link.trim() || null, created_at: '', ends_at: '', archived_at: null }
      : null;

  return (
    <Screen safeTop={false} refreshing={list.isRefetching} onRefresh={list.refetch}>
      <SectionTitle title="Nouvelle annonce" />
      <Input label={`Titre (${title.length}/80)`} value={title} onChangeText={(v) => (setTitle(v), setNotice(null))} maxLength={80} placeholder="Nouveau : …" />
      <Input
        label={`Message (${body.length}/600)`}
        value={body}
        onChangeText={(v) => (setBody(v), setNotice(null))}
        maxLength={600}
        multiline
        style={styles.multiline}
        placeholder="Ce qui change, ce que les pilotes doivent savoir…"
      />
      <Input label="Lien (facultatif)" value={link} onChangeText={setLink} autoCapitalize="none" keyboardType="url" placeholder="https://…" />
      <Text variant="label">Affichée pendant</Text>
      <Segmented options={DURATIONS} value={days} onChange={setDays} />
      {preview ? (
        <>
          <Text variant="label">Aperçu</Text>
          <AnnouncementCard announcement={preview} />
        </>
      ) : null}
      {publish.error ? <Text style={styles.error}>{publish.error.message}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Button
        title="Publier l’annonce"
        loading={publish.isPending}
        onPress={() =>
          confirmAction('Publier cette annonce ?', `Tous les pilotes la verront pendant ${days} jour${days === '1' ? '' : 's'}.`, 'Publier', () =>
            publish.mutate(
              { title, body, link, days: Number(days) },
              {
                onSuccess: () => {
                  setTitle('');
                  setBody('');
                  setLink('');
                  setNotice('Annonce publiée ✓');
                },
              },
            ),
          )
        }
      />

      {list.isPending ? <Loading /> : null}
      {list.error ? <ErrorState error={list.error} /> : null}

      <SectionTitle title="En cours" detail={`${live.length}`} />
      {live.length === 0 ? <Text variant="caption">Aucune annonce affichée.</Text> : null}
      {live.map((a) => (
        <View key={a.id} style={styles.item}>
          <AnnouncementCard announcement={a} />
          <View style={styles.meta}>
            <Text variant="caption">Jusqu’au {new Date(a.ends_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</Text>
            <Button
              title="Retirer"
              variant="quiet"
              loading={archive.isPending}
              onPress={() => confirmAction('Retirer cette annonce ?', 'Elle disparaît pour tous les pilotes.', 'Retirer', () => archive.mutate(a.id))}
            />
          </View>
        </View>
      ))}

      {past.length > 0 ? (
        <>
          <SectionTitle title="Terminées" />
          {past.map((a) => (
            <Card key={a.id} style={styles.past}>
              <Text style={styles.bold}>{a.title}</Text>
              <Text variant="caption" numberOfLines={2}>{a.body}</Text>
              <Text variant="caption">
                {new Date(a.created_at).toLocaleDateString('fr-FR')} · {a.archived_at ? 'retirée' : 'expirée'}
              </Text>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
  notice: { color: colors.neon, fontWeight: '700' },
  item: { gap: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  past: { gap: 2, opacity: 0.75 },
  bold: { fontWeight: '800' },
});
