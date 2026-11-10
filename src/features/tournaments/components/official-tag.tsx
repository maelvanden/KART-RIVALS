import { StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors, radius } from '@/theme';

/** Étiquette « Officiel » : tournoi organisé par le karting lui-même. */
export function OfficialTag() {
  return (
    <View accessibilityLabel="Tournoi officiel du karting" style={styles.chip}>
      <Icon name={icons.verified} size={13} color={colors.onNeon} />
      <Text style={styles.text}>Officiel</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
