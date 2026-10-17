import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { demoConversations, demoPilots, demoReplies, demoSender, demoSocial } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type {
  Conversation,
  ConversationReader,
  ImagePayload,
  Message,
  MessageKind,
  PollPayload,
  PollVote,
  SharePayload,
} from '@/types/models';

/** Nombre de messages chargés à l'ouverture d'une conversation. */
const PAGE = 100;
const MESSAGE_COLUMNS =
  'id, conversation_id, sender_id, kind, body, payload, created_at, sender:profiles!messages_sender_id_fkey (username, avatar_url)';

// ---------- Conversations ----------

/** Mes conversations (écurie + 1v1), la plus active d'abord, avec le nombre de non-lus. */
export function useConversations() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['conversations', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Conversation[]> => {
      if (isDemoMode) return demoConversations();
      const { data, error } = await supabase.rpc('my_conversations');
      if (error) throw error;
      return data as Conversation[];
    },
  });
}

export type ConversationMeta = {
  pinnedMessageId: string | null;
  /** Les autres membres et jusqu'où ils ont lu. */
  readers: ConversationReader[];
};

/** Message épinglé et état de lecture des autres membres (indicateur « Vu »). */
export function useConversationMeta(conversationId: string | undefined) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['conversation-meta', conversationId],
    enabled: !!conversationId && !!userId,
    queryFn: async (): Promise<ConversationMeta> => {
      if (isDemoMode) {
        const readers = Object.entries(demoSocial.readers[conversationId!] ?? {}).map(([id, at]) => ({
          profile_id: id,
          last_read_at: at,
          username: demoPilots[id]?.username ?? 'Pilote',
        }));
        return { pinnedMessageId: demoSocial.pinned[conversationId!] ?? null, readers };
      }
      const [conversation, members] = await Promise.all([
        supabase.from('conversations').select('pinned_message_id').eq('id', conversationId!).maybeSingle(),
        supabase
          .from('conversation_members')
          .select('profile_id, last_read_at, pilot:profiles (username)')
          .eq('conversation_id', conversationId!)
          .neq('profile_id', userId!),
      ]);
      if (conversation.error) throw conversation.error;
      if (members.error) throw members.error;
      const rows = members.data as unknown as { profile_id: string; last_read_at: string; pilot: { username: string } | null }[];
      return {
        pinnedMessageId: conversation.data?.pinned_message_id ?? null,
        readers: rows.map((r) => ({ profile_id: r.profile_id, last_read_at: r.last_read_at, username: r.pilot?.username ?? 'Pilote' })),
      };
    },
  });
}

// ---------- Messages ----------

export const messagesKey = (conversationId: string) => ['messages', conversationId] as const;

/** Messages d'une conversation, du plus ancien au plus récent. */
export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: messagesKey(conversationId ?? ''),
    enabled: !!conversationId,
    queryFn: async (): Promise<Message[]> => {
      if (isDemoMode) {
        return (demoSocial.messages[conversationId!] ?? []).map((m) => ({ ...m, sender: demoSender(m.sender_id) }));
      }
      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: false })
        .limit(PAGE);
      if (error) throw error;
      return (data as unknown as Message[]).reverse();
    },
  });
}

/** Un message précis (message épinglé plus ancien que la page chargée). */
export function useMessage(messageId: string | null | undefined, loaded: Message[] | undefined) {
  const inPage = loaded?.find((m) => m.id === messageId);
  const query = useQuery({
    queryKey: ['message', messageId],
    enabled: !!messageId && !inPage && !isDemoMode,
    queryFn: async (): Promise<Message | null> => {
      const { data, error } = await supabase.from('messages').select(MESSAGE_COLUMNS).eq('id', messageId!).maybeSingle();
      if (error) throw error;
      return data as unknown as Message | null;
    },
  });
  return inPage ?? query.data ?? null;
}

/** Ajoute un message au cache s'il n'y est pas déjà (envoi local puis écho temps réel). */
function appendMessage(list: Message[] | undefined, message: Message): Message[] {
  if (!list) return [message];
  if (list.some((m) => m.id === message.id)) return list;
  return [...list, message];
}

