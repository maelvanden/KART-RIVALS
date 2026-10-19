import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { colors } from '@/theme';

const GOLD = '#FFC83D';

/** Étoiles d'une note sur 5 (arrondie à la demi-étoile près, affichée en entier au-dessus de .5). */
export function RatingStars({ value, size = 14 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <View style={styles.row} accessibilityLabel={`${value.toLocaleString('fr-FR')} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name={i <= full ? icons.star : icons.starOutline} size={size} color={i <= full ? GOLD : colors.textMuted} />
      ))}
    </View>
  );
}

/** Saisie d'une note de 1 à 5. */
export function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityLabel={`${label} : ${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} hitSlop={6} accessibilityLabel={`${i} étoile${i > 1 ? 's' : ''}`} onPress={() => onChange(i)}>
          <Icon name={i <= value ? icons.star : icons.starOutline} size={28} color={i <= value ? GOLD : colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
