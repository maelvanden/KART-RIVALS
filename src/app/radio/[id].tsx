import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { CarbonBackdrop } from '@/components/ui/carbon-backdrop';
import { Icon, icons, type IconName } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { useMyProfile } from '@/features/profile/api';
import { ReportSheet } from '@/features/social/components/report-sheet';
import { PhotoMessage } from '@/features/social/components/radio/photo-message';
import { PollCard } from '@/features/social/components/radio/poll-card';
import { PollComposer } from '@/features/social/components/radio/poll-composer';
import { ShareCard } from '@/features/social/components/radio/share-card';
import { SharePicker } from '@/features/social/components/radio/share-picker';
import { asImage, asPoll, asShare, messagePreview } from '@/features/social/messages';
import {
  demoTypingEvents,
  useConversationMeta,
  useConversations,
  useMarkRead,
  useMessage,
  useMessages,
  usePinMessage,
  usePollVotes,
  useRadioRealtime,
  useSendMessage,
  useVotePoll,
  type OutgoingMessage,
} from '@/features/social/radio';
import { isStaff } from '@/features/social/roles';
import { useBlockedIds, useBlockPilot, useUnblockPilot } from '@/features/social/safety';
import { useMyTeam } from '@/features/social/teams';
import { confirmAction } from '@/lib/confirm';
import { isDemoMode } from '@/lib/demo';
import { formatMessageTime } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import type { Message, PollVote } from '@/types/models';

type Sheet = 'menu' | 'share' | 'poll' | null;

