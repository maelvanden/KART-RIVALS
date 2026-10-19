import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles, useCanManageTrack } from '@/features/admin/api';
import {
  CATEGORY_LABELS,
  useManagedEventStats,
  useMyInterests,
  useRevealPromo,
  useSetFeatured,
  useToggleInterest,
  useTrackEvent,
} from '@/features/events/api';
import { eventWhen } from '@/features/events/format';
import { callPhone, openLink } from '@/features/tracks/links';
import { colors, fonts, radius, spacing } from '@/theme';

/** Un événement ou une promo d'un karting. */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useTrackEvent(id);
  const interests = useMyInterests();
  const toggle = useToggleInterest();
  const reveal = useRevealPromo();
  const featured = useSetFeatured();
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const e = event.data;
  const canManage = useCanManageTrack(e?.track_id);
  const stats = useManagedEventStats(e?.track_id, canManage).data?.[id ?? ''];
  const [code, setCode] = useState<string | null>(null);

  const promo = e?.kind === 'promo';
  const mine = !!interests.data?.has(id ?? '');
  const bookingUrl = e?.booking_url ?? e?.track?.booking_url ?? null;
  const error = (toggle.error ?? reveal.error ?? featured.error) as Error | null;

  return (
    <Screen safeTop={false} refreshing={event.isRefetching} onRefresh={event.refetch}>
      <Stack.Screen options={{ title: promo ? 'Promo' : 'Événement' }} />
      {event.isPending ? <Loading /> : null}
      {event.error ? <ErrorState error={event.error} /> : null}
      {event.data === null ? <EmptyState title="Événement introuvable" message="Il a peut-être été retiré par le karting." /> : null}
      {e ? (
        <>
          <Card style={[styles.hero, { borderLeftColor: promo ? colors.orange : colors.neon }]}>
            <View style={styles.tags}>
              {e.featured ? <Text style={[styles.tag, styles.tagFeatured]}>À la une</Text> : null}
              <Text style={[styles.tag, { color: promo ? colors.orange : colors.neon, borderColor: promo ? colors.orange : colors.neon }]}>
                {promo ? 'Code promo Kart Rivals' : CATEGORY_LABELS[e.category ?? 'autre']}
              </Text>
            </View>
            <Text variant="title" style={styles.title}>
              {e.title}
            </Text>
            <View style={styles.line}>
              <Icon name={icons.clock} size={16} color={colors.textMuted} />
              <Text style={styles.when}>{eventWhen(e, true)}</Text>
            </View>
            {e.track ? (
              <View style={styles.line}>
                <Icon name={icons.pin} size={16} color={colors.textMuted} />
                <Text
                  style={styles.link}
                  onPress={() => router.push({ pathname: '/track/[id]', params: { id: e.track!.id } })}>
                  {e.track.name} · {e.track.city}
                </Text>
              </View>
            ) : null}
            {e.price ? <Text style={styles.price}>{e.price}</Text> : null}
            {e.description ? <Text style={styles.description}>{e.description}</Text> : null}
          </Card>

          {promo ? (
            <Card style={styles.promo}>
              {code ? (
                <>
                  <Text variant="label">Ton code</Text>
                  <Text selectable style={styles.code}>
                    {code}
                  </Text>
                  <Text variant="caption">Appui long pour copier, ou partage-le à tes coéquipiers.</Text>
                  <Button
                    title="Partager le code"
                    variant="secondary"
                    icon={<Icon name={icons.share} size={18} color={colors.text} />}
                    onPress={() => Share.share({ message: `${e.title} chez ${e.track?.name ?? 'mon karting'} : code ${code} (Kart Rivals)` })}
                  />
                </>
              ) : (
                <Button
                  title="Afficher le code promo"
                  size="lg"
                  icon={<Icon name={icons.ticket} size={20} color={colors.onNeon} />}
                  loading={reveal.isPending}
                  onPress={() => reveal.mutate(e.id, { onSuccess: setCode })}
                />
              )}
              {e.promo_conditions ? <Text variant="caption">Conditions : {e.promo_conditions}</Text> : null}
            </Card>
          ) : (
            <Button
              title={mine ? '★ Ça m’intéresse' : '☆ Ça m’intéresse'}
              variant={mine ? 'ghost' : 'secondary'}
              loading={toggle.isPending}
              onPress={() => toggle.mutate(e.id)}
            />
          )}
          {e.interested > 0 && !promo ? (
            <Text variant="caption" style={styles.center}>
              {e.interested} pilote{e.interested > 1 ? 's' : ''} intéressé{e.interested > 1 ? 's' : ''}
            </Text>
          ) : null}

          {bookingUrl ? (
            <Button
              title={promo ? 'Réserver une session' : 'S’inscrire / réserver'}
              variant={promo ? 'secondary' : 'primary'}
              icon={<Icon name={icons.ticket} size={18} color={promo ? colors.text : colors.onNeon} />}
              onPress={() => openLink(bookingUrl)}
            />
          ) : e.track?.phone ? (
            <Button
              title="Réserver par téléphone"
              variant={promo ? 'secondary' : 'primary'}
              icon={<Icon name={icons.phone} size={18} color={promo ? colors.text : colors.onNeon} />}
              onPress={() => callPhone(e.track!.phone!)}
            />
          ) : null}

          {error ? <Text style={styles.error}>{error.message}</Text> : null}

          {canManage ? (
            <Card style={styles.manage}>
              <Text variant="label">Gestion</Text>
              {stats ? (
                <Text style={styles.stats}>
                  {promo
                    ? `${stats.reveals} pilote${stats.reveals > 1 ? 's ont' : ' a'} affiché le code ${stats.promo_code ?? ''}`
                    : `${stats.interested} pilote${stats.interested > 1 ? 's' : ''} intéressé${stats.interested > 1 ? 's' : ''}`}
                </Text>
              ) : null}
              <Button
                title="Modifier"
                variant="secondary"
                icon={<Icon name={icons.edit} size={18} color={colors.text} />}
                onPress={() => router.push({ pathname: '/admin/event', params: { trackId: e.track_id, id: e.id } })}
              />
              {isAppAdmin ? (
                <Button
                  title={e.featured ? 'Retirer de la une' : 'Mettre à la une'}
                  variant="quiet"
                  loading={featured.isPending}
                  onPress={() => featured.mutate({ id: e.id, featured: !e.featured })}
                />
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm, borderLeftWidth: 3 },
  tags: { flexDirection: 'row', gap: spacing.xs },
  tag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  tagFeatured: { color: colors.onNeon, backgroundColor: colors.neon, borderColor: colors.neon },
  title: { fontSize: 24 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  when: { fontWeight: '700', textTransform: 'capitalize' },
  link: { color: colors.neon, fontWeight: '700' },
  price: { fontSize: 18, fontWeight: '900', color: colors.neon },
  description: { color: colors.textMuted, lineHeight: 21 },
  promo: { gap: spacing.sm, alignItems: 'stretch', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.orange },
  code: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: 4,
    textAlign: 'center',
    color: colors.orange,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  center: { textAlign: 'center' },
  error: { color: colors.danger },
  manage: { gap: spacing.sm },
  stats: { fontWeight: '800', color: colors.orange },
});
