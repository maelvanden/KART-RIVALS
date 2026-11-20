import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useReportContext, type ContextMessage, type ContextRole } from '@/features/admin/messages';
import { formatMessageTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

const ROLE_LABEL: Record<ContextRole, string> = { reported: 'Message signalé', target: 'Pilote visé', reporter: 'Auteur du signalement', other: '' };

/**
 * Bouton « Voir le contexte » d'un message signalé : les 5 messages avant et après, dans la même conversation.
 * La conversation est privée : rien n'est chargé tant qu'on n'ouvre pas, et l'ouverture est tracée au journal.
 */
export function ReportContext({ reportId }: { reportId: string }) {
  const [open, setOpen] = useState(false);
  const context = useReportContext(reportId, open);

  return (
    <View style={styles.wrap}>
      <Button
        title={open ? 'Masquer le contexte' : 'Voir le contexte'}
        variant="ghost"
        loading={open && context.isPending}
        onPress={() => setOpen((v) => !v)}
      />
      {open && context.isPending ? <Loading /> : null}
      {open && context.error ? <Text style={styles.error}>{context.error.message}</Text> : null}
      {open && context.data ? (
        <View style={styles.thread}>
          <Text variant="label">{context.data.conversation}</Text>
          <Text variant="caption">Conversation privée : cette consultation est notée au journal.</Text>
          {context.data.messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Bubble({ message: m }: { message: ContextMessage }) {
  const reported = m.role === 'reported';
  return (
    <View style={[styles.bubble, reported && styles.reported, m.role === 'target' && styles.target]}>
      <Text variant="caption" style={reported ? styles.reportedLabel : undefined}>
        {m.sender ?? 'pilote supprimé'}
        {ROLE_LABEL[m.role] ? ` · ${ROLE_LABEL[m.role]}` : ''} · {formatMessageTime(m.created_at)}
        {m.hidden ? ' · masqué' : ''}
      </Text>
      <Text style={m.hidden ? styles.hiddenText : undefined}>{m.text ?? 'Message sans texte'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  thread: { gap: spacing.sm },
  bubble: { gap: 2, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  target: { borderLeftWidth: 3, borderLeftColor: colors.textMuted },
  reported: { borderLeftWidth: 3, borderLeftColor: colors.danger, backgroundColor: colors.orangeDim },
  reportedLabel: { color: colors.danger, fontWeight: '800' },
  hiddenText: { color: colors.textMuted, fontStyle: 'italic' },
  error: { color: colors.danger },
});
