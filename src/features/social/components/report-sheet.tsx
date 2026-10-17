import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { REPORT_REASONS, useReport } from '@/features/social/safety';
import { useReportTrackPhoto } from '@/features/tracks/photos';
import { colors, radius, spacing } from '@/theme';
import type { ReportReason } from '@/types/models';

type Target = { pilotId: string; username: string; messageId?: string; photoId?: string; preview?: string };

type Props = {
  target: Target | null;
  onClose: () => void;
  /** Proposé après l'envoi : bloquer aussi le pilote. */
  onBlock?: () => void;
};

/** Signaler un pilote, un message ou une photo de circuit : motif, précisions facultatives, puis confirmation. */
export function ReportSheet({ target, onClose, onBlock }: Props) {
  const reportPilot = useReport();
  const reportPhoto = useReportTrackPhoto();
  const report = target?.photoId ? reportPhoto : reportPilot;
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);

  function close() {
    setReason(null);
    setDetails('');
    setSent(false);
    reportPilot.reset();
    reportPhoto.reset();
    onClose();
  }

  function submit() {
    if (!target || !reason) return;
    const onSuccess = () => setSent(true);
    if (target.photoId) reportPhoto.mutate({ photoId: target.photoId, reason, details }, { onSuccess });
    else reportPilot.mutate({ pilotId: target.pilotId, reason, details, messageId: target.messageId }, { onSuccess });
  }

  const title = target?.photoId
    ? 'Signaler la photo'
    : target?.messageId
      ? 'Signaler le message'
      : `Signaler ${target?.username ?? ''}`;

  return (
    <BottomSheet visible={!!target} onClose={close} title={title} leading={<Icon name={icons.report} color={colors.danger} />}>
      {sent ? (
        <View style={styles.form}>
          <View style={styles.done}>
            <Icon name={icons.checkCircle} size={28} color={colors.neon} />
            <Text style={styles.doneTitle}>Signalement envoyé</Text>
            <Text variant="caption" style={styles.center}>
              Merci, la direction de course va l’examiner. {target?.username} ne sait pas qui l’a signalé.
            </Text>
          </View>
          {onBlock ? (
            <Button
              title={`Bloquer ${target?.username}`}
              variant="secondary"
              icon={<Icon name={icons.block} size={18} color={colors.text} />}
              onPress={() => {
                onBlock();
                close();
              }}
            />
          ) : null}
          <Button title="Fermer" variant="quiet" onPress={close} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {target?.preview ? (
            <Text variant="caption" numberOfLines={2} style={styles.preview}>
              « {target.preview} »
            </Text>
          ) : null}
          {REPORT_REASONS.map((r) => {
            const active = r.value === reason;
            return (
              <Pressable
                key={r.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setReason(r.value)}
                style={[styles.reason, active && styles.reasonActive]}>
                <View style={[styles.dot, active && styles.dotActive]} />
                <View style={styles.reasonText}>
                  <Text style={styles.reasonLabel}>{r.label}</Text>
                  <Text variant="caption">{r.detail}</Text>
                </View>
              </Pressable>
            );
          })}
          <Input
            label="Précisions (facultatif)"
            value={details}
            onChangeText={setDetails}
            placeholder="Ce qui s’est passé…"
            maxLength={500}
            multiline
          />
          {report.error ? <Text style={styles.error}>{report.error.message}</Text> : null}
          <Button title="Envoyer le signalement" disabled={!reason} loading={report.isPending} onPress={submit} />
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm },
  preview: { fontStyle: 'italic' },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  reasonActive: { borderColor: colors.neon },
  dot: { width: 16, height: 16, borderRadius: 4, borderWidth: 2, borderColor: colors.borderStrong },
  dotActive: { borderColor: colors.neon, backgroundColor: colors.neon },
  reasonText: { flex: 1, gap: 2 },
  reasonLabel: { fontWeight: '700' },
  error: { color: colors.danger },
  done: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  doneTitle: { fontWeight: '800', fontSize: 17 },
  center: { textAlign: 'center' },
});
