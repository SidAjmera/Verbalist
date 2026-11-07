export type RoomRole = 'proposition' | 'opposition' | 'judge' | 'spectator';
export interface SharedRoom {
  id: string;
  owner_id: string;
  tournament_id: string | null;
  motion: string;
  status: 'lobby' | 'active' | 'paused' | 'completed' | 'cancelled';
  version: number;
  turn_count: number;
  preparation_seconds: number;
  speaking_seconds: number;
  clock_phase: 'idle' | 'preparation' | 'ready' | 'speaking' | 'expired';
  clock_remaining_ms: number;
  clock_started_at: string | null;
  forfeit_side: 'proposition' | 'opposition' | null;
  created_at: string;
  completed_at: string | null;
}
export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: RoomRole;
  alias: string;
  active: boolean;
  ready: boolean;
  voice_muted: boolean;
  ranking_consent: boolean;
}
export interface RoomTurn {
  id: string;
  room_id: string;
  author_id: string;
  side: 'proposition' | 'opposition';
  position: number;
  content: string;
  created_at: string;
}
export interface InvitationMeta {
  id: string;
  role: string;
  expires_at: string;
  uses: number;
  max_uses: number;
  revoked: boolean;
}
export interface RoomBallot {
  id: string;
  room_id: string;
  source_version: number;
  provider: string;
  model: string;
  simulated: boolean;
  rubric_version: string;
  created_at: string;
  payload: {
    proposition: Record<
      'reasoning' | 'evidence' | 'structure' | 'rebuttal',
      import('./index').SkillScore
    >;
    opposition: Record<
      'reasoning' | 'evidence' | 'structure' | 'rebuttal',
      import('./index').SkillScore
    >;
    decision: string;
    clashes: import('./index').Finding[];
    confidence: number;
    uncertainty: string;
    delivery: null;
  };
}
export interface RoomResult {
  id: string;
  winner: 'proposition' | 'opposition' | 'draw';
  reason: string;
  basis: 'manual' | 'ai_assisted';
  ranked: boolean;
  reviewer_id: string;
  created_at: string;
}
export interface RoomDetail {
  room: SharedRoom;
  self_id: string;
  server_time: string;
  members: RoomMember[];
  turns: RoomTurn[];
  draft: { draft: string; version: number };
  events: { id: string; action: string; reason: string; created_at: string; actor_id: string }[];
  ballot: RoomBallot | null;
  result: RoomResult | null;
  invites: InvitationMeta[];
}
export interface RoomPeer {
  user_id: string;
  connection_id: string;
  voice: boolean;
  muted: boolean;
}
export type RoomWireFrame =
  | { type: 'state'; version: number; peers: RoomPeer[] }
  | {
      type: 'signal';
      id: number;
      sender_id: string;
      sender_connection: string;
      kind: 'description' | 'candidate';
      payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
    }
  | { type: 'error' | 'signal_error'; detail: string; status?: number };
export interface IceConfiguration extends RTCConfiguration {
  relay_configured: boolean;
  expires_at: number;
}
export interface Tournament {
  id: string;
  owner_id: string;
  title: string;
  motion: string;
  host_alias: string;
  capacity: 2 | 4 | 8;
  status: 'lobby' | 'active' | 'completed' | 'cancelled';
  version: number;
  winner_id: string | null;
  created_at: string;
}
export interface TournamentDetail {
  tournament: Tournament;
  self_id: string;
  entries: { id: string; user_id: string; alias: string; joined_at: string }[];
  matches: {
    id: string;
    round: number;
    slot: number;
    proposition_id: string | null;
    opposition_id: string | null;
    winner_id: string | null;
    room_id: string | null;
    scheduled_at: string | null;
    result_id: string | null;
  }[];
  invites: InvitationMeta[];
}
export interface RankingProfile {
  id: string;
  user_id: string;
  handle: string;
  opted_in: boolean;
  version: number;
}
export interface Standing {
  rank: number;
  handle: string;
  points: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
}
