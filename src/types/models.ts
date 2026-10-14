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
};

export type Track = { id: string; name: string; city: string };

export type Challenge = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: ChallengeStatus;
  format: RaceFormat;
  scheduled_at: string | null;
  message: string | null;
  created_at: string;
  challenger: Pick<Profile, 'id' | 'username' | 'elo' | 'rank'>;
  opponent: Pick<Profile, 'id' | 'username' | 'elo' | 'rank'>;
  track: Track;
};

export type NearbyPilot = Pick<Profile, 'id' | 'username' | 'avatar_url' | 'elo' | 'rank' | 'wins' | 'losses'> & {
  distance_km: number;
};

export type LeaderboardEntry = Pick<Profile, 'id' | 'username' | 'avatar_url' | 'elo' | 'rank' | 'wins' | 'losses'> & {
  position: number;
};

export type EloPoint = { delta: number; elo_after: number; created_at: string };
