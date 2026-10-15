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
  race_count: number;
  race_wins: number;
  race_podiums: number;
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

export type HeadToHead = {
  my_wins: number;
  their_wins: number;
  draws: number;
  matches: number;
  elo_net: number;
  last_played_at: string | null;
  last_outcome: 'win' | 'loss' | 'draw' | null;
  last_track: string | null;
};

/** Statistiques brutes (pilot_badge_stats) à partir desquelles les badges sont calculés. */
export type BadgeStats = {
  matches: number;
  wins: number;
  best_streak: number;
  current_streak: number;
  tracks_raced: number;
  lap_time_matches: number;
  peak_elo: number;
  giant_kills: number;
  crowned_tracks: string[];
};

export type TrackLapRecord = {
  position: number;
  pilot_id: string;
  username: string;
  avatar_url: string | null;
  rank: RankTier;
  lap_ms: number;
  set_at: string;
};

export type PilotLapRecord = {
  track_id: string;
  track_name: string;
  lap_ms: number;
  set_at: string;
  position: number;
  pilots: number;
};

export type TrackRecord = { track_id: string; lap_ms: number; username: string };

export type RaceStatus = 'open' | 'awaiting_confirmation' | 'confirmed' | 'disputed' | 'cancelled';
export type RaceEntryStatus = 'invited' | 'accepted' | 'declined';

export type RaceEntry = {
  pilot_id: string;
  status: RaceEntryStatus;
  position: number | null;
  best_lap_ms: number | null;
  confirmed_at: string | null;
  pilot: Pick<Profile, 'id' | 'username' | 'avatar_url' | 'elo' | 'rank'>;
};

export type Race = {
  id: string;
  organizer_id: string;
  scheduled_at: string | null;
  format: RaceFormat;
  message: string | null;
  status: RaceStatus;
  submitted_at: string | null;
  confirmed_at: string | null;
  dispute_reason: string | null;
  created_at: string;
  track: Track;
  entries: RaceEntry[];
};

export type TimeAttackStatus = 'on_track' | 'validated' | 'dnf';

export type TimeAttackSession = {
  id: string;
  status: TimeAttackStatus;
  /** Heure du check-in, prise par le serveur. */
  check_in_at: string;
  /** check_in_at + 90 min : au-delà, la session passe en DNF. */
  deadline_at: string;
  /** Heure de session lue sur le ticket validé. */
  ticket_at: string | null;
  best_lap_ms: number | null;
  validated_at: string | null;
  rejection_count: number;
  last_rejection_code: string | null;
  last_rejected_ticket_at: string | null;
  dnf_at: string | null;
  elo_penalty: number | null;
  track: Track;
};
