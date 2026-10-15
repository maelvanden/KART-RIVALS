import type {
  Challenge,
  EloPoint,
  LeaderboardEntry,
  NearbyPilot,
  PilotMatch,
  Profile,
  Track,
  TrackDetails,
} from '@/types/models';

/**
 * Mode démo : `EXPO_PUBLIC_DEMO_MODE=true` court-circuite Supabase et affiche des données
 * d'exemple. Sert à prévisualiser l'interface sans compte ni réseau.
 */
export const isDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';

export const demoProfile: Profile = {
  id: 'demo-me',
  username: 'Mael_44',
  avatar_url: null,
  kart_number: 44,
  home_track_id: 't1',
  elo: 1286,
  rank: 'argent',
  wins: 14,
  losses: 9,
  draws: 1,
  matches_played: 24,
  is_discoverable: true,
  home_track: { id: 't1', name: 'SpeedPark Angers', city: 'Beaucouzé' },
};

const pilot = (id: string, username: string, elo: number, rank: Profile['rank']) => ({ id, username, elo, rank });

/** Les circuits réels de la migration 20261015000007_tracks_49.sql. */
export const demoTrackDetails: TrackDetails[] = [
  { id: 't1', name: 'SpeedPark Angers', city: 'Beaucouzé', address: 'Centre commercial L’Atoll, 1 avenue de l’Europe', postal_code: '49070', region: 'Maine-et-Loire', is_indoor: true, length_m: 300, kart_power: '270cc', is_verified: true, lat: 47.4846, lng: -0.6201 },
  { id: 't2', name: 'MK Racing', city: 'Saint-Christophe-du-Bois', address: 'La Malmongère', postal_code: '49280', region: 'Maine-et-Loire', is_indoor: false, length_m: 816, kart_power: '270cc', is_verified: true, lat: 47.0164, lng: -0.9416 },
  { id: 't3', name: 'Inwall Kart', city: 'Les Ponts-de-Cé', address: '17 Rue Joseph Cugnot', postal_code: '49130', region: 'Maine-et-Loire', is_indoor: true, length_m: 600, kart_power: '270cc', is_verified: true, lat: 47.4177, lng: -0.5415 },
  { id: 't4', name: 'L’Autre Usine', city: 'Cholet', address: '88 rue Bourgneuf', postal_code: '49300', region: 'Maine-et-Loire', is_indoor: true, length_m: 400, kart_power: 'Électrique RTX', is_verified: true, lat: 47.0579, lng: -0.8586 },
  { id: 't5', name: 'Karting de Loudun', city: 'Bournand', address: 'Route de Saumur (RD 147)', postal_code: '86120', region: 'Vienne', is_indoor: false, length_m: 1150, kart_power: '270 / 390cc', is_verified: true, lat: 47.0873, lng: 0.0841 },
];

export const demoTracks: Track[] = demoTrackDetails.map(({ id, name, city }) => ({ id, name, city }));

/** Copie modifiable : en mode démo, les actions (défier, accepter, valider…) la mettent à jour. */
export const demoChallenges: Challenge[] = [
  {
    id: 'c1',
    challenger_id: 'p1',
    opponent_id: 'demo-me',
    status: 'pending',
    format: 'position',
    scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    message: 'Revanche samedi ? 🏁',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    challenger: pilot('p1', 'TurboLéa', 1342, 'argent'),
    opponent: pilot('demo-me', 'Mael_44', 1286, 'argent'),
    track: { id: 't1', name: 'SpeedPark Angers', city: 'Beaucouzé' },
    match: null,
  },
  {
    id: 'c2',
    challenger_id: 'demo-me',
    opponent_id: 'p2',
    status: 'accepted',
    format: 'lap_time',
    scheduled_at: new Date(Date.now() + 5 * 86400000).toISOString(),
    message: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    challenger: pilot('demo-me', 'Mael_44', 1286, 'argent'),
    opponent: pilot('p2', 'Drift_Max', 1198, 'bronze'),
    track: { id: 't2', name: 'MK Racing', city: 'Saint-Christophe-du-Bois' },
    match: null,
  },
  {
    id: 'c3',
    challenger_id: 'p3',
    opponent_id: 'demo-me',
    status: 'accepted',
    format: 'position',
    scheduled_at: new Date(Date.now() - 86400000).toISOString(),
    message: null,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    expires_at: new Date().toISOString(),
    challenger: pilot('p3', 'ApexHunter', 1467, 'or'),
    opponent: pilot('demo-me', 'Mael_44', 1286, 'argent'),
    track: { id: 't1', name: 'SpeedPark Angers', city: 'Beaucouzé' },
    match: {
      id: 'm3',
      submitted_by: 'p3',
      status: 'awaiting_confirmation',
      winner_id: 'demo-me',
      challenger_position: 2,
      opponent_position: 1,
      challenger_best_lap_ms: null,
      opponent_best_lap_ms: null,
      challenger_confirmed_at: new Date().toISOString(),
      opponent_confirmed_at: null,
      dispute_reason: null,
    },
  },
];