/** Conversation Radio Paddock, en temps réel : texte, photos, partages, sondages, épingle, « Vu » et frappe. */
export default function RadioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const profile = useMyProfile();
  const insets = useSafeAreaInsets();
  const conversation = useConversations().data?.find((c) => c.id === id);
  const messages = useMessages(id);
  const meta = useConversationMeta(id);
  const team = useMyTeam();
  const send = useSendMessage(id);
  const vote = useVotePoll(id);
  const pin = usePinMessage(id);
  const [draft, setDraft] = useState('');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<Message | null>(null);
  const isTeam = conversation?.kind === 'team';
  const blockedIds = useBlockedIds();
  const block = useBlockPilot();
  const unblock = useUnblockPilot();
  // 1v1 gelé : j'ai bloqué ce pilote (s'il m'a bloqué, l'envoi est refusé par le serveur).
  const frozen = conversation?.kind === 'direct' && blockedIds.has(conversation.other_id ?? '');

  const { typing, notifyTyping, showTyping, stopTyping } = useRadioRealtime(id);
  useMarkRead(id, messages.data?.at(-1)?.id);
  useDemoTyping(id, showTyping, stopTyping);

  const pollIds = useMemo(() => (messages.data ?? []).filter((m) => m.kind === 'poll').map((m) => m.id), [messages.data]);
  const votes = usePollVotes(id, pollIds);
  const pinned = useMessage(meta.data?.pinnedMessageId, messages.data);
  // Canal d'écurie : seul le staff épingle. 1v1 : l'un ou l'autre.
  const canPin = !isTeam || isStaff(team.data?.members.find((m) => m.pilot.id === userId)?.role);

  const title = conversation?.title ?? 'Radio Paddock';
  const canSend = draft.trim().length > 0 && !send.isPending;
  const myLast = [...(messages.data ?? [])].reverse().find((m) => m.sender_id === userId);
  const seenBy = myLast ? (meta.data?.readers ?? []).filter((r) => r.last_read_at >= myLast.created_at) : [];

  function post(outgoing: OutgoingMessage, onSuccess?: () => void) {
    send.mutate(outgoing, { onSuccess });
  }

  function submit() {
    const body = draft.trim();
    if (!body) return;
    post({ kind: 'text', body }, () => setDraft(''));
  }

  async function addPhoto(source: 'camera' | 'library') {
    setSheet(null);
    setPickError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Autorise l’accès à l’appareil photo dans les réglages.');
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const { uri, width, height } = result.assets[0];
      post({ kind: 'image', localUri: uri, width, height });
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Impossible d’ajouter la photo.');
    }
  }

  // Liste inversée : le plus récent en bas, collé au champ de saisie.
  const items = [...(messages.data ?? [])].reverse();
  const error = (send.error ?? vote.error ?? pin.error ?? block.error ?? unblock.error) as Error | null;

  function askBlock(message: Message) {
    const name = message.sender?.username ?? 'ce pilote';
    confirmAction(
      `Bloquer ${name} ?`,
      'Vous ne serez plus coéquipiers, sa Radio 1v1 est gelée et ses messages sont masqués pour toi. Il ne sera pas prévenu.',
      'Bloquer',
      () => block.mutate({ id: message.sender_id, username: message.sender?.username }),
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen options={{ title }} />
      <CarbonBackdrop />

      {pinned ? (
        <View style={styles.pinned}>
          <Icon name={icons.pinned} size={16} color={colors.neon} />
          <View style={styles.pinnedText}>
            <Text style={styles.pinnedLabel}>Épinglé</Text>
            <Text numberOfLines={1} style={styles.pinnedBody}>
              {messagePreview(pinned)}
            </Text>
          </View>
          {canPin ? (
            <Pressable accessibilityLabel="Retirer l’épingle" hitSlop={10} onPress={() => pin.mutate(null)}>
              <Icon name={icons.close} size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

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
          return (
            <View>
              <Bubble
                message={item}
                mine={mine}
                // Nom de l'expéditeur au début d'une série, dans le canal d'écurie.
                showSender={isTeam && !mine && older?.sender_id !== item.sender_id}
                myId={userId}
                votes={(votes.data ?? []).filter((v) => v.message_id === item.id)}
                onVote={(option) => vote.mutate({ messageId: item.id, option })}
                blocked={!mine && blockedIds.has(item.sender_id)}
                onLongPress={canPin || !mine ? () => setSelected(item) : undefined}
                pinned={item.id === meta.data?.pinnedMessageId}
              />
              {item.id === myLast?.id && seenBy.length > 0 ? (
                <View style={styles.seen}>
                  <Icon name={icons.seen} size={12} color={colors.neon} />
                  <Text style={styles.seenText}>
                    {isTeam ? `Vu par ${seenBy.length === 1 ? seenBy[0].username : `${seenBy.length} pilotes`}` : 'Vu'}
                  </Text>
                </View>
              ) : null}
            </View>
          );
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

      {typing.length > 0 ? (
        <Text style={styles.typing}>
          {typing.length === 1 ? `${typing[0]} écrit…` : `${typing.length} pilotes écrivent…`}
        </Text>
      ) : null}
      {error || pickError ? <Text style={styles.error}>{pickError ?? error?.message}</Text> : null}

      {frozen ? (
        <View style={[styles.frozen, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.frozenRow}>
            <Icon name={icons.block} size={18} color={colors.danger} />
            <Text style={styles.frozenText}>Tu as bloqué {title}. La radio est coupée.</Text>
          </View>
          <Button
            title="Débloquer"
            variant="secondary"
            loading={unblock.isPending}
            onPress={() => conversation?.other_id && unblock.mutate(conversation.other_id)}
          />
        </View>
      ) : (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter une photo, un partage ou un sondage"
            onPress={() => setSheet('menu')}
            style={({ pressed }) => [styles.plus, pressed && styles.pressed]}>
            <Icon name={icons.plus} size={22} color={colors.neon} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              if (t.trim() && profile.data) notifyTyping(profile.data.username);
            }}
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
      )}

      <BottomSheet visible={sheet === 'menu'} onClose={() => setSheet(null)} title="Ajouter">
        <View style={styles.menu}>
          <MenuItem icon={icons.camera} label="Prendre une photo" onPress={() => addPhoto('camera')} />
          <MenuItem icon={icons.gallery} label="Photo de la galerie" onPress={() => addPhoto('library')} />
          <MenuItem icon={icons.share} label="Partager un défi, une course, un record…" onPress={() => setSheet('share')} />
          <MenuItem icon={icons.poll} label="Sondage rapide" onPress={() => setSheet('poll')} />
        </View>
      </BottomSheet>
      <SharePicker
        visible={sheet === 'share'}
        onClose={() => setSheet(null)}
        onShare={(payload) => post({ kind: 'share', payload }, () => setSheet(null))}
      />
      <PollComposer
        visible={sheet === 'poll'}
        sending={send.isPending}
        onClose={() => setSheet(null)}
        onSend={(payload) => post({ kind: 'poll', payload }, () => setSheet(null))}
      />
      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title="Message">
        <View style={styles.menu}>
          {selected ? (
            <Text variant="caption" numberOfLines={2}>
              {messagePreview(selected)}
            </Text>
          ) : null}
          {!canPin || selected?.hidden_at ? null : selected?.id === meta.data?.pinnedMessageId ? (
            <MenuItem icon={icons.pinned} label="Retirer l’épingle" onPress={() => (pin.mutate(null), setSelected(null))} />
          ) : (
            <MenuItem
              icon={icons.pinned}
              label={isTeam ? 'Épingler pour toute l’écurie' : 'Épingler'}
              onPress={() => (selected && pin.mutate(selected.id), setSelected(null))}
            />
          )}
          {selected && selected.sender_id !== userId ? (
            <>
              <MenuItem
                icon={icons.report}
                label="Signaler le message"
                danger
                onPress={() => (setReporting(selected), setSelected(null))}
              />
              {blockedIds.has(selected.sender_id) ? (
                <MenuItem
                  icon={icons.block}
                  label={`Débloquer ${selected.sender?.username ?? 'ce pilote'}`}
                  onPress={() => (unblock.mutate(selected.sender_id), setSelected(null))}
                />
              ) : (
                <MenuItem
                  icon={icons.block}
                  label={`Bloquer ${selected.sender?.username ?? 'ce pilote'}`}
                  danger
                  onPress={() => (askBlock(selected), setSelected(null))}
                />
              )}
            </>
          ) : null}
        </View>
      </BottomSheet>
      <ReportSheet
        target={
          reporting
            ? {
                pilotId: reporting.sender_id,
                username: reporting.sender?.username ?? 'ce pilote',
                messageId: reporting.id,
                preview: messagePreview(reporting) ?? undefined,
              }
            : null
        }
        onClose={() => setReporting(null)}
        onBlock={
          reporting && !blockedIds.has(reporting.sender_id)
            ? () => block.mutate({ id: reporting.sender_id, username: reporting.sender?.username })
            : undefined
        }
      />
    </KeyboardAvoidingView>
  );
}

type BubbleProps = {
  message: Message;
  mine: boolean;
  showSender: boolean;
  myId: string | null;
  votes: PollVote[];
  onVote: (option: number) => void;
  onLongPress?: () => void;
  pinned: boolean;
  /** Expéditeur que j'ai bloqué : contenu masqué. */
  blocked?: boolean;
};

function Bubble({ message, mine, showSender, myId, votes, onVote, onLongPress, pinned, blocked }: BubbleProps) {
  const share = asShare(message);
  const poll = asPoll(message);
  const image = asImage(message);
  const sender = showSender ? <Text style={styles.sender}>{message.sender?.username ?? 'Ancien pilote'}</Text> : null;
  const time = (
    <View style={[styles.timeRow, mine && styles.timeRowMine]}>
      {pinned ? <Icon name={icons.pinned} size={10} color={colors.textMuted} /> : null}
      <Text style={styles.timeLoose}>{formatMessageTime(message.created_at)}</Text>
    </View>
  );

  // Masqué après 3 signalements, ou envoyé par un pilote que j'ai bloqué.
  if (message.hidden_at || blocked) {
    return (
      <Pressable onLongPress={onLongPress} delayLongPress={350} style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
        <View style={styles.masked}>
          {sender}
          <View style={styles.maskedRow}>
            <Icon name={icons.hidden} size={14} color={colors.textMuted} />
            <Text style={styles.maskedText}>
              {message.hidden_at ? 'Message masqué après signalements' : 'Message d’un pilote bloqué'}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  // Cartes (partage, sondage, photo) : posées telles quelles, sans bulle.
  if (share || poll || image) {
    return (
      <Pressable onLongPress={onLongPress} delayLongPress={350} style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
        <View style={[styles.cardColumn, mine && styles.cardColumnMine]}>
          {sender}
          {share ? <ShareCard share={share} senderId={message.sender_id} myId={myId} mine={mine} /> : null}
          {poll ? <PollCard poll={poll} votes={votes} myId={myId} onVote={onVote} /> : null}
          {image ? <PhotoMessage image={image} /> : null}
          {image && message.body ? <Text style={styles.caption}>{message.body}</Text> : null}
          {time}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350} style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
        {sender}
        <Text style={[styles.body, mine && styles.bodyMine]}>{message.body}</Text>
        <View style={[styles.timeRow, styles.timeRowMine]}>
          {pinned ? <Icon name={icons.pinned} size={10} color={mine ? 'rgba(22, 25, 32, 0.6)' : colors.textMuted} /> : null}
          <Text style={[styles.time, mine && styles.timeMine]}>{formatMessageTime(message.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function MenuItem({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
      <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>
        <Icon name={icon} size={18} color={danger ? colors.danger : colors.neon} />
      </View>
      <Text style={[styles.menuLabel, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

/** Mode démo : « TurboLéa écrit… » avant sa réponse automatique. */
function useDemoTyping(conversationId: string, show: (id: string, name: string) => void, stop: (id: string) => void) {
  useEffect(() => {
    if (!isDemoMode) return;
    const onTyping = (e: Event) => {
      const { conversationId: c, id, username } = (e as CustomEvent).detail;
      if (c === conversationId) show(id, username);
    };
    const onStop = (e: Event) => {
      const { conversationId: c, id } = (e as CustomEvent).detail;
      if (c === conversationId) stop(id);
    };
    demoTypingEvents.addEventListener('typing', onTyping);
    demoTypingEvents.addEventListener('stop', onStop);
    return () => {
      demoTypingEvents.removeEventListener('typing', onTyping);
      demoTypingEvents.removeEventListener('stop', onStop);
    };
  }, [conversationId, show, stop]);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pinned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.neon,
  },
  pinnedText: { flex: 1 },
  pinnedLabel: { fontFamily: fonts.display, fontSize: 11, letterSpacing: 1.2, color: colors.neon, textTransform: 'uppercase' },
  pinnedBody: { fontWeight: '600' },
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
  cardColumn: { gap: 4, alignItems: 'flex-start' },
  cardColumnMine: { alignItems: 'flex-end' },
  caption: { maxWidth: 240, color: colors.text },
  sender: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 1, color: colors.neon, textTransform: 'uppercase' },
  body: { fontSize: 15, lineHeight: 21, color: colors.text },
  bodyMine: { color: colors.onNeon, fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeRowMine: { alignSelf: 'flex-end' },
  time: { fontSize: 11, color: colors.textMuted },
  timeMine: { color: 'rgba(22, 25, 32, 0.6)' },
  timeLoose: { fontSize: 11, color: colors.textMuted },
  seen: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  seenText: { fontSize: 11, color: colors.neon, fontWeight: '700' },
  typing: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, color: colors.neon, fontStyle: 'italic', fontSize: 13 },
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
  plus: {
    width: 46,
    height: 46,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
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
  menu: { gap: spacing.sm, paddingBottom: spacing.sm },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuIcon: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.neonDim, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontWeight: '700' },
  menuIconDanger: { backgroundColor: 'rgba(255, 59, 92, 0.12)' },
  masked: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  maskedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  maskedText: { fontSize: 13, fontStyle: 'italic', color: colors.textMuted },
  frozen: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  frozenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  frozenText: { flex: 1, fontWeight: '700' },
});
