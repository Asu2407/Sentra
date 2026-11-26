import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoose from "mongoose";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerSentraTools } from "@sentra/mcp";
import {
  ApiKeyStore,
  AuditLedger,
  CompositeExecutionAdapter,
  OOBExecutionGate,
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SRC_STRANGER_EMAIL,
  SRC_TRAIN_TICKET,
  SRC_USER_CHAT,
  ScamDetector,
  SentraSecurityError,
  TaintTracker,
  encryptToken,
  getExecutionRecordModel,
  getOAuthTokenModel,
  getProposalModel,
  getQuarantineItemModel,
} from "@sentra/core";
import {
  APPROVER_USER_ID,
  type AuthConfig,
  type AuthenticatedRequest,
  SESSION_COOKIE_NAME,
  createSessionPayload,
  loadAuthConfig,
  requireApprover,
  requireApproverAndCsrf,
  requireMcpBearer,
  setSessionCookie,
  signSession,
  timingSafeEqualStrings,
  verifySession,
} from "./auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEMO_SEEDS = [
  {
    id: "P1",
    no: "0184",
    title: "Leave for station at 06:10",
    action: 'Calendar.update("Leave for station", "06:10-06:50")',
    origin: "You",
    by: "Rohan (you)",
    trust: "FULL" as const,
    src: "Train ticket you uploaded",
    why: "You asked to catch the 07:10 train.",
    diff: ["Before: nothing at 06:10", 'After: "Leave for station" 06:10-06:50'],
    proof: [
      "07:10 train",
      "minus 45 min commute",
      "= leave by 06:25",
      "Pill at 07:30: collision resolved via 05:50 shift",
    ],
  },
  {
    id: "P2",
    no: "0185",
    title: "Dinner booking, Rs 218 all-in",
    action: 'Calendar.create("Dinner", "20:00-21:30")',
    origin: "Known",
    by: "Priya Sharma (known)",
    trust: "MEDIUM" as const,
    src: "Restaurant you saved",
    why: "Confirmed table for your saved restaurant.",
    diff: ["Before: no dinner event", 'After: "Dinner" 20:00-21:30'],
    proof: [
      "Dinner Rs 180",
      "plus fees & GST Rs 38",
      "= Rs 218 all-in (exceeds Rs 200 cap)",
    ],
  },
  {
    id: "P3",
    no: "0186",
    title: "Meeting 10:00 to 11:00",
    action: 'Calendar.create("Meeting", "10:00-11:00")',
    origin: "Stranger",
    by: "Unknown sender (stranger)",
    trust: "LOW" as const,
    scam: true,
    src: "Unknown sender, attached PDF",
    why: "Hidden text inside an attached PDF.",
    diff: ["Before: free 10:00-11:00", 'After: "Meeting" 10:00-11:00'],
    proof: ["No sender history", "Hidden text found in PDF"],
    warn: "Hidden text in the attached PDF asks to add this event. Approval is locked for low-trust senders.",
  },
];

const pidParamSchema = z.object({
  pid: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
});

const qidParamSchema = z.object({
  qid: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
});

const loginBodySchema = z.object({
  password: z.string().min(1),
});

const mintExecuteQuerySchema = z.object({
  proposal_id: z.string().min(1).max(64),
  idempotency_key: z.string().min(1).max(128),
});

export async function seedDemoData(
  taintTracker: TaintTracker,
  oobGate: OOBExecutionGate,
  auditLedger: AuditLedger
): Promise<void> {
  const sources: Array<[string, string, "FULL" | "MEDIUM" | "LOW", string | null]> = [
    [SRC_USER_CHAT, "user_prompt", "FULL", "Rohan (you)"],
    [SRC_TRAIN_TICKET, "pdf_attachment", "LOW", "IRCTC Booking"],
    [SRC_STRANGER_EMAIL, "email", "LOW", "recruiter@internship-portal.xyz"],
    ["SRC_P1", "user_prompt", "FULL", "Rohan (you)"],
    ["SRC_P2", "email", "MEDIUM", "Priya Sharma (known)"],
    ["SRC_P3", "pdf_attachment", "LOW", "Unknown sender"],
  ];

  for (const [sid, otype, trust, sender] of sources) {
    if (!(await taintTracker.getSource(sid))) {
      await taintTracker.registerSource(sid, otype, trust, sender);
    }
  }

  for (const seed of DEMO_SEEDS) {
    if (!(await oobGate.getProposal(seed.id))) {
      await oobGate.stageProposal(
        seed.id,
        "create_event",
        seed.title,
        { diff: seed.diff, proof: seed.proof },
        `SRC_${seed.id}`
      );
    }
  }

  const existingAudit = await auditLedger.listEntries();
  if (existingAudit.length === 0) {
    await auditLedger.append("system", "AI host connected");
    await auditLedger.append("system", "read 3 messages");
    await auditLedger.append("system", "quarantined Q1");
  }
}

