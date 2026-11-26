import type { Connection } from "mongoose";
import { getExecutionRecordModel } from "./models/ExecutionRecord.js";
import { getOAuthTokenModel } from "./models/OAuthToken.js";
import { SentraSecurityError } from "./oobGate.js";
import { decryptToken } from "./tokenCrypto.js";
import type { PendingProposal } from "./types.js";

export interface ExecutionResult {
  executed: boolean;
  proposal_id: string;
  action_type: string;
  adapter: string;
  detail: string;
  external_id: string | null;
  executed_at: string;
}

export interface ExecutionAdapter {
  execute(proposal: PendingProposal): Promise<ExecutionResult>;
}

function assertApproved(proposal: PendingProposal): void {
  if (proposal.status !== "APPROVED") {
    throw new SentraSecurityError(
      `Refusing to execute unapproved proposal '${proposal.proposal_id}' (status: ${proposal.status}).`
    );
  }
}

export class LocalSandboxExecutionAdapter implements ExecutionAdapter {
  public readonly history: ExecutionResult[] = [];

  async execute(proposal: PendingProposal): Promise<ExecutionResult> {
    assertApproved(proposal);
    const result: ExecutionResult = {
      executed: true,
      proposal_id: proposal.proposal_id,
      action_type: proposal.action_type,
      adapter: "local-sandbox",
      detail: `Dispatched ${proposal.action_type}: ${proposal.summary}`,
      external_id: null,
      executed_at: new Date().toISOString(),
    };
    this.history.push(result);
    return result;
  }
}

export class GoogleCalendarAdapter implements ExecutionAdapter {
  private readonly fetchImpl: typeof fetch;
  private readonly getToken: () => string | undefined;

  constructor(options?: {
    fetchImpl?: typeof fetch;
    getToken?: () => string | undefined;
  }) {
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.getToken = options?.getToken ?? (() => process.env.GOOGLE_ACCESS_TOKEN?.trim());
  }

