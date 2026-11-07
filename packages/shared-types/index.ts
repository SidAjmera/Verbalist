export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'compatible' | 'local' | 'mock';
export * from './multiplayer';
export type Side = 'proposition' | 'opposition';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type Persona = 'analyst' | 'socratic' | 'challenger';
export interface ProviderConfig {
  provider: ProviderId;
  model: string;
}
export interface ProviderInfo {
  id: ProviderId;
  name: string;
  enabled: boolean;
  requires_key: boolean;
  suggested_model: string;
  note: string;
  capabilities: {
    text: boolean;
    streaming: boolean;
    structured_output: boolean;
    speech_recognition: boolean;
    speech_synthesis: boolean;
    realtime_audio: boolean;
    context_tokens: number | null;
  };
}
export interface Preferences {
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  provider: ProviderId;
  model: string;
  difficulty: Difficulty;
  input_mode: 'text' | 'voice';
  output_mode: 'text' | 'voice' | 'both';
  speech_language: string;
  speech_rate: number;
  speech_voice: string;
  version: number;
}
export interface Profile {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  version: number;
  created_at: string;
}
export interface Turn {
  id: string;
  session_id: string;
  speaker: 'human' | 'ai';
  position: number;
  content: string;
  created_at: string;
  request_id: string;
}
export interface DebateSession {
  id: string;
  owner_id: string;
  motion: string;
  side: Side;
  difficulty: Difficulty;
  persona: Persona;
  format_id: 'quick';
  status: 'active' | 'paused' | 'completed';
  turn_count: number;
  max_turns: number;
  version: number;
  draft: string;
  draft_version: number;
  preparation_seconds: number;
  speaking_seconds: number;
  timed: boolean;
  clock_phase: 'idle' | 'preparation' | 'ready' | 'speaking' | 'expired';
  clock_remaining_ms: number;
  clock_started_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
export interface DebateDetail {
  session: DebateSession;
  turns: Turn[];
  server_time?: string;
}
export interface DashboardData {
  completed: number;
  active: number;
  total_turns: number;
  streak: number;
  practiced_formats: string[];
  recent: DebateSession[];
}
export interface Motion {
  id: string;
  category: string;
  text: string;
}
export interface DebateFormat {
  id: string;
  name: string;
  config: {
    rounds: number;
    speaking_order: string[];
    scoring: { rubric_version: 'quick-v1'; weights: Record<Skill, number>; delivery: false } | null;
    pause_allowed: boolean;
    max_turns: number;
  };
}
export function nextSpeaker(session: Pick<DebateSession, 'side' | 'turn_count'>): 'human' | 'ai' {
  return (session.turn_count % 2 === 0) === (session.side === 'proposition') ? 'human' : 'ai';
}

export const SKILLS = ['reasoning', 'evidence', 'structure', 'rebuttal'] as const;
export type Skill = (typeof SKILLS)[number];
export interface TranscriptReference {
  position: number;
  quote: string;
  start: number;
  end: number;
}
export interface ArgumentData {
  key: string;
  kind:
    | 'claim'
    | 'evidence'
    | 'reasoning'
    | 'counterargument'
    | 'rebuttal'
    | 'concession'
    | 'contradiction'
    | 'unanswered'
    | 'potential_fallacy';
  speaker: 'human' | 'ai';
  text: string;
  explanation: string;
  confidence: number;
  ref: TranscriptReference;
}
export interface ArgumentNode {
  id: string;
  ordinal: number;
  data: ArgumentData;
}
export interface ArgumentLink {
  id: string;
  source_id: string;
  target_id: string;
  relation: 'supports' | 'rebuts' | 'contradicts' | 'concedes' | 'answers';
  explanation: string;
  confidence: number;
}
export interface Finding {
  text: string;
  ref: TranscriptReference;
}
export interface SkillScore {
  score: number;
  rationale: string;
  ref: TranscriptReference;
}
export interface Ballot {
  human: Record<Skill, SkillScore>;
  ai: Record<Skill, SkillScore>;
  human_total: number;
  ai_total: number;
  winner: 'human' | 'ai' | 'draw';
  decision: string;
  clashes: Finding[];
  confidence: number;
  uncertainty: string;
  delivery: null;
}
export interface CoachingAction {
  skill: Skill;
  explanation: string;
  rewrite: string;
  drill_id: string;
  ref: TranscriptReference;
}
export interface CoachingReport {
  summary: string;
  strengths: Finding[];
  weaknesses: Finding[];
  actions: CoachingAction[];
}
export interface FactualClaim {
  id: string;
  data: { text: string; uncertainty: string; ref: TranscriptReference };
  status: 'verified' | 'disputed' | 'unverified';
  assessment: string;
  version: number;
  checked_at: string | null;
  research_model: string | null;
}
export interface EvidenceSource {
  id: string;
  claim_id: string;
  url: string;
  title: string;
  retrieved_at: string;
}
export interface AnalysisDetail {
  run: {
    id: string;
    session_id: string;
    session_version: number;
    provider: ProviderId;
    model: string;
    simulated: boolean;
    summary: string;
    uncertainty: string;
    rubric_version: 'quick-v1';
    created_at: string;
  };
  arguments: ArgumentNode[];
  links: ArgumentLink[];
  claims: FactualClaim[];
  sources: EvidenceSource[];
  ballot: Ballot | null;
  coach: CoachingReport;
}
export interface Drill {
  id: string;
  title: string;
  skill: Skill;
  prompt: string;
  criteria: string[];
  version: string;
}
export interface DrillFeedback {
  summary: string;
  criteria: { score: number; explanation: string; quote: string }[];
  improvement: string;
}
export interface DrillAttempt {
  id: string;
  drill_id: string;
  request_id: string;
  response: string;
  feedback: DrillFeedback;
  score: number;
  provider: ProviderId;
  model: string;
  simulated: boolean;
  created_at: string;
  rubric_version: string;
}
export interface Achievement {
  id: string;
  code: 'first_debate' | 'three_debates' | 'first_review' | 'first_drill';
  earned_at: string;
}
export interface LearningProgress {
  evaluated: number;
  drill_count: number;
  simulated_reviews: number;
  skills: Partial<Record<Skill, number>>;
  achievements: Achievement[];
  trend: {
    id: string;
    session_id: string;
    completed_at: string;
    human_total: number;
    model: string;
    provider: ProviderId;
    rubric_version: string;
    skills: Record<Skill, SkillScore>;
  }[];
}
