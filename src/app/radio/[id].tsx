import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CarbonBackdrop } from '@/components/ui/carbon-backdrop';
import { Icon, icons } from '@/components/ui/icon';
import { ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { useConversations, useMarkRead, useMessages, useRadioRealtime, useSendMessage } from '@/features/social/radio';
import { colors, fonts, radius, spacing } from '@/theme';
import { formatMessageTime } from '@/lib/format';
import type { Message } from '@/types/models';

/** Conversation Radio Paddock, en temps réel. */
export default function RadioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const conversation = useConversations().data?.find((c) => c.id === id);
  const messages = useMessages(id);
  const send = useSendMessage(id);
  const [draft, setDraft] = useState('');
  const isTeam = conversation?.kind === 'team';

  useRadioRealtime(id);
  useMarkRead(id, messages.data?.at(-1)?.id);

  const title = conversation?.title ?? 'Radio Paddock';
  const canSend = draft.trim().length > 0 && !send.isPending;

  function submit() {
    const body = draft.trim();
    if (!body) return;
    send.mutate(body, { onSuccess: () => setDraft('') });
  }

  // Liste inversée : le plus récent en bas, collé au champ de saisie.
  const items = [...(messages.data ?? [])].reverse();

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen options={{ title }} />
      <CarbonBackdrop />
      {messages.isPending ? <Loading /> : null}
      {messages.error ? <ErrorState error={messages.error} /> : null}
      <FlatList
        inverted
        data={items}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messages}
        renderItem={({ item, index }) => {
          const older = items[index + 1];
          const mine = item.sender_id === userId;
          // Nom de l'expéditeur au début d'une série, dans le canal d'écurie.
          const showSender = isTeam && !mine && older?.sender_id !== item.sender_id;
          return <Bubble message={item} mine={mine} showSender={showSender} />;
        }}
        ListEmptyComponent={
          messages.data ? (
            <View style={styles.empty}>
              <Icon name={icons.radio} size={28} color={colors.neon} />
              <Text variant="caption" style={styles.emptyText}>
                Canal ouvert. Premier message radio ?
              </Text>
            </View>
          ) : null
        }
      />
      {send.error ? <Text style={styles.error}>{(send.error as Error).message}</Text> : null}
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message radio…"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          multiline
          maxLength={1000}
          onSubmitEditing={submit}
          submitBehavior={Platform.OS === 'web' ? 'submit' : undefined}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Envoyer"
          disabled={!canSend}
          onPress={submit}
          style={({ pressed }) => [styles.send, !canSend && styles.sendDisabled, pressed && styles.pressed]}>
          <Icon name={icons.send} size={20} color={colors.onNeon} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, mine, showSender }: { message: Message; mine: boolean; showSender: boolean }) {
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
        {showSender ? <Text style={styles.sender}>{message.sender?.username ?? 'Ancien pilote'}</Text> : null}
        <Text style={[styles.body, mine && styles.bodyMine]}>{message.body}</Text>
        <Text style={[styles.time, mine && styles.timeMine]}>{formatMessageTime(message.created_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  messages: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, transform: [{ scaleY: -1 }] },
  emptyText: { textAlign: 'center' },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  bubbleMine: { backgroundColor: colors.neon, borderRadius: radius.lg, borderBottomRightRadius: 2 },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.neon,
  },
  sender: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 1, color: colors.neon, textTransform: 'uppercase' },
  body: { fontSize: 15, lineHeight: 21, color: colors.text },
  bodyMine: { color: colors.onNeon, fontWeight: '600' },
  time: { fontSize: 11, color: colors.textMuted, alignSelf: 'flex-end' },
  timeMine: { color: 'rgba(22, 25, 32, 0.6)' },
  error: { color: colors.danger, paddingHorizontal: spacing.lg },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    fontFamily: fonts.medium,
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : {}),
  },
  send: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
});
