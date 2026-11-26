import crypto from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AuditLedger,
  connect,
  disconnect,
  getApiKeyModel,
  getAuditEntryModel,
  getConsumedKeyModel,
  getExecutionRecordModel,
  getOAuthTokenModel,
  getProposalModel,
  getQuarantineItemModel,
  getSourceModel,
  encryptToken,
  syncAllIndexes,
} from "@sentra/core";
import { createApp } from "../src/app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SENTRA_ROOT = path.resolve(__dirname, "..", "..", "..");

describe("Sentra Express API + Auth + E2E", () => {
  let mongod: MongoMemoryServer;
  let mongoUri = "";
  let password = "";
  let mcpToken = "";
  let authConfig: {
    approverPassword: string;
    sessionSecret: string;
    mcpToken: string;
    tokenEncryptionKey: string;
    liveGoogleWrites: boolean;
    isProduction: boolean;
  };

  beforeAll(async () => {
    password = process.env.TEST_APPROVER_PASSWORD || crypto.randomBytes(16).toString("hex");
    const sessionSecret =
      process.env.TEST_SESSION_SECRET || crypto.randomBytes(24).toString("hex");
    mcpToken = process.env.TEST_MCP_TOKEN || crypto.randomBytes(16).toString("hex");
    const tokenEncryptionKey =
      process.env.TEST_TOKEN_ENC_KEY || crypto.randomBytes(24).toString("hex");
    authConfig = {
      approverPassword: password,
      sessionSecret,
      mcpToken,
      tokenEncryptionKey,
      liveGoogleWrites: false,
      isProduction: false,
    };

    mongod = await MongoMemoryServer.create();
    mongoUri = mongod.getUri();
    await connect(mongoUri);
    await syncAllIndexes();
  });

  afterAll(async () => {
    await disconnect();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      getSourceModel().deleteMany({}),
      getProposalModel().deleteMany({}),
      getConsumedKeyModel().deleteMany({}),
      getApiKeyModel().deleteMany({}),
      getAuditEntryModel().deleteMany({}),
      getQuarantineItemModel().deleteMany({}),
      getExecutionRecordModel().deleteMany({}),
    ]);
  });

  it("enforces session (401), CSRF (403), and records approver id on approve", async () => {
    const { app } = await createApp({ authConfig });
    const agent = request.agent(app);

    // 1. Approve without session -> 401
    const noSess = await agent.post("/api/proposals/P1/approve");
    expect(noSess.status).toBe(401);

    // 2. Login
    const loginRes = await agent.post("/api/login").send({ password });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.ok).toBe(true);
    const csrf = loginRes.body.csrf as string;
    expect(csrf).toBeTruthy();

    // 3. Session without CSRF header -> 403
    const noCsrf = await agent.post("/api/proposals/P1/approve");
    expect(noCsrf.status).toBe(403);

    // 4. Session + CSRF -> 200
    const ok = await agent
      .post("/api/proposals/P1/approve")
      .set("X-Sentra-CSRF", csrf);
    expect(ok.status).toBe(200);
    expect(ok.body.audit.actor).toBe("local-approver");
    expect(ok.body.audit.text).toContain("approved P1 at ");
  });

  it("returns 403 for LOW-trust MCP proposal and writes a blocked audit entry", async () => {
    const { app, taintTracker, oobGate, auditLedger } = await createApp({ authConfig });
    const agent = request.agent(app);
    const loginRes = await agent.post("/api/login").send({ password });
    const csrf = loginRes.body.csrf as string;

    await taintTracker.registerSource("SRC_MCP_LOW", "email", "LOW", "evil@stranger.xyz");
    await oobGate.stageProposal("PROP_LOW_API", "pay", "Wire 5000", {}, "SRC_MCP_LOW");

    const res = await agent
      .post("/api/proposals/PROP_LOW_API/approve")
      .set("X-Sentra-CSRF", csrf);
    expect(res.status).toBe(403);

    const entries = await auditLedger.listEntries();
    expect(entries.some((e) => e.denied && e.text.includes("BLOCKED PROP_LOW_API"))).toBe(true);
  });

  it("returns 409 on replay and 409 on approving a rejected proposal without burning key", async () => {
    const { app, oobGate } = await createApp({ authConfig });
    const agent = request.agent(app);
    const loginRes = await agent.post("/api/login").send({ password });
    const csrf = loginRes.body.csrf as string;

    // Approve P1 then replay
    const ok = await agent.post("/api/proposals/P1/approve").set("X-Sentra-CSRF", csrf);
    expect(ok.status).toBe(200);
    const replay = await agent.post("/api/proposals/P1/approve").set("X-Sentra-CSRF", csrf);
    expect(replay.status).toBe(409);

    // Reject P2 then try to approve -> 409 and key not burned
    const rej = await agent.post("/api/proposals/P2/reject").set("X-Sentra-CSRF", csrf);
    expect(rej.status).toBe(200);

    const afterRej = await agent
      .post("/api/proposals/P2/approve")
      .set("X-Sentra-CSRF", csrf);
    expect(afterRej.status).toBe(409);

    const directConsume = await oobGate.consume("UNUSED_KEY_AFTER_REJ", "P2");
    expect(directConsume.ok).toBe(false);
    expect(await getConsumedKeyModel().findById("UNUSED_KEY_AFTER_REJ").lean()).toBeNull();

    // Key was NOT burned by the rejected proposal, so it can still be used on a valid PENDING proposal (P3 is LOW, stage P4 FULL)
    await oobGate.stageProposal("P4_VALID", "create_event", "Valid follow-up", {}, "SRC_P1");
    const reuseConsume = await oobGate.consume("UNUSED_KEY_AFTER_REJ", "P4_VALID");
    expect(reuseConsume.ok).toBe(true);
  });

  it("GET /api/state never exposes tokens or secrets", async () => {
    const { app } = await createApp({ authConfig });
    const res = await request(app).get("/api/state");
    expect(res.status).toBe(200);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain(authConfig.approverPassword);
    expect(bodyStr).not.toContain(authConfig.sessionSecret);
    expect(bodyStr).not.toContain("csrf");
    expect(bodyStr).not.toContain("sentra_session");
  });

  it("returns 401 on wrong password and rate-limits after repeated failures", async () => {
    const { app } = await createApp({ authConfig });
    for (let i = 0; i < 5; i += 1) {
      const r = await request(app).post("/api/login").send({ password: "wrong-password" });
      expect(r.status).toBe(401);
    }
    const limited = await request(app).post("/api/login").send({ password: "wrong-password" });
    expect(limited.status).toBe(429);
  });

  it("end-to-end: MCP stages proposal, API shows source:'mcp', session+CSRF approves, chain verifies", async () => {
    const { app } = await createApp({ authConfig });
    const mcpDist = path.join(SENTRA_ROOT, "apps", "mcp", "dist", "server.js");

    const stagedId = await new Promise<string>((resolve, reject) => {
      const proc = spawn("node", [mcpDist], {
        env: { ...process.env, MONGODB_URI: mongoUri, SENTRA_UI_URL: "http://127.0.0.1:8001" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let buf = "";
      proc.stdout.on("data", (chunk) => {
        buf += chunk.toString();
        for (const line of buf.split("\n")) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.id === 2 && msg.result?.content?.[0]?.text) {
            const payload = JSON.parse(msg.result.content[0].text);
            proc.kill();
            resolve(payload.proposal_id);
          }
        }
      });
      proc.on("error", reject);
      proc.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "1.0" } },
        }) + "\n"
      );
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
      proc.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "propose_action",
            arguments: {
              action_type: "create_event",
              summary: "E2E MCP meeting",
              diff_preview: { after: "11:00" },
              source_id: "SRC_USER_CHAT",
            },
          },
        }) + "\n"
      );
    });

    const stateRes = await request(app).get("/api/state");
    expect(stateRes.status).toBe(200);
    const mcpProp = stateRes.body.proposals.find((p: { id: string }) => p.id === stagedId);
    expect(mcpProp).toBeDefined();
    expect(mcpProp.source).toBe("mcp");

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/login").send({ password });
    const csrf = loginRes.body.csrf as string;

    const appRes = await agent
      .post(`/api/proposals/${stagedId}/approve`)
      .set("X-Sentra-CSRF", csrf);
    expect(appRes.status).toBe(200);

    const ledger = new AuditLedger();
    expect(await ledger.verifyChain()).toBe(true);

    const verifyRes = await request(app).get("/api/audit/verify");
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.valid).toBe(true);
  });

  it("computes unapproved_writes_executed from real audit entries (0 on normal approve, >0 if unapproved write forced)", async () => {
    const { app, auditLedger } = await createApp({ authConfig });
    const agent = request.agent(app);
    const loginRes = await agent.post("/api/login").send({ password });
    const csrf = loginRes.body.csrf as string;

    await agent.post("/api/proposals/P1/approve").set("X-Sentra-CSRF", csrf);
    const stateNormal = await request(app).get("/api/state");
    expect(stateNormal.body.unapproved_writes_executed).toBe(0);

    await auditLedger.append("attacker", "write-without-token-executed", false);
    const stateBreached = await request(app).get("/api/state");
    expect(stateBreached.body.unapproved_writes_executed).toBe(1);
  });

  it("handles production trust proxy (X-Forwarded-For), /healthz, and JSON 404 on unknown /api/*", async () => {
    const { app } = await createApp({
      authConfig: { ...authConfig, isProduction: true },
    });
    expect(app.get("trust proxy")).toBe(1);

    const health = await request(app)
      .get("/healthz")
      .set("X-Forwarded-For", "203.0.113.42");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok", db: "connected" });

    const api404 = await request(app).get("/api/does-not-exist");
    expect(api404.status).toBe(404);
    expect(api404.headers["content-type"]).toContain("application/json");
    expect(api404.body.detail).toBe("API route not found");
  });

  it("requires session (401) on mint-and-execute, quarantine restore, selftest, and benchmark; and verifies audit chain via /api/audit/verify", async () => {
    const { app } = await createApp({ authConfig });

    const r1 = await request(app).post("/api/mint-and-execute?proposal_id=P1&idempotency_key=K1");
    expect(r1.status).toBe(401);

    const r2 = await request(app).post("/api/quarantine/Q1/restore");
    expect(r2.status).toBe(401);

    const r3 = await request(app).post("/api/selftest/write-without-token");
    expect(r3.status).toBe(401);

    const r4 = await request(app).get("/api/benchmark");
    expect(r4.status).toBe(401);

    const verifyRes = await request(app).get("/api/audit/verify");
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.valid).toBe(true);
    expect(verifyRes.body.firstBrokenIndex).toBeNull();
    expect(Array.isArray(verifyRes.body.entries)).toBe(true);
  });

  it("persists quarantine restore in MongoDB and returns 25-case benchmark when signed in", async () => {
    const { app } = await createApp({ authConfig });
    const agent = request.agent(app);

    const loginRes = await agent.post("/api/login").send({ password });
    expect(loginRes.status).toBe(200);
    const csrf = loginRes.body.csrf as string;

    const initialState = await agent.get("/api/state");
    expect(initialState.status).toBe(200);
    expect(initialState.body.quarantine.some((q: { id: string }) => q.id === "Q1")).toBe(true);

    const restoreRes = await agent
      .post("/api/quarantine/Q1/restore")
      .set("X-Sentra-CSRF", csrf);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.audit?.text).toContain("restored Q1 to inbox");

    const afterState = await agent.get("/api/state");
    expect(afterState.status).toBe(200);
    expect(afterState.body.quarantine.some((q: { id: string }) => q.id === "Q1")).toBe(false);

    const secondRestore = await agent
      .post("/api/quarantine/Q1/restore")
      .set("X-Sentra-CSRF", csrf);
    expect(secondRestore.status).toBe(404);

    const benchRes = await agent.get("/api/benchmark");
    expect(benchRes.status).toBe(200);
    expect(benchRes.body.total).toBe(25);
    expect(typeof benchRes.body.blocked).toBe("number");

    const approveRes = await agent
      .post("/api/proposals/P1/approve")
      .set("X-Sentra-CSRF", csrf);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.execution?.proposal_id).toBe("P1");
    expect(approveRes.body.execution?.executed).toBe(true);

    const stateAfterApprove = await agent.get("/api/state");
    expect(stateAfterApprove.status).toBe(200);
    expect(
      stateAfterApprove.body.executions.some(
        (ex: { proposal_id: string; adapter: string }) =>
          ex.proposal_id === "P1" && typeof ex.adapter === "string"
      )
    ).toBe(true);
  });

  it("enforces auth on Google OAuth endpoints and requires session on SSE /api/events", async () => {
    const { app } = await createApp({ authConfig });
    const agent = request.agent(app);

    const unauthStatus = await request(app).get("/api/oauth/google/status");
    expect(unauthStatus.status).toBe(401);

    const unauthEvents = await request(app).get("/api/events");
    expect(unauthEvents.status).toBe(401);

    const loginRes = await agent.post("/api/login").send({ password });
    expect(loginRes.status).toBe(200);
    const csrf = loginRes.body.csrf as string;
    const setCookie = loginRes.headers["set-cookie"]?.[0] ?? "";
    const sessionCookie = setCookie.split(";")[0];

    const statusRes = await agent.get("/api/oauth/google/status");
    expect(statusRes.status).toBe(200);
    expect(typeof statusRes.body.configured).toBe("boolean");
    expect(typeof statusRes.body.connected).toBe("boolean");
    expect(statusRes.body.live_writes).toBe(false);

    const startRes = await agent.get("/api/oauth/google/start");
    expect(startRes.status).toBe(503);

    const badCallback = await agent.get("/api/oauth/google/callback?code=abc&state=bad");
    expect(badCallback.status).toBe(400);

    const disconnectRes = await agent
      .post("/api/oauth/google/disconnect")
      .set("X-Sentra-CSRF", csrf);
    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.body.ok).toBe(true);

    // Verify SSE /api/events emits initial connected event with empty {} payload when authenticated
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const addr = server.address() as { port: number };
    try {
      const sseText = await new Promise<string>((resolve, reject) => {
        const req = http.get(
          `http://127.0.0.1:${addr.port}/api/events`,
          { agent: false, headers: { Cookie: sessionCookie } },
          (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers["content-type"]).toContain("text/event-stream");
            let buf = "";
            res.on("data", (chunk) => {
              buf += chunk.toString();
              if (buf.includes("event: connected")) {
                req.destroy();
                resolve(buf);
              }
            });
            res.on("error", reject);
          }
        );
        req.on("error", reject);
      });
      expect(sseText).toContain("event: connected\ndata: {}");
    } finally {
      server.closeAllConnections?.();
      server.close();
    }
  });

  it("protects /mcp with bearer token and Host/Origin DNS-rebinding checks", async () => {
    const { app } = await createApp({ authConfig });
    const body = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

    const noAuth = await request(app)
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream")
      .send(body);
    expect(noAuth.status).toBe(401);
    expect(noAuth.text).toBe("");

    const wrongAuth = await request(app)
      .post("/mcp")
      .set("Authorization", "Bearer wrong-token")
      .set("Accept", "application/json, text/event-stream")
      .send(body);
    expect(wrongAuth.status).toBe(401);
    expect(wrongAuth.text).toBe("");

    const badOrigin = await request(app)
      .post("/mcp")
      .set("Origin", "https://evil.example")
      .set("Authorization", `Bearer ${mcpToken}`)
      .set("Accept", "application/json, text/event-stream")
      .send(body);
    expect(badOrigin.status).toBe(403);

    const badHost = await request(app)
      .post("/mcp")
      .set("Host", "evil.example:8001")
      .set("Authorization", `Bearer ${mcpToken}`)
      .set("Accept", "application/json, text/event-stream")
      .send(body);
    expect(badHost.status).toBe(403);

    const mcpRes = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${mcpToken}`)
      .set("Accept", "application/json, text/event-stream")
      .send(body);
    expect(mcpRes.status).toBe(200);
    expect(mcpRes.text).toContain("propose_action");
    expect(mcpRes.text).toContain("detect_conflicts");
  });

  it("encrypts OAuth tokens in raw MongoDB collection, never leaks them, and toggles mode sandbox/live", async () => {
    const { app: sandboxApp } = await createApp({ authConfig });
    const sandboxState = await request(sandboxApp).get("/api/state");
    expect(sandboxState.status).toBe(200);
    expect(sandboxState.body.mode).toBe("sandbox");

    // Even with liveGoogleWrites=true, without a connected Google token mode stays sandbox
    const { app: liveNoTokenApp } = await createApp({
      authConfig: { ...authConfig, liveGoogleWrites: true },
    });
    const noTokenState = await request(liveNoTokenApp).get("/api/state");
    expect(noTokenState.status).toBe(200);
    expect(noTokenState.body.mode).toBe("sandbox");

    // Store encrypted OAuth token and verify raw MongoDB collection has no plaintext
    const plainAccess = "ya29.secret-access-token-plaintext";
    const plainRefresh = "1//secret-refresh-token-plaintext";
    await getOAuthTokenModel().findOneAndUpdate(
      { _id: "google" },
      {
        $set: {
          _id: "google",
          provider: "google",
          access_token: encryptToken(plainAccess, authConfig.tokenEncryptionKey),
          refresh_token: encryptToken(plainRefresh, authConfig.tokenEncryptionKey),
          expires_at: Date.now() + 3600_000,
          scope: "https://www.googleapis.com/auth/calendar.events",
          email: "approver@example.com",
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    const mongoose = (await import("mongoose")).default;
    const rawDoc = await mongoose.connection.db!
      .collection("oauth_tokens")
      .findOne({ _id: "google" as unknown as never });
    expect(rawDoc).not.toBeNull();
    expect(JSON.stringify(rawDoc)).not.toContain(plainAccess);
    expect(JSON.stringify(rawDoc)).not.toContain(plainRefresh);

    const liveAgent = request.agent(liveNoTokenApp);
    await liveAgent.post("/api/login").send({ password });

    const liveState = await liveAgent.get("/api/state");
    expect(liveState.status).toBe(200);
    expect(liveState.body.mode).toBe("live");
    expect(JSON.stringify(liveState.body)).not.toContain(plainAccess);
    expect(JSON.stringify(liveState.body)).not.toContain(plainRefresh);

    const oauthStatus = await liveAgent.get("/api/oauth/google/status");
    expect(oauthStatus.status).toBe(200);
    expect(oauthStatus.body.connected).toBe(true);
    expect(oauthStatus.body.live_writes).toBe(true);
    expect(JSON.stringify(oauthStatus.body)).not.toContain(plainAccess);
    expect(JSON.stringify(oauthStatus.body)).not.toContain(plainRefresh);

    await getOAuthTokenModel().deleteMany({});
  });

  it("creates hashed per-agent API keys, authenticates /mcp, and revokes cleanly", async () => {
    const { app } = await createApp({ authConfig });
    const agent = request.agent(app);

    const unauthList = await request(app).get("/api/keys");
    expect(unauthList.status).toBe(401);

    const loginRes = await agent.post("/api/login").send({ password });
    expect(loginRes.status).toBe(200);
    const csrf = loginRes.body.csrf as string;

    const createRes = await agent
      .post("/api/keys")
      .set("X-Sentra-CSRF", csrf)
      .send({ name: "Cursor Agent" });
    expect(createRes.status).toBe(201);
    const rawKey = createRes.body.key as string;
    const keyId = createRes.body.record.id as string;
    expect(rawKey.startsWith("sentra_live_")).toBe(true);

    // Raw MongoDB collection stores only SHA-256 key_hash, never rawKey
    const mongoose = (await import("mongoose")).default;
    const rawDoc = await mongoose.connection.db!
      .collection("api_keys")
      .findOne({ _id: keyId as unknown as never });
    expect(rawDoc).not.toBeNull();
    expect(JSON.stringify(rawDoc)).not.toContain(rawKey);
    expect(typeof rawDoc!.key_hash).toBe("string");

    // GET /api/keys never returns key_hash or rawKey
    const listRes = await agent.get("/api/keys");
    expect(listRes.status).toBe(200);
    expect(JSON.stringify(listRes.body)).not.toContain(rawKey);
    expect(JSON.stringify(listRes.body)).not.toContain(rawDoc!.key_hash);

    // /mcp accepts the per-agent key
    const mcpBody = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
    const mcpOk = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${rawKey}`)
      .set("Accept", "application/json, text/event-stream")
      .send(mcpBody);
    expect(mcpOk.status).toBe(200);
    expect(mcpOk.text).toContain("propose_action");

    // Revoke key -> /mcp immediately rejects with 401
    const revokeRes = await agent
      .delete(`/api/keys/${keyId}`)
      .set("X-Sentra-CSRF", csrf);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.ok).toBe(true);

    const mcpRevoked = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${rawKey}`)
      .set("Accept", "application/json, text/event-stream")
      .send(mcpBody);
    expect(mcpRevoked.status).toBe(401);
  });

  it("ingests a fishy email on /api/inbox/ingest, returns spoken_summary, and quarantines it", async () => {
    const { app } = await createApp({ authConfig });
    const agent = request.agent(app);

    const noSess = await request(app).post("/api/inbox/ingest").send({
      sender: "hr@internship-secure-portal.xyz",
      subject: "Urgent",
      body: "Send ID scan",
    });
    expect(noSess.status).toBe(401);

    const loginRes = await agent.post("/api/login").send({ password });
    const csrf = loginRes.body.csrf as string;

    const ingestRes = await agent
      .post("/api/inbox/ingest")
      .set("X-Sentra-CSRF", csrf)
      .send({
        sender: "hr@internship-secure-portal.xyz",
        subject: "Urgent internship confirmation",
        body: "Act within 2 hours. Reply with your national ID scan and registration fee.",
      });
    expect(ingestRes.status).toBe(200);
    expect(ingestRes.body.scan.risk_level).toBe("LIKELY_SCAM");
    expect(typeof ingestRes.body.scan.spoken_summary).toBe("string");
    expect(ingestRes.body.quarantined).toBe(true);

    const stateRes = await agent.get("/api/state");
    expect(
      stateRes.body.quarantine.some(
        (q: { id: string }) => q.id === ingestRes.body.quarantine_id
      )
    ).toBe(true);

    // /api/voice/speak requires session + CSRF, and returns 503 when ELEVENLABS_API_KEY is unset
    const unauthVoice = await request(app).post("/api/voice/speak").send({ text: "hello" });
    expect(unauthVoice.status).toBe(401);

    const noKeyVoice = await agent
      .post("/api/voice/speak")
      .set("X-Sentra-CSRF", csrf)
      .send({ text: ingestRes.body.scan.spoken_summary });
    expect(noKeyVoice.status).toBe(503);

    // /api/agent/ask requires session + CSRF, and returns 503 when GEMINI_API_KEY is unset
    const unauthAgent = await request(app).post("/api/agent/ask").send({ prompt: "Check conflicts" });
    expect(unauthAgent.status).toBe(401);

    const noKeyAgent = await agent
      .post("/api/agent/ask")
      .set("X-Sentra-CSRF", csrf)
      .send({ prompt: "Check conflicts" });
    expect(noKeyAgent.status).toBe(503);
  });
});
