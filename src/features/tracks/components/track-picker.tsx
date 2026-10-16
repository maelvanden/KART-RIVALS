import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { TrackTypeBadge } from '@/features/tracks/components/track-row';
import { colors, radius, spacing } from '@/theme';
import type { TrackDetails } from '@/types/models';

type Props = {
  tracks: TrackDetails[];
  value: string | null;
  onChange: (trackId: string | null) => void;
  /** Libellé de l'option « aucun circuit ». */
  noneLabel?: string;
};

/** Choix d'un circuit (ou d'aucun) dans une liste de cartes à cocher. */
export function TrackPicker({ tracks, value, onChange, noneLabel = 'Aucun' }: Props) {
  return (
    <View style={styles.list} accessibilityRole="radiogroup">
      {tracks.map((t) => (
        <Option key={t.id} selected={value === t.id} onPress={() => onChange(t.id)} label={`${t.name}, ${t.city}`}>
          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={1}>
              {t.name}
            </Text>
            <Text variant="caption" numberOfLines={1}>
              {t.city}
              {t.length_m ? ` · ${t.length_m.toLocaleString('fr-FR')} m` : ''}
            </Text>
          </View>
          <TrackTypeBadge indoor={t.is_indoor} />
        </Option>
      ))}
      <Option selected={value === null} onPress={() => onChange(null)} label={noneLabel}>
        <Text style={[styles.name, styles.none]}>{noneLabel}</Text>
      </Option>
    </View>
  );
}

function Option({
  selected,
  onPress,
  label,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.option, selected && styles.selected]}>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.neon, backgroundColor: colors.selected },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.neon },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.neon },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '800' },
  none: { flex: 1, color: colors.textMuted },
});
