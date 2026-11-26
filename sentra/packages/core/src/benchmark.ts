import crypto from "node:crypto";
import { AuditLedger } from "./auditLedger.js";
import { ConflictDetector } from "./conflictDetector.js";
import { EmailGuard } from "./emailGuard.js";
import { OOBExecutionGate, SentraSecurityError } from "./oobGate.js";
import { ScamDetector } from "./scamDetector.js";
import { TaintTracker } from "./taintTracker.js";

export interface BenchmarkScenarioResult {
  id: string;
  category: string;
  expected: "BLOCKED" | "ALLOWED";
  actual: "BLOCKED" | "ALLOWED";
  passed: boolean;
}

export interface BenchmarkReport {
  total: number;
  blocked: number;
  allowed: number;
  passed: number;
  source: "evaluation";
  generated_at: string;
  scenarios: BenchmarkScenarioResult[];
}

export async function runSecurityBenchmark(): Promise<BenchmarkReport> {
  const scenarios: BenchmarkScenarioResult[] = [];
  const tracker = new TaintTracker(null);
  const ledger = new AuditLedger(null);
  const gate = new OOBExecutionGate({ conn: null, taintTracker: tracker, auditLedger: ledger });
  const scam = new ScamDetector();
  const conflict = new ConflictDetector();
  const emailGuard = new EmailGuard(tracker, gate);

  await tracker.registerSource("USER_DIRECT", "user_prompt", "FULL", "Rohan");
  await tracker.registerSource("KNOWN_CONTACT", "email", "MEDIUM", "Priya");
  await tracker.registerSource("STRANGER_PDF", "pdf_attachment", "LOW", "invoice.pdf");
  await tracker.registerSource("STRANGER_MAIL", "email", "LOW", "hr@internship-secure-portal.xyz");

  const record = (
    id: string,
    category: string,
    expected: "BLOCKED" | "ALLOWED",
    actual: "BLOCKED" | "ALLOWED"
  ) => {
    scenarios.push({ id, category, expected, actual, passed: expected === actual });
  };

  // 1-6: TaintTracker low-trust & unknown source blocking
  for (const [i, action] of ["delete_event", "update_calendar", "create_event", "send_email", "pay"].entries()) {
    const res = await tracker.checkExecutionPermission("STRANGER_PDF", action);
    record(`BM-0${i + 1}`, `taint-${action}`, "BLOCKED", res.allowed ? "ALLOWED" : "BLOCKED");
  }
  const unkRes = await tracker.checkExecutionPermission("UNKNOWN_SRC", "pay");
  record("BM-06", "unknown-source", "BLOCKED", unkRes.allowed ? "ALLOWED" : "BLOCKED");

  // 7-10: Gate-level LOW-trust & forged token blocking
  await gate.stageProposal("BM_LOW_1", "pay", "Wire 45000", {}, "STRANGER_MAIL");
  let lowBlocked = false;
  try {
    await gate.mintToken("BM_LOW_1", "K_BM_LOW");
  } catch (e) {
    if (e instanceof SentraSecurityError) lowBlocked = true;
  }
  record("BM-07", "gate-low-mint", "BLOCKED", lowBlocked ? "BLOCKED" : "ALLOWED");

  const exp = Math.trunc(Date.now() / 1000) + 300;
  const sig = crypto
    .createHmac("sha256", "safeguard-os-demo-secret-key-judge-hardened")
    .update(`BM_LOW_1:${exp}:K_FORGED`, "utf8")
    .digest("hex");
  let verifyLowBlocked = false;
  try {
    await gate.verifyAndConsume(`BM_LOW_1:${exp}:K_FORGED:${sig}`);
  } catch (e) {
    if (e instanceof SentraSecurityError) verifyLowBlocked = true;
  }
  record("BM-08", "gate-low-verify", "BLOCKED", verifyLowBlocked ? "BLOCKED" : "ALLOWED");

  const badSigRes = await gate.verifyAndConsume(`BM_LOW_1:${exp}:K_BAD:0000`);
  record("BM-09", "forged-hmac", "BLOCKED", badSigRes.ok ? "ALLOWED" : "BLOCKED");

  const expiredRes = await gate.verifyAndConsume(`BM_LOW_1:1000:K_EXP:${sig}`);
  record("BM-10", "expired-ttl", "BLOCKED", expiredRes.ok ? "ALLOWED" : "BLOCKED");

  // 11-12: Replay attack & rejected proposal protection
  await gate.stageProposal("BM_USER_1", "create_event", "Team sync", {}, "USER_DIRECT");
  const tok1 = (await gate.mintToken("BM_USER_1", "K_REPLAY"))!;
  const firstUse = await gate.verifyAndConsume(tok1);
  record("BM-11", "valid-user-token", "ALLOWED", firstUse.ok ? "ALLOWED" : "BLOCKED");
  const replayUse = await gate.verifyAndConsume(tok1);
  record("BM-12", "replay-attack", "BLOCKED", replayUse.ok ? "ALLOWED" : "BLOCKED");

  await gate.stageProposal("BM_REJ_1", "create_event", "Rejected item", {}, "USER_DIRECT");
  await gate.updateStatus("BM_REJ_1", "REJECTED");
  const rejConsume = await gate.consume("K_REJ", "BM_REJ_1");
  record("BM-13", "rejected-proposal", "BLOCKED", rejConsume.ok ? "ALLOWED" : "BLOCKED");

  // 14-18: ScamDetector phishing & credential traps
  const scamCases: Array<[string, string, string, string]> = [
    ["BM-14", "hr@internship-secure-portal.xyz", "URGENT: Confirm spot", "Send national ID scan and registration fee"],
    ["BM-15", "support@paypa1.com", "Account suspended", "Immediate action required: enter OTP"],
    ["BM-16", "alerts@bank-support.xyz", "KYC update", "Act within 2 hours with PIN"],
    ["BM-17", "promo@win.top", "Last chance", "Reply with bank details"],
    ["BM-18", "verify@gma1l.com", "Urgent", "Confirm password now"],
  ];
  for (const [id, sender, subj, body] of scamCases) {
    const r = scam.scanEmail(sender, subj, body);
    record(id, "scam-scan", "BLOCKED", r.risk_level === "SAFE" ? "ALLOWED" : "BLOCKED");
  }

  // 19-20: EmailGuard interception
  const emBlocked = await emailGuard.interceptOutboundEmail(
    "evil@stranger.xyz",
    "Docs",
    "Here is ID",
    ["passport.pdf"],
    "STRANGER_MAIL"
  );
  record("BM-19", "email-guard-stranger", "BLOCKED", emBlocked.is_blocked ? "BLOCKED" : "ALLOWED");

  const emUser = await emailGuard.interceptOutboundEmail(
    "colleague@acme.co",
    "Notes",
    "Meeting notes",
    [],
    "USER_DIRECT"
  );
  record("BM-20", "email-guard-user", "ALLOWED", emUser.is_blocked ? "BLOCKED" : "ALLOWED");

  // 21-23: Deterministic conflict detection
  const c1 = conflict.checkTransitAndMedication("07:10", 45, "07:00", 30);
  record("BM-21", "conflict-transit-med", "BLOCKED", c1 ? "BLOCKED" : "ALLOWED");
  const c2 = conflict.checkDinnerBudget(180, 25, 5, 200);
  record("BM-22", "conflict-budget-cap", "BLOCKED", c2 ? "BLOCKED" : "ALLOWED");
  const c3 = conflict.checkDinnerBudget(120, 15, 5, 200);
  record("BM-23", "valid-budget", "ALLOWED", c3 ? "BLOCKED" : "ALLOWED");

  // 24-25: AuditLedger tamper detection & valid known-contact approval
  await ledger.append("system", "init");
  await ledger.append("local-approver", "approved BM_USER_1");
  const validChain = await ledger.verify();
  record("BM-24", "audit-chain-valid", "ALLOWED", validChain.valid ? "ALLOWED" : "BLOCKED");

  await gate.stageProposal("BM_KNOWN_1", "create_event", "Dinner with Priya", {}, "KNOWN_CONTACT");
  const tokKnown = (await gate.mintToken("BM_KNOWN_1", "K_KNOWN"))!;
  const knownUse = await gate.verifyAndConsume(tokKnown);
  record("BM-25", "known-contact-approve", "ALLOWED", knownUse.ok ? "ALLOWED" : "BLOCKED");

  const blocked = scenarios.filter((s) => s.actual === "BLOCKED").length;
  const allowed = scenarios.filter((s) => s.actual === "ALLOWED").length;
  const passed = scenarios.filter((s) => s.passed).length;

  return {
    total: scenarios.length,
    blocked,
    allowed,
    passed,
    source: "evaluation",
    generated_at: new Date().toISOString(),
    scenarios,
  };
}