export const demoNearby: NearbyPilot[] = [
  { id: 'p1', username: 'TurboLéa', avatar_url: null, elo: 1342, rank: 'argent', wins: 18, losses: 7, distance_km: 2.4 },
  { id: 'p2', username: 'Drift_Max', avatar_url: null, elo: 1198, rank: 'bronze', wins: 9, losses: 11, distance_km: 4.1 },
  { id: 'p3', username: 'ApexHunter', avatar_url: null, elo: 1467, rank: 'or', wins: 26, losses: 8, distance_km: 7.8 },
  { id: 'p4', username: 'KartiNono', avatar_url: null, elo: 1040, rank: 'novice', wins: 2, losses: 3, distance_km: 12.5 },
];

export const demoLeaderboard: LeaderboardEntry[] = [
  { id: 'p5', username: 'Senna_Jr', avatar_url: null, elo: 1892, rank: 'legende', wins: 61, losses: 12, position: 1 },
  { id: 'p6', username: 'LateBraker', avatar_url: null, elo: 1734, rank: 'diamant', wins: 44, losses: 15, position: 2 },
  { id: 'p7', username: 'RedLine', avatar_url: null, elo: 1611, rank: 'platine', wins: 38, losses: 17, position: 3 },
  { id: 'p3', username: 'ApexHunter', avatar_url: null, elo: 1467, rank: 'or', wins: 26, losses: 8, position: 4 },
  { id: 'p1', username: 'TurboLéa', avatar_url: null, elo: 1342, rank: 'argent', wins: 18, losses: 7, position: 5 },
  { id: 'demo-me', username: 'Mael_44', avatar_url: null, elo: 1286, rank: 'argent', wins: 14, losses: 9, position: 6 },
  { id: 'p2', username: 'Drift_Max', avatar_url: null, elo: 1198, rank: 'bronze', wins: 9, losses: 11, position: 7 },
];

// Écarts ≤ 24 points : K = 24 pour un pilote qui a plus de 10 matchs.
export const demoEloHistory: EloPoint[] = [1150, 1168, 1156, 1177, 1193, 1178, 1200, 1219, 1208, 1228, 1245, 1262, 1286].map(
  (elo, i, all) => ({
    elo_after: elo,
    delta: i === 0 ? 0 : elo - all[i - 1],
    created_at: new Date(Date.now() - (all.length - i) * 5 * 86400000).toISOString(),
  }),
);

/** Profil d'un autre pilote de démo, reconstitué depuis le classement et la liste « à proximité ». */
export function demoPilot(id: string): Profile | null {
  if (id === demoProfile.id) return demoProfile;
  const p = [...demoLeaderboard, ...demoNearby].find((x) => x.id === id);
  if (!p) return null;
  return {
    id: p.id,
    username: p.username,
    avatar_url: null,
    kart_number: (p.username.length * 7) % 99 + 1,
    home_track_id: null,
    elo: p.elo,
    rank: p.rank,
    wins: p.wins,
    losses: p.losses,
    draws: 0,
    matches_played: p.wins + p.losses,
    is_discoverable: true,
    home_track: null,
  };
}

/** Courbe ELO d'exemple qui se termine à l'ELO actuel du pilote. */
export function demoEloHistoryFor(profile: Profile): EloPoint[] {
  if (profile.id === demoProfile.id) return [...demoEloHistory];
  const shift = profile.elo - demoEloHistory[demoEloHistory.length - 1].elo_after;
  return demoEloHistory.map((p) => ({ ...p, elo_after: p.elo_after + shift }));
}

const rivals = ['TurboLéa', 'Drift_Max', 'ApexHunter', 'KartiNono', 'RedLine'];

/** Derniers matchs d'exemple, déduits de la courbe ELO (gain = victoire, perte = défaite). */
export function demoMatchesFor(profile: Profile): PilotMatch[] {
  const history = demoEloHistoryFor(profile).slice(1).reverse();
  const opponents = rivals.filter((r) => r !== profile.username);
  return history.slice(0, 6).map((p, i) => ({
    match_id: `dm-${profile.id}-${i}`,
    confirmed_at: p.created_at,
    opponent_id: [...demoNearby, ...demoLeaderboard].find((x) => x.username === opponents[i % opponents.length])?.id ?? 'p1',
    opponent_username: opponents[i % opponents.length],
    track_name: demoTracks[i % demoTracks.length].name,
    format: i % 3 === 0 ? 'lap_time' : 'position',
    outcome: p.delta > 0 ? 'win' : p.delta < 0 ? 'loss' : 'draw',
    elo_delta: p.delta,
  }));
}
