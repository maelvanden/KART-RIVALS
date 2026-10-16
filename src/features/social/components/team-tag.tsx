import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { withAlpha } from '@/features/social/colors';
import { useTeamTag } from '@/features/social/team-tags';
import { fonts, radius } from '@/theme';

type Props = { pilotId: string | null | undefined; size?: 'sm' | 'md' };

/** Tag d'écurie à côté du pseudo, aux couleurs de l'écurie, coupé en biais. Rien si le pilote n'a pas d'écurie. */
export function TeamTag({ pilotId, size = 'sm' }: Props) {
  const team = useTeamTag(pilotId);
  if (!team) return null;
  return (
    <View
      style={[styles.chip, size === 'md' && styles.chipMd, { borderColor: team.color, backgroundColor: withAlpha(team.color, 0.12) }]}
      accessibilityLabel={`Écurie ${team.tag}`}>
      <Text style={[styles.text, size === 'md' && styles.textMd, { color: team.color }]}>{team.tag}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    transform: [{ skewX: '-12deg' }],
    alignSelf: 'center',
  },
  chipMd: { paddingHorizontal: 7, paddingVertical: 1 },
  text: { fontFamily: fonts.display, fontSize: 12, lineHeight: 17, letterSpacing: 0.8 },
  textMd: { fontSize: 15, lineHeight: 21, letterSpacing: 1 },
});
