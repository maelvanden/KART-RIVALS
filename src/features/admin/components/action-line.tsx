import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { actionLabel, type AdminAction } from '@/features/admin/panel';
import { formatMessageTime } from '@/lib/format';
import { colors } from '@/theme';

/** Une ligne du journal des actions admin : quoi, sur qui, par qui, quand. */
export function ActionLine({ action }: { action: Pick<AdminAction, 'action' | 'details' | 'created_at' | 'admin'> & Partial<AdminAction> }) {
  const target = action.pilot ?? action.track;
  const reason = typeof action.details?.reason === 'string' ? action.details.reason : null;
  return (
    <View style={styles.line}>
      <Text style={styles.text}>
        {actionLabel(action)}
        {target ? <Text style={styles.target}> · {target}</Text> : null}
      </Text>
      {reason ? <Text variant="caption">« {reason} »</Text> : null}
      <Text variant="caption">
        {action.admin ?? 'admin'} · {formatMessageTime(action.created_at)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { gap: 2, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  text: { fontWeight: '700' },
  target: { fontWeight: '500', color: colors.textMuted },
});
