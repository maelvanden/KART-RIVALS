import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTeamTag } from '@/features/social/team-tags';
import { colors, fonts, radius } from '@/theme';

type Props = { pilotId: string | null | undefined; size?: 'sm' | 'md' };

/** Tag d'écurie à côté du pseudo : « [VRA] » en Volt, coupé en biais. Rien si le pilote n'a pas d'écurie. */
export function TeamTag({ pilotId, size = 'sm' }: Props) {
  const tag = useTeamTag(pilotId);
  if (!tag) return null;
  return (
    <View style={[styles.chip, size === 'md' && styles.chipMd]} accessibilityLabel={`Écurie ${tag}`}>
      <Text style={[styles.text, size === 'md' && styles.textMd]}>[{tag}]</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: colors.neon,
    backgroundColor: colors.neonDim,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    transform: [{ skewX: '-12deg' }],
    alignSelf: 'center',
  },
  chipMd: { paddingHorizontal: 7, paddingVertical: 1 },
  text: { fontFamily: fonts.display, fontSize: 12, lineHeight: 17, letterSpacing: 0.8, color: colors.neon },
  textMd: { fontSize: 15, lineHeight: 21, letterSpacing: 1 },
});
