import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useUpcomingEvents } from '@/features/events/api';
import { colors, radius, spacing } from '@/theme';

/** Accès à l'agenda des kartings, avec le prochain événement à la une. */
export function AgendaBanner() {
  const events = useUpcomingEvents();
  const list = events.data ?? [];
  const promos = list.filter((e) => e.kind === 'promo').length;
  const next = list.find((e) => e.featured) ?? list.find((e) => e.kind === 'event');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/events')}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.icon}>
        <Icon name={icons.ticket} size={20} color={colors.onNeon} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Agenda & promos des kartings</Text>
        <Text variant="caption" numberOfLines={1}>
          {next
            ? `${next.featured ? 'À la une · ' : ''}${next.title}${next.track ? ` · ${next.track.name}` : ''}`
            : 'Soirées, Grands Prix et codes promo'}
        </Text>
        {list.length > 0 ? (
          <Text style={styles.count}>
            {list.length - promos} événement{list.length - promos > 1 ? 's' : ''} · {promos} promo{promos > 1 ? 's' : ''}
          </Text>
        ) : null}
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
    borderLeftWidth: 3,
    borderLeftColor: colors.neon,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.8 },
  icon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  title: { fontWeight: '800', fontSize: 15 },
  count: { fontSize: 12, fontWeight: '700', color: colors.neon },
});
