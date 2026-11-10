import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Trophy } from '@/features/tournaments/api';
import { colors, radius, spacing } from '@/theme';

const GOLD = '#FFC83D';
const SILVER = '#C0C7D1';
const BRONZE = '#CD7F32';
const placeLabel = { champion: 'Vainqueur', finalist: 'Finaliste', third: '3e place' } as const;
const dateFormat = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' });

/** Vitrine à trophées de la fiche pilote : tournois gagnés (or), finales (argent) et 3es places (bronze). */
export function TrophyCabinet({ trophies }: { trophies: Trophy[] }) {
  if (trophies.length === 0) return null;
  const wins = trophies.filter((t) => t.place === 'champion').length;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="label">Vitrine à trophées</Text>
        <Text variant="caption">
          {wins} {wins > 1 ? 'tournois gagnés' : 'tournoi gagné'}
        </Text>
      </View>
      <View style={styles.list}>
        {trophies.map((t) => {
          const color = t.place === 'champion' ? GOLD : t.place === 'finalist' ? SILVER : BRONZE;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityLabel={`${placeLabel[t.place]} de ${t.name}`}
              onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: t.id } })}
              style={({ pressed }) => [styles.trophy, pressed && { opacity: 0.8 }]}>
              <View style={[styles.cup, { borderColor: color }]}>
                <Icon name={t.place === 'champion' ? icons.trophy : icons.medal} size={22} color={color} />
              </View>
              <View style={styles.body}>
                <Text numberOfLines={1} style={styles.name}>
                  {t.name}
                </Text>
                <Text variant="caption" numberOfLines={1}>
                  {placeLabel[t.place]} · {t.track.name} · {t.size} pilotes ·{' '}
                  {dateFormat.format(new Date(t.completed_at))}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  list: { gap: spacing.sm },
  trophy: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cup: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  body: { flex: 1, gap: 2 },
  name: { fontWeight: '800', fontSize: 15 },
});
