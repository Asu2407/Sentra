export type TrustLevel = "FULL" | "MEDIUM" | "LOW";

export type ProposalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface DataProvenance {
  source_id: string;
  origin_type: string;
  trust_level: TrustLevel;
  sender: string | null;
  is_tainted: boolean;
  timestamp: number;
}

export interface PendingProposal {
  proposal_id: string;
  action_type: string;
  summary: string;
  diff_preview: Record<string, unknown>;
  source_id: string;
  created_at: number;
  expires_at: number;
  status: ProposalStatus;
}

export interface AuditEntryRecord {
  n: number;
  actor: string;
  text: string;
  hash: string;
  prev_hash: string;
  denied: boolean;
}

export interface AuditVerifyResult {
  valid: boolean;
  firstBrokenIndex: number | null;
}

export interface ScheduleConflict {
  conflict_type: string;
  severity: string;
  description: string;
  arithmetic_proof: string;
  impacted_items: string[];
}

export type EmailRiskLevel = "SAFE" | "SUSPICIOUS" | "LIKELY_SCAM";

export interface EmailScanResult {
  sender: string;
  subject: string;
  risk_level: EmailRiskLevel;
  flags: string[];
  plain_warning: string;
  spoken_summary: string;
  action_recommended: string;
}

export interface OutboundEmailProposal {
  proposal_id: string;
  recipient: string;
  subject: string;
  body_preview: string;
  attachments: string[];
  source_email_sender: string;
  trust_level: TrustLevel;
  is_blocked: boolean;
  plain_reason: string;
  hold_seconds: number;
  created_at: number;
}
