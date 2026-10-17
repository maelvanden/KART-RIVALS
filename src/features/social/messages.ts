import type { ImagePayload, Message, PollPayload, SharePayload } from '@/types/models';

/** Aperçu d'un message dans la liste des conversations (même règle que message_preview en SQL). */
export function messagePreview(m: Pick<Message, 'kind' | 'body' | 'payload' | 'hidden_at'>): string | null {
  if (m.hidden_at) return 'Message masqué';
  switch (m.kind) {
    case 'share':
      return `🏁 ${(m.payload as SharePayload | null)?.title ?? 'Partage'}`;
    case 'poll':
      return `📊 ${(m.payload as PollPayload | null)?.question ?? 'Sondage'}`;
    case 'image':
      return '📷 Photo';
    default:
      return m.body;
  }
}

export const asShare = (m: Message) => (m.kind === 'share' ? (m.payload as SharePayload) : null);
export const asPoll = (m: Message) => (m.kind === 'poll' ? (m.payload as PollPayload) : null);
export const asImage = (m: Message) => (m.kind === 'image' ? (m.payload as ImagePayload) : null);
