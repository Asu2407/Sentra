import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  CompositeExecutionAdapter,
  GmailAdapter,
  GoogleCalendarAdapter,
  SentraSecurityError,
  connect,
  decryptToken,
  disconnect,
  encryptToken,
  getExecutionRecordModel,
  syncAllIndexes,
} from "../src/index.js";

describe("Calendar & Mail Execution Adapters", () => {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await connect(mongod.getUri());
    await syncAllIndexes();
  });

  afterAll(async () => {
    await disconnect();
    if (mongod) await mongod.stop();
  });

  it("refuses to execute unapproved (PENDING or REJECTED) proposals", async () => {
    const adapter = new CompositeExecutionAdapter();
    await expect(
      adapter.execute({
        proposal_id: "P_PEND",
        action_type: "create_event",
        summary: "Unapproved event",
        diff_preview: {},
        source_id: "SRC_P1",
        created_at: 100,
        expires_at: 400,
        status: "PENDING",
      })
    ).rejects.toThrow(SentraSecurityError);
  });

  it("dispatches approved calendar events to GoogleCalendarAdapter when token is present", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "gcal_evt_123" }), { status: 200 })
    );
    const cal = new GoogleCalendarAdapter({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getToken: () => "fake-google-token",
    });

    const res = await cal.execute({
      proposal_id: "P_CAL",
      action_type: "create_event",
      summary: "Leave for station at 06:10",
      diff_preview: { time: "06:10" },
      source_id: "SRC_P1",
      created_at: 100,
      expires_at: 400,
      status: "APPROVED",
    });

    expect(res.adapter).toBe("google-calendar");
    expect(res.external_id).toBe("gcal_evt_123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("googleapis.com/calendar/v3");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fake-google-token");
  });

  it("dispatches approved send_email proposals to GmailAdapter with base64url MIME", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "gmail_msg_456" }), { status: 200 })
    );
    const mail = new GmailAdapter({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getToken: () => "fake-gmail-token",
    });

    const res = await mail.execute({
      proposal_id: "P_MAIL",
      action_type: "send_email",
      summary: "Send Q3 notes",
      diff_preview: {
        recipient: "priya@acme.co",
        subject: "Q3 Notes",
        body_snippet: "Here are the notes.",
      },
      source_id: "SRC_P2",
      created_at: 100,
      expires_at: 400,
      status: "APPROVED",
    });

    expect(res.adapter).toBe("gmail");
    expect(res.external_id).toBe("gmail_msg_456");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { raw: string };
    const decoded = Buffer.from(body.raw, "base64url").toString("utf8");
    expect(decoded).toContain("To: priya@acme.co");
    expect(decoded).toContain("Subject: Q3 Notes");
  });

  it("persists executed writes to MongoDB executions collection via CompositeExecutionAdapter", async () => {
    const conn = (await import("mongoose")).default.connection;
    const adapter = new CompositeExecutionAdapter({ conn });

    const res = await adapter.execute({
      proposal_id: "P_PERSIST_1",
      action_type: "update_calendar",
      summary: "Shift breakfast to 05:20",
      diff_preview: {},
      source_id: "SRC_P1",
      created_at: 100,
      expires_at: 400,
      status: "APPROVED",
    });

    expect(res.adapter).toBe("local-sandbox");
    const doc = await getExecutionRecordModel(conn).findOne({ proposal_id: "P_PERSIST_1" }).lean();
    expect(doc).not.toBeNull();
    expect(doc!.action_type).toBe("update_calendar");
  });

  it("encrypts and decrypts OAuth tokens at rest using AES-256-GCM", () => {
    const key = "test-aes-256-gcm-key-32-chars-minimum";
    const secret = "ya29.test-google-oauth-token-value";
    const cipher = encryptToken(secret, key);

    expect(cipher.startsWith("v1:")).toBe(true);
    expect(cipher).not.toContain(secret);
    expect(decryptToken(cipher, key)).toBe(secret);
    expect(() => decryptToken(cipher, "wrong-encryption-key-0123456789")).toThrow();
  });
});
