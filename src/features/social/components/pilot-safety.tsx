import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ReportSheet } from '@/features/social/components/report-sheet';
import { useBlockPilot, useIsBlocked, useUnblockPilot } from '@/features/social/safety';
import { confirmAction } from '@/lib/confirm';
import { colors, spacing } from '@/theme';
import type { PilotSummary } from '@/types/models';

/** Bas de la fiche d'un pilote : le signaler, le bloquer ou le débloquer. */
export function PilotSafety({ pilot }: { pilot: PilotSummary }) {
  const blocked = useIsBlocked(pilot.id);
  const block = useBlockPilot();
  const unblock = useUnblockPilot();
  const [reporting, setReporting] = useState(false);
  const error = (block.error ?? unblock.error) as Error | null;

  function askBlock() {
    confirmAction(
      `Bloquer ${pilot.username} ?`,
      'Vous ne serez plus coéquipiers. Plus de demande, de défi, d’invitation d’écurie ni de Radio entre vous. Il ne sera pas prévenu.',
      'Bloquer',
      () => block.mutate(pilot),
    );
  }

  return (
    <View style={styles.wrap}>
      {blocked ? (
        <Card style={styles.notice}>
          <Icon name={icons.block} size={18} color={colors.danger} />
          <Text style={styles.noticeText}>Tu as bloqué {pilot.username}.</Text>
        </Card>
      ) : null}
      <View style={styles.row}>
        <Button
          title="Signaler"
          variant="quiet"
          icon={<Icon name={icons.report} size={16} color={colors.textMuted} />}
          onPress={() => setReporting(true)}
          style={styles.flex}
        />
        <Button
          title={blocked ? 'Débloquer' : 'Bloquer'}
          variant="quiet"
          icon={<Icon name={icons.block} size={16} color={colors.textMuted} />}
          loading={block.isPending || unblock.isPending}
          onPress={() => (blocked ? unblock.mutate(pilot.id) : askBlock())}
          style={styles.flex}
        />
      </View>
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      <ReportSheet
        target={reporting ? { pilotId: pilot.id, username: pilot.username } : null}
        onClose={() => setReporting(false)}
        onBlock={blocked ? undefined : () => block.mutate(pilot)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.danger },
  noticeText: { flex: 1, fontWeight: '700' },
  error: { color: colors.danger },
});
