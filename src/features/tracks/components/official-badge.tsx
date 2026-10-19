import { StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors, radius } from '@/theme';

/** Badge « karting officiel » : la fiche est tenue par l'exploitant (admin karting validé). */
export function OfficialBadge({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <View accessibilityLabel="Karting officiel" style={styles.icon}>
        <Icon name={icons.verified} size={15} color={colors.neon} />
      </View>
    );
  }
  return (
    <View accessibilityLabel="Karting officiel : fiche tenue par l'exploitant" style={styles.chip}>
      <Icon name={icons.verified} size={13} color={colors.onNeon} />
      <Text style={styles.text}>Karting officiel</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { alignSelf: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.neon,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  text: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.onNeon },
});
