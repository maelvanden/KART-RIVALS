import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { CATEGORY_LABELS, eventEnd, type TrackEvent } from '@/features/events/api';
import { dateBadge, eventWhen } from '@/features/events/format';
import { colors, fonts, radius, spacing } from '@/theme';

type Props = {
  event: TrackEvent;
  /** Masque le nom du circuit (sur sa propre fiche). */
  hideTrack?: boolean;
  interested?: boolean;
  /** Statistiques visibles des admins du karting. */
  stats?: { interested: number; reveals: number };
};

/** Carte d'un événement ou d'une promo : vignette de date, type, titre, circuit, prix. */
export function EventCard({ event: e, hideTrack, interested, stats }: Props) {
  const promo = e.kind === 'promo';
  const badge = dateBadge(promo ? eventEnd(e) : e.starts_at!);
  const accent = promo ? colors.orange : colors.neon;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
      style={({ pressed }) => [styles.card, e.featured && styles.featured, pressed && styles.pressed]}>
      <View style={[styles.date, { borderColor: accent }]}>
        {promo ? <Icon name={icons.ticket} size={18} color={accent} /> : <Text style={[styles.day, { color: accent }]}>{badge.day}</Text>}
        <Text style={styles.month}>{promo ? 'Promo' : badge.month}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.tags}>
          {e.featured ? <Text style={[styles.tag, styles.tagFeatured]}>À la une</Text> : null}
          <Text style={[styles.tag, { color: accent, borderColor: accent }]}>
            {promo ? 'Code promo' : CATEGORY_LABELS[e.category ?? 'autre']}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {e.title}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {[!hideTrack && e.track ? e.track.name : null, eventWhen(e)].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.footer}>
          {e.price ? <Text style={styles.price}>{e.price}</Text> : null}
          {e.interested > 0 && !stats ? (
            <Text variant="caption">
              {e.interested} intéressé{e.interested > 1 ? 's' : ''}
            </Text>
          ) : null}
          {interested ? <Icon name={icons.star} size={14} color={colors.neon} /> : null}
          {stats ? (
            <Text style={styles.stats}>
              {promo ? `${stats.reveals} code${stats.reveals > 1 ? 's' : ''} affiché${stats.reveals > 1 ? 's' : ''}` : `${stats.interested} intéressé${stats.interested > 1 ? 's' : ''}`}
            </Text>
          ) : null}
        </View>
      </View>
      <Icon name={icons.chevron} size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  featured: { borderColor: colors.neon },
  pressed: { opacity: 0.8 },
  date: {
    width: 56,
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  day: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30 },
  month: { fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  body: { flex: 1, gap: 3 },
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
  title: { fontWeight: '800', fontSize: 15 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  price: { fontWeight: '800', color: colors.neon },
  stats: { fontSize: 12, fontWeight: '700', color: colors.orange },
});
