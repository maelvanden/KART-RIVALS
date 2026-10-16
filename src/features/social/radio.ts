import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { demoConversations, demoReplies, demoSender, demoSocial } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { Conversation, Message } from '@/types/models';

/** Nombre de messages chargés à l'ouverture d'une conversation. */
const PAGE = 100;

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
        .select('id, conversation_id, sender_id, body, created_at, sender:profiles!messages_sender_id_fkey (username, avatar_url)')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: false })
        .limit(PAGE);
      if (error) throw error;
      return (data as unknown as Message[]).reverse();
    },
  });
}

/** Ajoute un message au cache s'il n'y est pas déjà (envoi local puis écho temps réel). */
function appendMessage(list: Message[] | undefined, message: Message): Message[] {
  if (!list) return [message];
  if (list.some((m) => m.id === message.id)) return list;
  return [...list, message];
}

/**
 * Temps réel : les nouveaux messages de la conversation arrivent sans recharger.
 * Canal Supabase filtré sur la conversation ; la RLS garantit qu'on ne reçoit que ce qu'on a le droit de lire.
 */
export function useRadioRealtime(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId || isDemoMode) return;
    const channel = supabase
      .channel(`radio:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const incoming = payload.new as Message;
          const key = messagesKey(conversationId);
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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string): Promise<Message> => {
      if (isDemoMode) return demoSend(conversationId, body, queryClient);
      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, body })
        .select('id, conversation_id, sender_id, body, created_at, sender:profiles!messages_sender_id_fkey (username, avatar_url)')
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

function demoSend(conversationId: string, body: string, queryClient: ReturnType<typeof useQueryClient>): Message {
  const list = (demoSocial.messages[conversationId] ??= []);
  const message: Message = {
    id: `m-${Date.now()}`,
    conversation_id: conversationId,
    sender_id: demoProfile.id,
    body,
    created_at: new Date().toISOString(),
    sender: demoSender(demoProfile.id),
  };
  list.push(message);
  // Un coéquipier répond quelques secondes plus tard, comme un message reçu en temps réel.
  const responder = conversationId === 'conv-team' ? 'p1' : conversationId.replace('conv-', '');
  setTimeout(() => {
    const reply: Message = {
      id: `m-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: responder,
      body: demoReplies[list.length % demoReplies.length],
      created_at: new Date().toISOString(),
      sender: demoSender(responder),
    };
    list.push(reply);
    queryClient.setQueryData<Message[]>(messagesKey(conversationId), (cached) => appendMessage(cached, reply));
  }, 2500);
  return message;
}