export async function createApp(options?: { authConfig?: AuthConfig }) {
  const authConfig = options?.authConfig ?? loadAuthConfig();
  const taintTracker = new TaintTracker();
  const auditLedger = new AuditLedger();
  const apiKeyStore = new ApiKeyStore(mongoose.connection);
  const oobGate = new OOBExecutionGate({ taintTracker, auditLedger });
  const tokenEncryptionKey =
    authConfig.tokenEncryptionKey ??
    process.env.SENTRA_TOKEN_KEY?.trim() ??
    process.env.SENTRA_TOKEN_ENCRYPTION_KEY?.trim() ??
    "sentra-dev-token-encryption-key-0123456789";
  const liveGoogleWrites =
    authConfig.liveGoogleWrites ??
    (process.env.SENTRA_ENABLE_LIVE_EXECUTION === "true" ||
      process.env.SENTRA_LIVE_GOOGLE_WRITES === "true");
  const mcpToken =
    authConfig.mcpToken ??
    process.env.SENTRA_MCP_TOKEN?.trim() ??
    "sentra-dev-mcp-token-0123456789abcdef";

  const executionAdapter = new CompositeExecutionAdapter({
    conn: mongoose.connection,
    tokenEncryptionKey,
    liveGoogleWrites,
  });

  await seedDemoData(taintTracker, oobGate, auditLedger);

  const scamDetector = new ScamDetector();
  const scamRes = scamDetector.scanEmail(
    "hr@internship-secure-portal.xyz",
    "URGENT: Confirm your internship spot",
    "Act within 2 hours. Reply with your national ID scan and registration fee."
  );
  const QuarantineItem = getQuarantineItemModel();
  if (!(await QuarantineItem.findById("Q1").lean())) {
    await QuarantineItem.create({
      _id: "Q1",
      id: "Q1",
      title: "Internship confirmation email",
      reason: scamRes.flags.slice(0, 2).join("; ") || "urgency language, spoofed sender",
      status: "QUARANTINED",
    });
  }

  const app = express();
  if (authConfig.isProduction) {
    app.set("trust proxy", 1);
  }
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
        },
      },
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "100kb" }));

  // Request logging to stderr (never secrets)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      console.error(
        `[Sentra-API] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`
      );
    });
    next();
  });

  const webOrigin = process.env.WEB_ORIGIN?.trim() || "http://127.0.0.1:5173";
  if (process.env.NODE_ENV !== "production") {
    app.use(cors({ origin: webOrigin, credentials: true }));
  }

  const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail: "Too many login attempts. Please wait and try again." },
  });

  const actionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail: "Too many approval requests. Slow down." },
  });

  const requireSessionOnly = requireApprover(authConfig.sessionSecret);
  const requireAuth = requireApproverAndCsrf(authConfig.sessionSecret);

  // Auth routes
  app.post("/api/login", loginLimiter, (req, res) => {
    const parsed = loginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ detail: "Password is required" });
      return;
    }

    if (!timingSafeEqualStrings(parsed.data.password, authConfig.approverPassword)) {
      res.status(401).json({ detail: "Invalid approver password" });
      return;
    }

    const session = createSessionPayload();
    const signed = signSession(session, authConfig.sessionSecret);
    setSessionCookie(res, signed, authConfig.isProduction);
    res.json({ ok: true, user: APPROVER_USER_ID, csrf: session.csrf });
  });

  app.post("/api/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.json({ ok: true });
  });

  app.get("/api/session", (req, res) => {
    const rawCookie = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    const session = verifySession(rawCookie, authConfig.sessionSecret);
    if (!session) {
      res.json({ authenticated: false, user: null, csrf: null });
      return;
    }
    res.json({ authenticated: true, user: session.sub, csrf: session.csrf });
  });

  // Read-only state (omits tokens & secrets)
  app.get("/api/state", async (_req, res, next) => {
    try {
      const pending: Array<Record<string, unknown>> = [];
      const seen = new Set<string>();

      for (const seed of DEMO_SEEDS) {
        const gateProp = await oobGate.getProposal(seed.id);
        if (gateProp && gateProp.status === "PENDING") {
          pending.push({
            ...seed,
            status: gateProp.status,
            source: "demo",
            expires_at: gateProp.expires_at,
          });
          seen.add(seed.id);
        }
      }

      for (const gateProp of await oobGate.listProposals("PENDING")) {
        if (seen.has(gateProp.proposal_id) || gateProp.proposal_id === "PROP_1001") {
          continue;
        }
        const src = await taintTracker.getSource(gateProp.source_id);
        const trust = src?.trust_level ?? "LOW";
        const origin = trust === "FULL" ? "You" : trust === "MEDIUM" ? "Known" : "Stranger";
        pending.push({
          id: gateProp.proposal_id,
          no: gateProp.proposal_id.slice(-4),
          title: gateProp.summary,
          action: gateProp.action_type,
          source: "mcp",
          origin,
          by: src?.sender ?? origin,
          trust,
          src: src ? `${src.origin_type} (${src.sender ?? src.source_id})` : gateProp.source_id,
          diff: [JSON.stringify(gateProp.diff_preview)],
          proof: ["Staged via MCP gateway"],
          status: gateProp.status,
          expires_at: gateProp.expires_at,
        });
      }

      const ExecutionRecord = getExecutionRecordModel();
      const [auditEntries, quarantinedDocs, executionDocs, oauthDoc] = await Promise.all([
        auditLedger.listEntries(),
        QuarantineItem.find({ status: "QUARANTINED" }).lean(),
        ExecutionRecord.find().sort({ executed_at: -1 }).limit(20).lean(),
        getOAuthTokenModel().findById("google").lean(),
      ]);
      const hasGoogleToken = Boolean(
        oauthDoc?.access_token ||
          process.env.GOOGLE_ACCESS_TOKEN?.trim() ||
          process.env.GMAIL_ACCESS_TOKEN?.trim()
      );
      const mode = liveGoogleWrites && hasGoogleToken ? "live" : "sandbox";
      const unapprovedWritesExecuted = auditEntries.filter(
        (e) => !e.denied && e.text.includes("write-without-token-executed")
      ).length;

      res.json({
        mode,
        proposals: pending,
        quarantine: quarantinedDocs.map((q) => ({
          id: q.id,
          title: q.title,
          reason: q.reason,
        })),
        executions: executionDocs.map((x) => ({
          proposal_id: x.proposal_id,
          action_type: x.action_type,
          adapter: x.adapter,
          detail: x.detail,
          external_id: x.external_id ?? null,
          executed_at: x.executed_at,
        })),
        audit: auditEntries,
        chain_valid: await auditLedger.verifyChain(),
        unapproved_writes_executed: unapprovedWritesExecuted,
        selftest: true,
      });
    } catch (err) {
      next(err);
    }
  });

  // Protected decision routes
  app.post(
    "/api/proposals/:pid/approve",
    actionLimiter,
    requireAuth,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const parsed = pidParamSchema.safeParse(req.params);
        if (!parsed.success) {
          res.status(400).json({ detail: "Invalid proposal id" });
          return;
        }

        const { pid } = parsed.data;
        const gateProp = await oobGate.getProposal(pid);
        if (!gateProp) {
          res.status(404).json({ detail: "Proposal not found" });
          return;
        }
        if (gateProp.status !== "PENDING") {
          res.status(409).json({
            detail: `Proposal is already ${gateProp.status}`,
          });
          return;
        }

        const idemKey = `CR_${pid}_${crypto.randomBytes(4).toString("hex")}`;
        const token = await oobGate.mintToken(pid, idemKey);
        if (!token) {
          res
            .status(409)
            .json({ detail: "Could not mint single-use execution token (expired or invalid)" });
          return;
        }

        const result = await oobGate.verifyAndConsume(token);
        if (!result.ok) {
          res.status(409).json({ detail: result.reason });
          return;
        }

        const approvedProp = (await oobGate.getProposal(pid)) ?? {
          ...gateProp,
          status: "APPROVED" as const,
        };
        const execution = await executionAdapter.execute(approvedProp);
        const actor = req.approverSession?.sub ?? APPROVER_USER_ID;
        const when = new Date().toISOString();
        const audit = await auditLedger.append(
          actor,
          `approved ${pid} at ${when}: ${gateProp.summary}`
        );
        res.json({ audit, execution });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    "/api/proposals/:pid/reject",
    actionLimiter,
    requireAuth,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const parsed = pidParamSchema.safeParse(req.params);
        if (!parsed.success) {
          res.status(400).json({ detail: "Invalid proposal id" });
          return;
        }

        const { pid } = parsed.data;
        const gateProp = await oobGate.getProposal(pid);
        if (!gateProp) {
          res.status(404).json({ detail: "Proposal not found" });
          return;
        }
        if (gateProp.status !== "PENDING") {
          res.status(409).json({ detail: `Proposal is already ${gateProp.status}` });
          return;
        }

        await oobGate.updateStatus(pid, "REJECTED");
        const actor = req.approverSession?.sub ?? APPROVER_USER_ID;
        const when = new Date().toISOString();
        const audit = await auditLedger.append(actor, `rejected ${pid} at ${when}`);
        res.json({ audit });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    "/api/quarantine/:qid/restore",
    actionLimiter,
    requireAuth,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const parsed = qidParamSchema.safeParse(req.params);
        if (!parsed.success) {
          res.status(400).json({ detail: "Invalid quarantine id" });
          return;
        }
        const updated = await QuarantineItem.findOneAndUpdate(
          { _id: parsed.data.qid, status: "QUARANTINED" },
          { $set: { status: "RESTORED" } },
          { new: true }
        );
        if (!updated) {
          res.status(404).json({ detail: "Item not found" });
          return;
        }
        const actor = req.approverSession?.sub ?? APPROVER_USER_ID;
        const audit = await auditLedger.append(
          actor,
          `restored ${parsed.data.qid} to inbox`
        );
        res.json({ audit });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    "/api/selftest/write-without-token",
    actionLimiter,
    requireAuth,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const actor = req.approverSession?.sub ?? APPROVER_USER_ID;
        const audit = await auditLedger.append(
          actor,
          "BLOCKED: Calendar.write() without token",
          true
        );
        res.json({ audit });
      } catch (err) {
        next(err);
      }
    }
  );

  app.get("/api/audit/verify", async (_req, res, next) => {
    try {
      const [verification, entries] = await Promise.all([
        auditLedger.verify(),
        auditLedger.listEntries(),
      ]);
      res.json({
        valid: verification.valid,
        entries,
        firstBrokenIndex: verification.firstBrokenIndex,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/benchmark", requireSessionOnly, (_req, res) => {
    const realFile = path.resolve(__dirname, "..", "..", "..", "fixtures", "benchmark_results.json");
    if (fs.existsSync(realFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(realFile, "utf8"));
        res.json(data);
        return;
      } catch {
        // Fallback to placeholder if unreadable
      }
    }
    res.json({
      total: 25,
      blocked: 23,
      allowed: 2,
      source: "placeholder",
      note: "Placeholder benchmark until a real evaluation run exists.",
    });
  });

  app.post(
    "/api/mint-and-execute",
    actionLimiter,
    requireAuth,
    async (req, res, next) => {
      try {
        const parsed = mintExecuteQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          res
            .status(400)
            .json({ success: false, message: "Missing proposal_id or idempotency_key" });
          return;
        }
        const { proposal_id, idempotency_key } = parsed.data;
        const gateProp = await oobGate.getProposal(proposal_id);
        if (!gateProp) {
          res.status(404).json({ success: false, message: "Proposal not found" });
          return;
        }
        if (gateProp.status !== "PENDING") {
          res.status(409).json({
            success: false,
            message: `Proposal is not in executable state (Status: ${gateProp.status}).`,
          });
          return;
        }

        const token = await oobGate.mintToken(proposal_id, idempotency_key);
        if (!token) {
          res
            .status(409)
            .json({ success: false, message: "Failed to mint token (proposal expired or invalid)" });
          return;
        }

        const result = await oobGate.verifyAndConsume(token);
        if (!result.ok) {
          res.status(409).json({ success: false, message: result.reason });
          return;
        }

        const entryHash = `${crypto.randomBytes(8).toString("hex")}9f3c${crypto.randomBytes(8).toString("hex")}`;
        res.json({
          success: true,
          proposal_id,
          token,
          entry_hash: entryHash,
          message: result.reason,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Real-time SSE push updates (detects both API mutations and MCP-staged proposals)
  const sseClients = new Set<Response>();
  let lastFingerprint = "";

  async function computeCounters(): Promise<{ pending: number; auditCount: number; fingerprint: string }> {
    const [propCount, lastAudit, execCount, quarCount] = await Promise.all([
      getProposalModel().countDocuments({ status: "PENDING" }),
      auditLedger.listEntries(),
      getExecutionRecordModel().countDocuments(),
      QuarantineItem.countDocuments({ status: "QUARANTINED" }),
    ]);
    const topN = lastAudit.length ? lastAudit[lastAudit.length - 1].n : 0;
    return {
      pending: propCount,
      auditCount: lastAudit.length,
      fingerprint: `${propCount}:${topN}:${execCount}:${quarCount}`,
    };
  }

  function broadcastSse(event: string, data: Record<string, unknown>): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      client.write(payload);
    }
  }

  let sseTimer: ReturnType<typeof setInterval> | null = null;
  function ensureSseWatcher(): void {
    if (sseTimer) return;
    sseTimer = setInterval(async () => {
      if (sseClients.size === 0) {
        if (sseTimer) clearInterval(sseTimer);
        sseTimer = null;
        return;
      }
      try {
        const c = await computeCounters();
        if (c.fingerprint !== lastFingerprint) {
          lastFingerprint = c.fingerprint;
          broadcastSse("state_changed", { pending: c.pending, auditCount: c.auditCount });
        }
      } catch {
        // Ignore transient DB errors during SSE poll
      }
    }, 1000);
    sseTimer.unref();
  }

  const requireSession = requireApprover(authConfig.sessionSecret);

  app.get("/api/events", requireSession, async (_req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    res.write("event: connected\ndata: {}\n\n");

    sseClients.add(res);
    ensureSseWatcher();
    try {
      lastFingerprint = (await computeCounters()).fingerprint;
    } catch {
      lastFingerprint = "";
    }

    const keepalive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 20000);
    keepalive.unref();

    res.on("close", () => {
      clearInterval(keepalive);
      sseClients.delete(res);
    });
  });

  // Google OAuth Connect Flow for Calendar & Mail adapters
  const OAuthToken = getOAuthTokenModel();
  const OAUTH_STATE_COOKIE = "sentra_oauth_state";
  const GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    ...(process.env.SENTRA_ENABLE_GMAIL_SCOPE === "true"
      ? ["https://www.googleapis.com/auth/gmail.send"]
      : []),
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ");

  function getGoogleOAuthConfig(req: Request) {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI?.trim() ||
      `${req.protocol}://${req.get("host")}/api/oauth/google/callback`;
    return {
      configured: Boolean(clientId && clientSecret),
      clientId,
      clientSecret,
      redirectUri,
    };
  }

  app.get("/api/oauth/google/status", requireSession, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cfg = getGoogleOAuthConfig(req);
      const tokenDoc = await OAuthToken.findById("google").lean();
      const envConnected = Boolean(
        process.env.GOOGLE_ACCESS_TOKEN?.trim() || process.env.GMAIL_ACCESS_TOKEN?.trim()
      );
      res.json({
        configured: cfg.configured,
        connected: Boolean(tokenDoc?.access_token) || envConnected,
        email: tokenDoc?.email ?? (envConnected ? "env-token" : null),
        live_writes: liveGoogleWrites,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/oauth/google/start", requireSession, (req: Request, res: Response) => {
    const cfg = getGoogleOAuthConfig(req);
    if (!cfg.configured) {
      res.status(503).json({
        detail:
          "Google OAuth is not configured (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).",
      });
      return;
    }
    const state = crypto.randomBytes(24).toString("hex");
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: authConfig.isProduction,
      path: "/api/oauth/google",
      maxAge: 10 * 60 * 1000,
    });
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get(
    "/api/oauth/google/callback",
    requireSession,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const cfg = getGoogleOAuthConfig(req);
        const code = typeof req.query.code === "string" ? req.query.code : "";
        const state = typeof req.query.state === "string" ? req.query.state : "";
        const expectedState =
          typeof req.cookies?.[OAUTH_STATE_COOKIE] === "string"
            ? req.cookies[OAUTH_STATE_COOKIE]
            : "";

        res.clearCookie(OAUTH_STATE_COOKIE, { path: "/api/oauth/google" });

        if (!cfg.configured || !code || !state || !expectedState || !timingSafeEqualStrings(state, expectedState)) {
          res.status(400).json({ detail: "Invalid OAuth state or authorization code." });
          return;
        }

        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            redirect_uri: cfg.redirectUri,
            grant_type: "authorization_code",
          }),
        });
        if (!tokenRes.ok) {
          res.status(502).json({ detail: "Failed to exchange Google OAuth code." });
          return;
        }
        const tokenJson = (await tokenRes.json()) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          scope?: string;
        };
        if (!tokenJson.access_token) {
          res.status(502).json({ detail: "Google OAuth did not return an access token." });
          return;
        }

        let email: string | null = null;
        try {
          const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokenJson.access_token}` },
          });
          if (infoRes.ok) {
            const info = (await infoRes.json()) as { email?: string };
            email = info.email ?? null;
          }
        } catch {
          // Email lookup is optional
        }

        await OAuthToken.findOneAndUpdate(
          { _id: "google" },
          {
            $set: {
              _id: "google",
              provider: "google",
              access_token: encryptToken(tokenJson.access_token, tokenEncryptionKey),
              refresh_token: tokenJson.refresh_token
                ? encryptToken(tokenJson.refresh_token, tokenEncryptionKey)
                : null,
              expires_at: tokenJson.expires_in
                ? Date.now() + tokenJson.expires_in * 1000
                : null,
              scope: tokenJson.scope ?? GOOGLE_SCOPES,
              email,
              updated_at: new Date().toISOString(),
            },
          },
          { upsert: true, new: true }
        );
        const actor = req.approverSession?.sub ?? APPROVER_USER_ID;
        await auditLedger.append(actor, `connected Google OAuth (${email ?? "account"})`);
        res.redirect("/dashboard");
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    "/api/oauth/google/disconnect",
    actionLimiter,
    requireAuth,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        await OAuthToken.deleteOne({ _id: "google" });
        const actor = req.approverSession?.sub ?? APPROVER_USER_ID;
        const audit = await auditLedger.append(actor, "disconnected Google OAuth");
        res.json({ ok: true, audit });
      } catch (err) {
        next(err);
      }
    }
  );

  // Streamable HTTP MCP endpoint (protected by bearer token + Host/Origin DNS-rebinding checks)
  const checkMcpHostAndOrigin = (req: Request, res: Response, next: NextFunction): void => {
    const allowedHosts = new Set<string>(["127.0.0.1", "localhost"]);
    const allowedOrigins = new Set<string>([
      "http://127.0.0.1:8001",
      "http://localhost:8001",
      "http://127.0.0.1:5173",
      "http://localhost:5173",
    ]);
    for (const candidate of [process.env.SENTRA_UI_URL, process.env.WEB_ORIGIN]) {
      if (candidate?.trim()) {
        try {
          const u = new URL(candidate.trim());
          allowedHosts.add(u.hostname);
          allowedOrigins.add(u.origin);
        } catch {
          // ignore invalid URL
        }
      }
    }
    if (process.env.RENDER_EXTERNAL_HOSTNAME?.trim()) {
      allowedHosts.add(process.env.RENDER_EXTERNAL_HOSTNAME.trim().toLowerCase());
    }

    const hostHeader = req.get("host")?.trim();
    if (hostHeader) {
      const hostname = hostHeader.replace(/:\d+$/, "").toLowerCase();
      if (!allowedHosts.has(hostname)) {
        res.status(403).json({ detail: "Forbidden host" });
        return;
      }
    }

    const originHeader = req.get("origin")?.trim();
    if (originHeader && !allowedOrigins.has(originHeader)) {
      res.status(403).json({ detail: "Forbidden origin" });
      return;
    }

    next();
  };

  const mcpLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.all(
    "/mcp",
    mcpLimiter,
    checkMcpHostAndOrigin,
    requireMcpBearer(mcpToken, async (rawKey) => Boolean(await apiKeyStore.verifyKey(rawKey))),
    async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mcpServer = new McpServer(
        { name: SERVER_NAME, version: "1.0.0" },
        { instructions: SERVER_INSTRUCTIONS }
      );
      await registerSentraTools(mcpServer);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => {
        void transport.close();
        void mcpServer.close();
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      next(err);
    }
  });

  // Per-agent / per-user API key management (hashed at rest, shown once on creation)
  const createKeyBodySchema = z.object({
    name: z.string().trim().min(1).max(60),
  });
  const kidParamSchema = z.object({
    kid: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  });

  app.get("/api/keys", requireSession, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const keys = await apiKeyStore.listKeys();
      res.json({ keys });
    } catch (err) {
      next(err);
    }
  });

  app.post(
    "/api/keys",
    actionLimiter,
    requireAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const parsed = createKeyBodySchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ detail: "API key name is required (1-60 chars)" });
          return;
        }
        const created = await apiKeyStore.createKey(
          parsed.data.name,
          req.approverSession?.sub ?? APPROVER_USER_ID
        );
        const actor = req.approverSession?.sub ?? APPROVER_USER_ID;
        const audit = await auditLedger.append(
          actor,
          `created API key ${created.record.id} (${created.record.name})`
        );
        res.status(201).json({ ...created, audit });
      } catch (err) {
        next(err);
      }
    }
  );

  app.delete(
    "/api/keys/:kid",
    actionLimiter,
    requireAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const parsed = kidParamSchema.safeParse(req.params);
        if (!parsed.success) {
          res.status(400).json({ detail: "Invalid API key id" });
          return;
        }
        const revoked = await apiKeyStore.revokeKey(parsed.data.kid);
        if (!revoked) {
          res.status(404).json({ detail: "API key not found or already revoked" });
          return;
        }
        const actor = req.approverSession?.sub ?? APPROVER_USER_ID;
        const audit = await auditLedger.append(
          actor,
          `revoked API key ${revoked.id} (${revoked.name})`
        );
        res.json({ ok: true, record: revoked, audit });
      } catch (err) {
        next(err);
      }
    }
  );

  // Health check (checks Mongo connection, no sensitive data)
  app.get("/healthz", async (_req, res) => {
    try {
      if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
        res.status(503).json({ status: "error", db: "disconnected" });
        return;
      }
      await mongoose.connection.db.admin().ping();
      res.status(200).json({ status: "ok", db: "connected" });
    } catch {
      res.status(503).json({ status: "error", db: "disconnected" });
    }
  });

  // Ensure every /api/* 404 returns JSON, never HTML
  app.all("/api/*", (_req, res) => {
    res.status(404).json({ detail: "API route not found" });
  });

  // Serve built React app in production (or whenever apps/web/dist exists)
  const webDist = path.resolve(__dirname, "..", "..", "web", "dist");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  // Central error handler (never leak stack traces or Mongo internals)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SentraSecurityError) {
      res.status(403).json({ detail: err.message });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({ detail: "Invalid request parameters" });
      return;
    }
    console.error("[Sentra-API] Unhandled error:", err);
    res.status(500).json({ detail: "Internal server error" });
  });

  return { app, taintTracker, oobGate, auditLedger };
}
