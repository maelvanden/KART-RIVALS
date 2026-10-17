// Mode démo : coéquipiers, écurie et Radio Paddock avec des données d'exemple (mêmes règles que le SQL).
import { messagePreview } from '@/features/social/messages';
import { demoProfile } from '@/lib/demo';
import type { Conversation, Friendship, Message, PilotSummary, Team, TeamApplication, TeamInvite, TeamSummary } from '@/types/models';

const MINUTE = 60_000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MINUTE).toISOString();

const text = (id: string, conversationId: string, senderId: string, body: string, minutesAgo: number): Message => ({
  id,
  conversation_id: conversationId,
  sender_id: senderId,
  kind: 'text',
  body,
  payload: null,
  created_at: ago(minutesAgo),
  hidden_at: null,
});

export const demoPilots: Record<string, PilotSummary> = {
  p1: { id: 'p1', username: 'TurboLéa', avatar_url: null, elo: 1342, rank: 'argent' },
  p2: { id: 'p2', username: 'Drift_Max', avatar_url: null, elo: 1198, rank: 'bronze' },
  p3: { id: 'p3', username: 'ApexHunter', avatar_url: null, elo: 1467, rank: 'or' },
  p4: { id: 'p4', username: 'KartiNono', avatar_url: null, elo: 1040, rank: 'novice' },
};

export const me = (): PilotSummary => ({
  id: demoProfile.id,
  username: demoProfile.username,
  avatar_url: demoProfile.avatar_url,
  elo: demoProfile.elo,
  rank: demoProfile.rank,
});

export const demoSocial = {
  friendships: [
    { id: 'f1', status: 'accepted', outgoing: false, created_at: ago(9000), pilot: demoPilots.p1 },
    { id: 'f2', status: 'accepted', outgoing: true, created_at: ago(5000), pilot: demoPilots.p3 },
    { id: 'f3', status: 'pending', outgoing: false, created_at: ago(40), pilot: demoPilots.p2 },
  ] as Friendship[],
  team: {
    id: 'team-1',
    name: 'Volt Racing Angers',
    tag: 'VRA',
    logo_url: null,
    color: '#DEFF00',
    recruiting: true,
    recruiting_message: 'On roule tous les samedis à SpeedPark, niveau Argent minimum.',
    created_at: ago(20000),
    elo: 0,
    position: 3,
    conversation_id: 'conv-team',
    members: [
      { role: 'team_principal', joined_at: ago(20000), pilot: me() },
      { role: 'pilote_officiel', joined_at: ago(15000), pilot: demoPilots.p1 },
      { role: 'pilote_officiel', joined_at: ago(9000), pilot: demoPilots.p3 },
    ],
  } as Team | null,
  invites: [] as TeamInvite[],
  /** Autres écuries (annuaire et pages publiques). */
  directory: [
    { id: 'team-2', name: 'Apex Predators', tag: 'APX', logo_url: null, color: '#FF3B5C', recruiting: true, recruiting_message: 'Pilotes motivés pour les guerres d’écuries du dimanche.', elo: 1198, position: 0, member_count: 1 },
    { id: 'team-3', name: 'Kart Republic', tag: 'KRT', logo_url: null, color: '#22D3EE', recruiting: false, recruiting_message: null, elo: 1040, position: 0, member_count: 1 },
  ] as TeamSummary[],
  directoryMembers: { 'team-2': ['p2'], 'team-3': ['p4'] } as Record<string, string[]>,
  /** Candidatures (une candidature reçue par mon écurie). */
  applications: [
    {
      id: 'app-1',
      team_id: 'team-1',
      message: 'Je roule à SpeedPark chaque semaine, je cherche une écurie sérieuse 🏁',
      status: 'pending',
      created_at: ago(90),
      applicant: demoPilots.p4,
      team: { id: 'team-1', name: 'Volt Racing Angers', tag: 'VRA', logo_url: null, color: '#DEFF00' },
    },
  ] as TeamApplication[],
  sentInvites: [] as PilotSummary[],
  messages: {
    'conv-team': [
      text('m1', 'conv-team', 'p3', 'Session à SpeedPark samedi 14h, qui est chaud ?', 180),
      text('m2', 'conv-team', 'p1', 'Présente ! Objectif : passer sous les 47 secondes 🔥', 170),
      {
        id: 'm2b',
        conversation_id: 'conv-team',
        sender_id: 'p3',
        kind: 'poll',
        body: null,
        payload: { question: 'Prochaine session d’écurie ?', options: ['Samedi 14h', 'Dimanche 10h', 'Mercredi soir'] },
        created_at: ago(165),
      },
      text('m3', 'conv-team', demoProfile.id, 'Go, je réserve 3 karts.', 160),
      {
        id: 'm3b',
        conversation_id: 'conv-team',
        sender_id: 'p1',
        kind: 'share',
        body: null,
        payload: { type: 'lap_record', id: 't1', title: 'Record · SpeedPark Angers', subtitle: 'TurboLéa', highlight: '46.874' },
        created_at: ago(40),
      },
      text('m4', 'conv-team', 'p3', 'Radio check : briefing 13h45 au paddock.', 12),
    ],
    'conv-p1': [text('m5', 'conv-p1', 'p1', 'Revanche quand tu veux 😏', 300)],
  } as Record<string, Message[]>,
  /** Votes des sondages (id du message → id du pilote → option). */
  votes: { m2b: { p3: 0, p1: 0 } } as Record<string, Record<string, number>>,
  /** Message épinglé par conversation. */
  pinned: { 'conv-team': 'm2b' } as Record<string, string | null>,
  read: { 'conv-team': ago(100), 'conv-p1': ago(400) } as Record<string, string>,
  /** Jusqu'où chaque coéquipier a lu (« Vu »). */
  readers: {
    'conv-team': { p1: ago(5), p3: ago(11) },
    'conv-p1': { p1: ago(299) },
  } as Record<string, Record<string, string>>,
  /** Pilotes que j'ai bloqués. */
  blocks: [] as PilotSummary[],
};

/** Conversations de la démo (écurie + 1v1 existants). */
export function demoConversations(): Conversation[] {
  const list: Conversation[] = [];
  const t = demoSocial.team;
  for (const [id, messages] of Object.entries(demoSocial.messages)) {
    const last = messages.at(-1);
    const isTeam = id === 'conv-team';
    if (isTeam && !t) continue;
    const other = isTeam ? null : demoPilots[id.replace('conv-', '')];
    list.push({
      id,
      kind: isTeam ? 'team' : 'direct',
      team_id: isTeam ? t!.id : null,
      title: isTeam ? t!.name : (other?.username ?? 'Pilote'),
      tag: isTeam ? t!.tag : null,
      avatar_url: isTeam ? t!.logo_url : (other?.avatar_url ?? null),
      other_id: other?.id ?? null,
      last_message: last ? messagePreview(last) : null,
      last_message_at: last?.created_at ?? null,
      unread: messages.filter((m) => m.sender_id !== demoProfile.id && m.created_at > (demoSocial.read[id] ?? '')).length,
    });
  }
  return list.sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
}

export function demoSender(id: string): PilotSummary | undefined {
  return id === demoProfile.id ? me() : demoPilots[id];
}

/** Réponse automatique d'un coéquipier, pour voir arriver un message « en direct ». */
export const demoReplies = ['Bien reçu 👍', 'Copy that, radio OK.', 'On se retrouve au paddock !', 'Pleins gaz 🏁'];
