export type RankTier = 'novice' | 'bronze' | 'argent' | 'or' | 'platine' | 'diamant' | 'legende';
export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'completed';
export type RaceFormat = 'position' | 'lap_time';

export type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  kart_number: number | null;
  home_track_id: string | null;
  elo: number;
  rank: RankTier;
  wins: number;
  losses: number;
  draws: number;
  matches_played: number;
  is_discoverable: boolean;
  home_track: Track | null;
};

export type Track = { id: string; name: string; city: string };

/** Circuit complet avec coordonnées (vue tracks_map). */
export type TrackDetails = Track & {
  address: string | null;
  postal_code: string | null;
  region: string | null;
  is_indoor: boolean;
  length_m: number | null;
  kart_power: string | null;
  is_verified: boolean;
  lat: number;
  lng: number;
};

export type TrackLeaderboardEntry = Pick<Profile, 'id' | 'username' | 'elo' | 'rank'> & {
  wins: number;
  matches: number;
};

export type PilotMatch = {
  match_id: string;
  confirmed_at: string;
  opponent_id: string;
  opponent_username: string;
  track_name: string;
  format: RaceFormat;
  outcome: 'win' | 'loss' | 'draw';
  elo_delta: number | null;
};

export type MatchStatus = 'awaiting_confirmation' | 'confirmed' | 'disputed';

export type Match = {
  id: string;
  submitted_by: string;
  status: MatchStatus;
  winner_id: string | null;
  challenger_position: number | null;
  opponent_position: number | null;
  challenger_best_lap_ms: number | null;
  opponent_best_lap_ms: number | null;
  challenger_confirmed_at: string | null;
  opponent_confirmed_at: string | null;
  dispute_reason: string | null;
};

export type Challenge = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: ChallengeStatus;
  format: RaceFormat;
  scheduled_at: string | null;
  message: string | null;
  created_at: string;
  expires_at: string;
  challenger: Pick<Profile, 'id' | 'username' | 'elo' | 'rank'>;
  opponent: Pick<Profile, 'id' | 'username' | 'elo' | 'rank'>;
  track: Track;
  match: Match | null;
};

export type NearbyPilot = Pick<Profile, 'id' | 'username' | 'avatar_url' | 'elo' | 'rank' | 'wins' | 'losses'> & {
  distance_km: number;
};

export type LeaderboardEntry = Pick<Profile, 'id' | 'username' | 'avatar_url' | 'elo' | 'rank' | 'wins' | 'losses'> & {
  position: number;
};

export type EloPoint = { delta: number; elo_after: number; created_at: string; match_id?: string };