export type OutgoingMessage =
  | { kind: 'text'; body: string }
  | { kind: 'share'; payload: SharePayload }
  | { kind: 'poll'; payload: PollPayload }
  | { kind: 'image'; localUri: string; width: number; height: number; caption?: string };

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (outgoing: OutgoingMessage): Promise<Message> => {
      if (isDemoMode) return demoSend(conversationId, outgoing, queryClient);
      let row: { kind: MessageKind; body: string | null; payload: Message['payload'] };
      if (outgoing.kind === 'image') {
        const payload = await uploadRadioPhoto(conversationId, outgoing);
        row = { kind: 'image', body: outgoing.caption?.trim() || null, payload };
      } else if (outgoing.kind === 'text') {
        row = { kind: 'text', body: outgoing.body, payload: null };
      } else {
        row = { kind: outgoing.kind, body: null, payload: outgoing.payload };
      }
      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, ...row })
        .select(MESSAGE_COLUMNS)
        .single();
      if (error) throw socialError(error);
      return data as unknown as Message;
    },
    onSuccess: (message) => {
      queryClient.setQueryData<Message[]>(messagesKey(conversationId), (list) => appendMessage(list, message));
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

// ---------- Photos ----------

/** Largeur maximale d'une photo envoyée dans la Radio. */
const PHOTO_MAX_WIDTH = 1440;

async function uploadRadioPhoto(
  conversationId: string,
  { localUri, width }: { localUri: string; width: number },
): Promise<ImagePayload> {
  const context = ImageManipulator.manipulate(localUri);
  if (width > PHOTO_MAX_WIDTH) context.resize({ width: PHOTO_MAX_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
  const bytes = await (await fetch(saved.uri)).arrayBuffer();
  const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from('radio-photos').upload(path, bytes, { contentType: 'image/jpeg' });
  if (error) throw error;
  return { path, width: saved.width, height: saved.height };
}

/** Adresse temporaire (1 h) d'une photo du bucket privé, réservée aux membres de la conversation. */
export function useRadioPhotoUrl(path: string | undefined) {
  return useQuery({
    queryKey: ['radio-photo', path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async (): Promise<string> => {
      if (isDemoMode || /^(file|blob|data|https?):/.test(path!)) return path!;
      const { data, error } = await supabase.storage.from('radio-photos').createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

// ---------- Sondages ----------

export const votesKey = (conversationId: string) => ['poll-votes', conversationId] as const;

/** Votes de tous les sondages de la conversation. */
export function usePollVotes(conversationId: string | undefined, pollIds: string[]) {
  return useQuery({
    queryKey: [...votesKey(conversationId ?? ''), pollIds.join(',')],
    enabled: !!conversationId && pollIds.length > 0,
    queryFn: async (): Promise<PollVote[]> => {
      if (isDemoMode) {
        return pollIds.flatMap((id) =>
          Object.entries(demoSocial.votes[id] ?? {}).map(([profile_id, option_index]) => ({ message_id: id, profile_id, option_index })),
        );
      }
      const { data, error } = await supabase.from('poll_votes').select('message_id, profile_id, option_index').in('message_id', pollIds);
      if (error) throw error;
      return data;
    },
  });
}

export function useVotePoll(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, option }: { messageId: string; option: number }) => {
      if (isDemoMode) {
        (demoSocial.votes[messageId] ??= {})[demoProfile.id] = option;
        return;
      }
      const { error } = await supabase.rpc('vote_poll', { p_message_id: messageId, p_option: option });
      if (error) throw socialError(error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: votesKey(conversationId) }),
  });
}

// ---------- Épingle ----------

export function usePinMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string | null) => {
      if (isDemoMode) {
        demoSocial.pinned[conversationId] = messageId;
        return;
      }
      const { error } = await supabase.rpc('pin_message', { p_conversation_id: conversationId, p_message_id: messageId });
      if (error) throw socialError(error);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversation-meta', conversationId] }),
  });
}

// ---------- Lecture ----------

/** Marque la conversation comme lue (à l'ouverture et à chaque nouveau message). */
export function useMarkRead(conversationId: string | undefined, lastMessageId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!conversationId) return;
    const done = () => queryClient.invalidateQueries({ queryKey: ['conversations'] });
    if (isDemoMode) {
      demoSocial.read[conversationId] = new Date().toISOString();
      done();
      return;
    }
    supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId }).then(done);
  }, [conversationId, lastMessageId, queryClient]);
}

// ---------- Temps réel ----------

/** Délai après lequel « en train d'écrire » disparaît sans nouvelle frappe. */
const TYPING_TIMEOUT = 4000;

/**
 * Canal temps réel d'une conversation :
 * - nouveaux messages (postgres_changes INSERT filtré sur la conversation) ;
 * - votes, épingle et lectures (« Vu ») ;
 * - « en train d'écrire » par diffusion (broadcast), sans passer par la base.
 * Renvoie les pseudos en train d'écrire et la fonction à appeler à chaque frappe.
 */
