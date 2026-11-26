import crypto from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AuditLedger,
  ConflictDetector,
  EmailGuard,
  OOBExecutionGate,
  ScamDetector,
  SentraSecurityError,
  TaintTracker,
  connect,
  disconnect,
  getAuditEntryModel,
  getConsumedKeyModel,
  getProposalModel,
  getSourceModel,
  syncAllIndexes,
} from "../src/index.js";

describe("Sentra Core Security & Domain Logic (MongoDB)", () => {
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

  beforeEach(async () => {
    await Promise.all([
      getSourceModel().deleteMany({}),
      getProposalModel().deleteMany({}),
      getConsumedKeyModel().deleteMany({}),
      getAuditEntryModel().deleteMany({}),
    ]);
  });

  it("blocks low-trust execution in TaintTracker", async () => {
    const tracker = new TaintTracker();
    await tracker.registerSource("UNTRUSTED_PDF", "pdf_attachment", "LOW", "malicious-site.com");
    const res = await tracker.checkExecutionPermission("UNTRUSTED_PDF", "delete_event");
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("Low-Trust origin");
  });

  it("allows direct user prompt in TaintTracker", async () => {
    const tracker = new TaintTracker();
    await tracker.registerSource("DIRECT_USER", "user_prompt", "FULL");
    const res = await tracker.checkExecutionPermission("DIRECT_USER", "create_event");
    expect(res.allowed).toBe(true);
  });

  it("computes deterministic transit and medication conflict proof", () => {
    const detector = new ConflictDetector();
    const conflict = detector.checkTransitAndMedication("07:10", 45, "07:00", 30);
    expect(conflict).not.toBeNull();
    expect(conflict!.severity).toBe("HARD_COLLISION");
    expect(conflict!.arithmetic_proof).toContain("06:25");
    expect(conflict!.arithmetic_proof).toContain("07:30");
  });

  it("mints, verifies, and blocks replay on OOBExecutionGate", async () => {
    const gate = new OOBExecutionGate();
    await gate.stageProposal("TEST_001", "create_event", "Test Calendar Event", {}, "USER");
    const token = await gate.mintToken("TEST_001", "IDEMPOTENCY_KEY_123");
    expect(token).not.toBeNull();

    const first = await gate.verifyAndConsume(token!);
    expect(first.ok).toBe(true);

    const replay = await gate.verifyAndConsume(token!);
    expect(replay.ok).toBe(false);
    expect(replay.reason).toContain("Replay attack detected");
  });

  it("catches internship scam in ScamDetector", () => {
    const detector = new ScamDetector();
    const res = detector.scanEmail(
      "hr@internship-secure-portal.xyz",
      "URGENT: Confirm your internship spot",
      "Congratulations! You must act within 2 hours. Please reply with your national ID scan and registration fee."
    );
    expect(res.risk_level).toBe("LIKELY_SCAM");
    expect(res.flags.length).toBeGreaterThanOrEqual(2);
    expect(res.spoken_summary.toLowerCase()).toContain("scam");
  });

  it("intercepts untrusted outbound email in EmailGuard", async () => {
    const tracker = new TaintTracker();
    const gate = new OOBExecutionGate({ taintTracker: tracker });
    const guard = new EmailGuard(tracker, gate);

    await tracker.registerSource("STRANGER_EMAIL", "email", "LOW", "phisher@evil.com");
    const prop = await guard.interceptOutboundEmail(
      "phisher@evil.com",
      "Re: Verification",
      "Here is my document",
      ["id_card.pdf"],
      "STRANGER_EMAIL"
    );
    expect(prop.is_blocked).toBe(true);
    expect(prop.plain_reason.toLowerCase()).toContain("stranger");
    expect(prop.hold_seconds).toBe(10);
  });

  it("enforces gate-level LOW-trust and unknown source blocking with audit entry", async () => {
    const tracker = new TaintTracker();
    const ledger = new AuditLedger();
    const gate = new OOBExecutionGate({ taintTracker: tracker, auditLedger: ledger });

    await tracker.registerSource("SRC_LOW", "email", "LOW", "stranger@bad.xyz");
    await gate.stageProposal("P_LOW", "pay", "Wire Rs 5000", {}, "SRC_LOW");

    await expect(gate.mintToken("P_LOW", "K_LOW")).rejects.toThrow(SentraSecurityError);
    await expect(gate.mintToken("P_LOW", "K_LOW")).rejects.toThrow(
      "LOW-trust proposals cannot be approved."
    );

    await gate.stageProposal("P_UNK", "pay", "Unknown source", {}, "SRC_MISSING");
    await expect(gate.mintToken("P_UNK", "K_UNK")).rejects.toThrow(SentraSecurityError);

    const forgedExp = Math.trunc((await gate.getProposal("P_LOW"))!.expires_at);
    const msg = `P_LOW:${forgedExp}:K_FORGED`;
    const sig = crypto
      .createHmac("sha256", "safeguard-os-demo-secret-key-judge-hardened")
      .update(msg, "utf8")
      .digest("hex");
    await expect(gate.verifyAndConsume(`${msg}:${sig}`)).rejects.toThrow(SentraSecurityError);

    const entries = await ledger.listEntries();
    expect(entries.some((e) => e.denied && e.text.includes("BLOCKED"))).toBe(true);
  });

  it("fails approving a REJECTED proposal and leaves key unburned", async () => {
    const tracker = new TaintTracker();
    const gate = new OOBExecutionGate({ taintTracker: tracker });

    await tracker.registerSource("SRC_U", "user_prompt", "FULL");
    await gate.stageProposal("P_REJ", "create_event", "Meeting", {}, "SRC_U");
    await gate.updateStatus("P_REJ", "REJECTED");

    expect(await gate.mintToken("P_REJ", "KEY_UNUSED")).toBeNull();
    const res = await gate.consume("KEY_UNUSED", "P_REJ");
    expect(res.ok).toBe(false);

    const keyDoc = await getConsumedKeyModel().findById("KEY_UNUSED").lean();
    expect(keyDoc).toBeNull();
  });

  it("reports exact broken index when an audit row is tampered", async () => {
    const ledger = new AuditLedger();
    await ledger.append("system", "entry 1");
    await ledger.append("system", "entry 2");
    await ledger.append("system", "entry 3");
    expect(await ledger.verify()).toEqual({ valid: true, firstBrokenIndex: null });

    await getAuditEntryModel().updateOne({ n: 2 }, { $set: { text: "tampered!" } });
    expect(await ledger.verify()).toEqual({ valid: false, firstBrokenIndex: 1 });
  });

  it("fails fast when MONGODB_URI is missing", async () => {
    const prev = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;
    await disconnect();
    await expect(connect()).rejects.toThrow("MONGODB_URI");
    if (prev) process.env.MONGODB_URI = prev;
    await connect(mongod.getUri());
    await syncAllIndexes();
  });
});
