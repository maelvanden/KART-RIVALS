import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useMySessions, useOpenSessions } from '@/features/sessions/api';
import { sessionWhen } from '@/features/sessions/format';
import { colors, radius, spacing } from '@/theme';

/** Accès aux sessions ouvertes, avec la prochaine où je suis inscrit ou la prochaine à rejoindre. */
export function SessionsBanner() {
  const sessions = useOpenSessions();
  const mine = useMySessions();
  const myNext = mine.data?.find((s) => s.status === 'open');
  const next = sessions.data?.[0];
  const count = sessions.data?.length ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/sessions')}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.icon}>
        <Icon name={icons.challenge} size={20} color={colors.onNeon} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Je roule samedi · sessions ouvertes</Text>
        <Text variant="caption" numberOfLines={1}>
          {myNext
            ? `Ta prochaine : ${sessionWhen(myNext.starts_at)} · ${myNext.track?.name ?? ''}`
            : next
              ? `${sessionWhen(next.starts_at)} · ${next.track?.name ?? ''}`
              : 'Annonce ton créneau, trouve des pilotes pour rouler'}
        </Text>
        {count > 0 ? (
          <Text style={styles.count}>
            {count} session{count > 1 ? 's' : ''} à rejoindre
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
