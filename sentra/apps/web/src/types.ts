export interface ProposalView {
  id: string;
  no?: string;
  title: string;
  action?: string;
  source?: "demo" | "mcp";
  origin?: string;
  by?: string;
  trust?: "FULL" | "MEDIUM" | "LOW";
  src?: string;
  why?: string;
  scam?: boolean;
  diff?: string[];
  proof?: string[];
  warn?: string;
  status?: string;
  expires_at?: number | null;
}

export interface AuditEntryView {
  n: number;
  actor: string;
  text: string;
  hash: string;
  prev_hash: string;
  denied: boolean;
}

export interface QuarantineView {
  id: string;
  title: string;
  reason: string;
}

export interface ExecutionView {
  proposal_id: string;
  action_type: string;
  adapter: string;
  detail: string;
  external_id: string | null;
  executed_at: string;
}

export type SceneStage = "tray" | "agent" | "gate" | "vault" | "denied" | "blocked";
