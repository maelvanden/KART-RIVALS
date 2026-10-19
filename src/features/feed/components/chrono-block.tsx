import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { FeedPost } from '@/features/feed/api';
import { splitLap } from '@/features/feed/format';
import { colors, fonts, radius, spacing } from '@/theme';

const GOLD = '#FFC83D';

/** Bloc chrono d'une publication : temps, catégorie de kart, piste, poids. Doré pour un record. */
export function ChronoBlock({ post: p }: { post: FeedPost }) {
  if (!p.lap_ms) return null;
  const lap = splitLap(p.lap_ms);
  const accent = p.is_record ? GOLD : colors.orange;
  return (
    <View style={[styles.block, { borderColor: p.is_record ? 'rgba(255,200,61,0.45)' : 'rgba(255,107,53,0.35)' }]}>
      <View style={styles.tags}>
        <Text style={[styles.kicker, { color: accent }]}>
          {p.is_record ? 'Record circuit' : p.certified ? 'Chrono certifié' : 'Chrono'}
        </Text>
        {p.kart_category ? <Text style={[styles.tag, styles.tagKart]}>{p.kart_category}</Text> : null}
        {p.conditions ? (
          <Text style={[styles.tag, p.conditions === 'dry' ? styles.tagDry : styles.tagWet]}>
            {p.conditions === 'dry' ? '☀ Sèche' : '💧 Mouillée'}
          </Text>
        ) : null}
        {p.weight_class ? <Text style={[styles.tag, styles.tagWeight]}>{p.weight_class}</Text> : null}
      </View>
      <Text style={styles.time}>
        {lap.main}
        <Text style={styles.ms}>{lap.ms}</Text>
      </Text>
      {!p.certified ? <Text style={styles.declared}>Temps déclaré par le pilote</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, backgroundColor: 'rgba(255,107,53,0.06)' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  kicker: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' },
  tag: { fontSize: 12, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, overflow: 'hidden' },
  tagKart: { color: colors.orange, backgroundColor: 'rgba(255,107,53,0.15)' },
  tagDry: { color: colors.neon, backgroundColor: 'rgba(222,255,0,0.12)' },
  tagWet: { color: '#4FC3F7', backgroundColor: 'rgba(79,195,247,0.14)' },
  tagWeight: { color: '#B39DFF', backgroundColor: 'rgba(179,157,255,0.14)' },
  time: { fontFamily: fonts.display, fontSize: 44, lineHeight: 54, color: colors.text, fontVariant: ['tabular-nums'] },
  ms: { fontSize: 24, color: colors.textMuted },
  declared: { fontSize: 11, color: colors.textMuted },
});