export function useRadioRealtime(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSent = useRef(0);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [typing, setTyping] = useState<Record<string, string>>({});

  const showTyping = useCallback((id: string, username: string) => {
    setTyping((t) => ({ ...t, [id]: username }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      setTyping(({ [id]: _gone, ...rest }) => rest);
    }, TYPING_TIMEOUT);
  }, []);

  const stopTyping = useCallback((id: string) => {
    clearTimeout(timers.current[id]);
    setTyping(({ [id]: _gone, ...rest }) => rest);
  }, []);

  useEffect(() => {
    if (!conversationId || isDemoMode) return;
    const key = messagesKey(conversationId);
    const refreshMeta = () => queryClient.invalidateQueries({ queryKey: ['conversation-meta', conversationId] });
    const channel = supabase
      .channel(`radio:${conversationId}`, { config: { broadcast: { self: false } } })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const incoming = payload.new as Message;
          stopTyping(incoming.sender_id);
          const cached = queryClient.getQueryData<Message[]>(key);
          // Le profil de l'expéditeur n'est pas dans l'événement : on le reprend d'un message déjà chargé.
          const sender = cached?.find((m) => m.sender_id === incoming.sender_id)?.sender;
          if (!sender) {
            queryClient.invalidateQueries({ queryKey: key });
            return;
          }
          queryClient.setQueryData<Message[]>(key, (list) => appendMessage(list, { ...incoming, sender }));
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () =>
        queryClient.invalidateQueries({ queryKey: votesKey(conversationId) }),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${conversationId}` },
        refreshMeta,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${conversationId}` },
        refreshMeta,
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const { id, username } = payload as { id: string; username: string };
        if (id !== userId) showTyping(id, username);
      })
      .subscribe();
    channelRef.current = channel;
    const pending = timers.current;
    return () => {
      channelRef.current = null;
      Object.values(pending).forEach(clearTimeout);
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient, userId, showTyping, stopTyping]);

  /** À appeler à chaque frappe : prévient les autres au plus toutes les 2 s. */
  const notifyTyping = useCallback(
    (username: string) => {
      const now = Date.now();
      if (now - lastSent.current < 2000) return;
      lastSent.current = now;
      channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { id: userId, username } });
    },
    [userId],
  );

  return { typing: Object.values(typing), notifyTyping, showTyping, stopTyping };
}

/** Ouvre (ou crée) la conversation 1v1 avec un coéquipier ; renvoie son id. */
export function useOpenDirectRadio() {
  return useMutation({
    mutationFn: async (pilotId: string): Promise<string> => {
      if (isDemoMode) {
        const id = `conv-${pilotId}`;
        demoSocial.messages[id] ??= [];
        return id;
      }
      const { data, error } = await supabase.rpc('get_direct_conversation', { p_pilot_id: pilotId });
      if (error) throw socialError(error);
      return data as string;
    },
  });
}

// ---------- Mode démo ----------

/** En démo, un coéquipier « écrit » puis répond, et a lu le message. */
export const demoTypingEvents = new EventTarget();

function demoSend(conversationId: string, outgoing: OutgoingMessage, queryClient: ReturnType<typeof useQueryClient>): Message {
  const list = (demoSocial.messages[conversationId] ??= []);
  const base = { id: `m-${Date.now()}`, conversation_id: conversationId, sender_id: demoProfile.id, created_at: new Date().toISOString() };
  const message: Message =
    outgoing.kind === 'image'
      ? { ...base, kind: 'image', body: outgoing.caption?.trim() || null, payload: { path: outgoing.localUri, width: outgoing.width, height: outgoing.height } }
      : outgoing.kind === 'text'
        ? { ...base, kind: 'text', body: outgoing.body, payload: null }
        : { ...base, kind: outgoing.kind, body: null, payload: outgoing.payload };
  list.push(message);
  const withSender = { ...message, sender: demoSender(demoProfile.id) };

  const responder = conversationId === 'conv-team' ? 'p1' : conversationId.replace('conv-', '');
  const pilot = demoPilots[responder];
  setTimeout(() => {
    // Le coéquipier a lu, puis écrit…
    (demoSocial.readers[conversationId] ??= {})[responder] = new Date().toISOString();
    queryClient.invalidateQueries({ queryKey: ['conversation-meta', conversationId] });
    demoTypingEvents.dispatchEvent(new CustomEvent('typing', { detail: { conversationId, id: responder, username: pilot?.username } }));
  }, 900);
  setTimeout(() => {
    const reply: Message = {
      id: `m-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: responder,
      kind: 'text',
      body: demoReplies[list.length % demoReplies.length],
      payload: null,
      created_at: new Date().toISOString(),
    };
    list.push(reply);
    demoTypingEvents.dispatchEvent(new CustomEvent('stop', { detail: { conversationId, id: responder } }));
    queryClient.setQueryData<Message[]>(messagesKey(conversationId), (cached) =>
      appendMessage(cached, { ...reply, sender: demoSender(responder) }),
    );
  }, 3200);
  return withSender;
}
