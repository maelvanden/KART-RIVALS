// Mode démo : coéquipiers, écurie et Radio Paddock avec des données d'exemple (mêmes règles que le SQL).
import { demoProfile } from '@/lib/demo';
import type { Conversation, Friendship, Message, PilotSummary, Team, TeamApplication, TeamInvite, TeamSummary } from '@/types/models';

const MINUTE = 60_000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MINUTE).toISOString();

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
      { id: 'm1', conversation_id: 'conv-team', sender_id: 'p3', body: 'Session à SpeedPark samedi 14h, qui est chaud ?', created_at: ago(180) },
      { id: 'm2', conversation_id: 'conv-team', sender_id: 'p1', body: 'Présente ! Objectif : passer sous les 47 secondes 🔥', created_at: ago(170) },
      { id: 'm3', conversation_id: 'conv-team', sender_id: demoProfile.id, body: 'Go, je réserve 3 karts.', created_at: ago(160) },
      { id: 'm4', conversation_id: 'conv-team', sender_id: 'p3', body: 'Radio check : briefing 13h45 au paddock.', created_at: ago(12) },
    ],
    'conv-p1': [
      { id: 'm5', conversation_id: 'conv-p1', sender_id: 'p1', body: 'Revanche quand tu veux 😏', created_at: ago(300) },
    ],
  } as Record<string, Message[]>,
  read: { 'conv-team': ago(100), 'conv-p1': ago(400) } as Record<string, string>,
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
      last_message: last?.body ?? null,
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
