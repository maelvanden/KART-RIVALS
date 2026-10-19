import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { trackCondition, useTrackWeather, weatherLabel } from '@/features/tracks/weather';
import { colors, fonts, radius, spacing } from '@/theme';
import type { TrackDetails } from '@/types/models';

const dayName = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });

/** Météo d'un circuit outdoor : maintenant, état de la piste et 3 prochains jours. */
export function WeatherCard({ track }: { track: TrackDetails }) {
  const weather = useTrackWeather(track.is_indoor ? null : { lat: track.lat, lng: track.lng });
  const w = weather.data;
  if (track.is_indoor || weather.isError) return null;

  if (!w) {
    return (
      <Card>
        <Text variant="caption">Chargement de la météo…</Text>
      </Card>
    );
  }
  const now = weatherLabel(w.code);
  const condition = trackCondition(w);
  const toneColor = condition.tone === 'dry' ? colors.neon : condition.tone === 'wet' ? '#4FC3F7' : colors.orange;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="label" style={styles.title}>
          Météo sur le circuit
        </Text>
        <Text variant="caption">Open-Meteo</Text>
      </View>
      <View style={styles.now}>
        <Icon name={now.icon} size={36} color={colors.text} />
        <Text style={styles.temp}>{w.temperature}°</Text>
        <View style={styles.nowText}>
          <Text style={styles.label}>{now.label}</Text>
          <View style={styles.wind}>
            <Icon name={icons.wind} size={14} color={colors.textMuted} />
            <Text variant="caption">{w.wind} km/h</Text>
          </View>
        </View>
      </View>
      <View style={[styles.condition, { borderColor: toneColor }]}>
        <View style={[styles.dot, { backgroundColor: toneColor }]} />
        <Text style={[styles.conditionText, { color: toneColor }]}>{condition.label}</Text>
      </View>
      <View style={styles.days}>
        {w.days.slice(1, 4).map((d) => {
          const meta = weatherLabel(d.code);
          return (
            <View key={d.date} style={styles.day}>
              <Text variant="label">{dayName.format(new Date(`${d.date}T12:00:00`)).replace('.', '')}</Text>
              <Icon name={meta.icon} size={22} color={colors.text} />
              <Text style={styles.range}>
                {d.min}° / {d.max}°
              </Text>
              <Text variant="caption">💧 {d.rain} %</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, color: colors.text },
  now: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  temp: { fontFamily: fonts.display, fontSize: 40, lineHeight: 50 },
  nowText: { gap: 2 },
  label: { fontWeight: '800' },
  wind: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  condition: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  conditionText: { fontWeight: '800', fontSize: 13 },
  days: { flexDirection: 'row', gap: spacing.sm },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  range: { fontWeight: '700', fontSize: 13 },
});