  async execute(proposal: PendingProposal): Promise<ExecutionResult> {
    assertApproved(proposal);
    const token = this.getToken();
    if (!token) {
      throw new Error("GOOGLE_ACCESS_TOKEN is not configured");
    }

    const startIso = new Date(Date.now() + 3600_000).toISOString();
    const endIso = new Date(Date.now() + 7200_000).toISOString();
    const res = await this.fetchImpl(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: proposal.summary,
          description: `Sentra approved (${proposal.proposal_id}): ${JSON.stringify(proposal.diff_preview)}`,
          start: { dateTime: startIso },
          end: { dateTime: endIso },
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Google Calendar API returned HTTP ${res.status}`);
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return {
      executed: true,
      proposal_id: proposal.proposal_id,
      action_type: proposal.action_type,
      adapter: "google-calendar",
      detail: `Created Google Calendar event for ${proposal.summary}`,
      external_id: json.id ?? null,
      executed_at: new Date().toISOString(),
    };
  }
}

export class GmailAdapter implements ExecutionAdapter {
  private readonly fetchImpl: typeof fetch;
  private readonly getToken: () => string | undefined;

  constructor(options?: {
    fetchImpl?: typeof fetch;
    getToken?: () => string | undefined;
  }) {
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.getToken =
      options?.getToken ??
      (() =>
        process.env.GMAIL_ACCESS_TOKEN?.trim() ||
        process.env.GOOGLE_ACCESS_TOKEN?.trim());
  }

  async execute(proposal: PendingProposal): Promise<ExecutionResult> {
    assertApproved(proposal);
    const token = this.getToken();
    if (!token) {
      throw new Error("GMAIL_ACCESS_TOKEN is not configured");
    }

    const diff = proposal.diff_preview as {
      recipient?: string;
      subject?: string;
      body_snippet?: string;
    };
    const to = diff.recipient ?? "unknown@example.com";
    const subject = diff.subject ?? proposal.summary;
    const body = diff.body_snippet ?? proposal.summary;
    const rawMime = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ].join("\r\n");
    const encoded = Buffer.from(rawMime, "utf8").toString("base64url");

    const res = await this.fetchImpl(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encoded }),
      }
    );

    if (!res.ok) {
      throw new Error(`Gmail API returned HTTP ${res.status}`);
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return {
      executed: true,
      proposal_id: proposal.proposal_id,
      action_type: proposal.action_type,
      adapter: "gmail",
      detail: `Sent email to ${to} via Gmail`,
      external_id: json.id ?? null,
      executed_at: new Date().toISOString(),
    };
  }
}

export class CompositeExecutionAdapter implements ExecutionAdapter {
  private readonly calendar: GoogleCalendarAdapter;
  private readonly mail: GmailAdapter;
  private readonly fallback: LocalSandboxExecutionAdapter;
  private readonly conn: Connection | null;
  private readonly tokenEncryptionKey: string;
  private readonly liveGoogleWrites: boolean;

  constructor(options?: {
    conn?: Connection | null;
    calendar?: GoogleCalendarAdapter;
    mail?: GmailAdapter;
    fallback?: LocalSandboxExecutionAdapter;
    tokenEncryptionKey?: string;
    liveGoogleWrites?: boolean;
  }) {
    this.conn = options?.conn ?? null;
    this.calendar = options?.calendar ?? new GoogleCalendarAdapter();
    this.mail = options?.mail ?? new GmailAdapter();
    this.fallback = options?.fallback ?? new LocalSandboxExecutionAdapter();
    this.tokenEncryptionKey =
      options?.tokenEncryptionKey ??
      process.env.SENTRA_TOKEN_KEY?.trim() ??
      process.env.SENTRA_TOKEN_ENCRYPTION_KEY?.trim() ??
      "sentra-dev-token-encryption-key-0123456789";
    this.liveGoogleWrites =
      options?.liveGoogleWrites ??
      (process.env.SENTRA_ENABLE_LIVE_EXECUTION === "true" ||
        process.env.SENTRA_LIVE_GOOGLE_WRITES === "true");
  }

  private async resolveOAuthToken(): Promise<string | undefined> {
    if (!this.conn || this.conn.readyState !== 1) return undefined;
    const doc = await getOAuthTokenModel(this.conn).findById("google").lean();
    if (!doc?.access_token) return undefined;
    if (doc.expires_at && Date.now() >= doc.expires_at) return undefined;
    return decryptToken(doc.access_token, this.tokenEncryptionKey);
  }

  async execute(proposal: PendingProposal): Promise<ExecutionResult> {
    assertApproved(proposal);
    let result: ExecutionResult;

    const isCalendar =
      proposal.action_type === "create_event" ||
      proposal.action_type === "update_calendar" ||
      proposal.action_type === "delete_event";
    const isMail = proposal.action_type === "send_email";

    const envCalendarToken = process.env.GOOGLE_ACCESS_TOKEN?.trim();
    const envMailToken =
      process.env.GMAIL_ACCESS_TOKEN?.trim() || process.env.GOOGLE_ACCESS_TOKEN?.trim();

    if (!this.liveGoogleWrites) {
      result = await this.fallback.execute(proposal);
    } else if (isCalendar && envCalendarToken) {
      result = await this.calendar.execute(proposal);
    } else if (isMail && envMailToken) {
      result = await this.mail.execute(proposal);
    } else if (isCalendar || isMail) {
      const dbToken = await this.resolveOAuthToken();
      if (dbToken && isCalendar) {
        result = await new GoogleCalendarAdapter({ getToken: () => dbToken }).execute(proposal);
      } else if (dbToken && isMail) {
        result = await new GmailAdapter({ getToken: () => dbToken }).execute(proposal);
      } else {
        result = await this.fallback.execute(proposal);
      }
    } else {
      result = await this.fallback.execute(proposal);
    }

    if (this.conn && this.conn.readyState === 1) {
      const ExecutionRecord = getExecutionRecordModel(this.conn);
      await ExecutionRecord.findOneAndUpdate(
        { proposal_id: result.proposal_id },
        { $set: result },
        { upsert: true, new: true }
      );
    }

    return result;
  }
}
