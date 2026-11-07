export interface MUNCatalog {
  committees: { id: string; name: string; agenda: string }[];
  countries: { code: string; name: string }[];
  procedure_version: string;
  procedure: string;
}
export interface MUNCommittee {
  id: string;
  committee_key: string;
  agenda: string;
  procedure_version: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  stage: 'opening' | 'caucus' | 'negotiation';
  topic: string;
  current_ordinal: number;
  target_ordinal: number | null;
  message_count: number;
  version: number;
  created_at: string;
}
export interface MUNDelegate {
  id: string;
  ordinal: number;
  role: 'human' | 'ai';
  country_code: string;
  country_name: string;
  brief: string;
  sources: string[];
}
export interface MUNMessage {
  id: string;
  delegate_id: string;
  position: number;
  stage: string;
  topic: string;
  content: string;
  request_id: string;
  provider: string | null;
  model: string | null;
  simulated: boolean;
  created_at: string;
}
export interface MUNDetail {
  committee: MUNCommittee;
  delegates: MUNDelegate[];
  messages: MUNMessage[];
  draft: { draft: string; version: number };
}
