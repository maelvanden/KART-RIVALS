import { StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useVerification } from '@/features/profile/verified';
import { colors, spacing } from '@/theme';

type Props = { pilotId: string | null | undefined; size?: 'sm' | 'md'; withLabel?: boolean };

/** Badge « pilote vérifié » à côté du pseudo ; rien si le pilote n'a pas de Time Attack validé. */
export function VerifiedBadge({ pilotId, size = 'sm', withLabel }: Props) {
  const verification = useVerification(pilotId);
  if (!verification) return null;
  const label = `Pilote vérifié : ${verification.sessions} session${verification.sessions > 1 ? 's' : ''} Time Attack validée${verification.sessions > 1 ? 's' : ''} par ticket`;
  if (!withLabel) {
    return (
      <View accessibilityLabel={label} style={styles.icon}>
        <Icon name={icons.verified} size={size === 'md' ? 20 : 16} color={colors.neon} />
      </View>
    );
  }
  return (
    <View accessibilityLabel={label} style={styles.row}>
      <Icon name={icons.verified} size={16} color={colors.neon} />
      <Text style={styles.label}>Pilote vérifié</Text>
      <Text variant="caption">
        · {verification.sessions} chrono{verification.sessions > 1 ? 's' : ''} par ticket
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  label: { fontWeight: '800', color: colors.neon, fontSize: 13 },
});
