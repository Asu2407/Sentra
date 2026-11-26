import crypto from "node:crypto";
import mongoose, { type Connection } from "mongoose";
import { SECRET_KEY, TOKEN_TTL_SECONDS } from "./constants.js";
import type { AuditLedger } from "./auditLedger.js";
import { getConsumedKeyModel } from "./models/ConsumedKey.js";
import { getProposalModel } from "./models/Proposal.js";
import type { TaintTracker } from "./taintTracker.js";
import type { PendingProposal, ProposalStatus } from "./types.js";

export class SentraSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SentraSecurityError";
  }
}

export interface OOBGateOptions {
  conn?: Connection | null;
  taintTracker?: TaintTracker | null;
  auditLedger?: AuditLedger | null;
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}

export class OOBExecutionGate {
  private readonly conn: Connection | null;
  private readonly taintTracker: TaintTracker | null;
  private readonly auditLedger: AuditLedger | null;
  private readonly memProposals = new Map<string, PendingProposal>();
  private readonly memKeys = new Set<string>();

  constructor(options: OOBGateOptions = {}) {
    this.conn = options.conn === undefined ? mongoose.connection : options.conn;
    this.taintTracker = options.taintTracker ?? null;
    this.auditLedger = options.auditLedger ?? null;
  }

  private async assertTrustedSource(sourceId: string, proposalId: string): Promise<void> {
    if (!this.taintTracker) {
      return;
    }
    const src = await this.taintTracker.getSource(sourceId);
    if (!src) {
      if (this.auditLedger) {
        await this.auditLedger.append(
          "gate",
          `BLOCKED ${proposalId}: unknown source ${sourceId}`,
          true
        );
      }
      throw new SentraSecurityError("Unknown source. Defaulting to strict quarantine.");
    }
    if (src.trust_level === "LOW") {
      if (this.auditLedger) {
        await this.auditLedger.append(
          "gate",
          `BLOCKED ${proposalId}: LOW-trust source ${sourceId}`,
          true
        );
      }
      throw new SentraSecurityError("LOW-trust proposals cannot be approved.");
    }
  }

  async stageProposal(
    proposalId: string,
    actionType: string,
    summary: string,
    diffPreview: Record<string, unknown>,
    sourceId: string
  ): Promise<PendingProposal> {
    const createdAt = Date.now() / 1000;
    const proposal: PendingProposal = {
      proposal_id: proposalId,
      action_type: actionType,
      summary,
      diff_preview: diffPreview,
      source_id: sourceId,
      created_at: createdAt,
      expires_at: createdAt + TOKEN_TTL_SECONDS,
      status: "PENDING",
    };

    if (!this.conn) {
      this.memProposals.set(proposalId, proposal);
      return proposal;
    }

    const Proposal = getProposalModel(this.conn);
    await Proposal.findOneAndUpdate(
      { _id: proposalId },
      { $set: { _id: proposalId, ...proposal } },
      { upsert: true, new: true }
    );
    return proposal;
  }

  async updateStatus(proposalId: string, status: ProposalStatus): Promise<void> {
    if (!this.conn) {
      const mem = this.memProposals.get(proposalId);
      if (mem) mem.status = status;
      return;
    }
    const Proposal = getProposalModel(this.conn);
    await Proposal.updateOne({ _id: proposalId }, { $set: { status } });
  }

  async getProposal(proposalId: string): Promise<PendingProposal | undefined> {
    let prop: PendingProposal | undefined;
    if (!this.conn) {
      prop = this.memProposals.get(proposalId);
    } else {
      const Proposal = getProposalModel(this.conn);
      const doc = await Proposal.findById(proposalId).lean();
      if (doc) {
        prop = {
          proposal_id: doc.proposal_id,
          action_type: doc.action_type,
          summary: doc.summary,
          diff_preview: doc.diff_preview,
          source_id: doc.source_id,
          created_at: doc.created_at,
          expires_at: doc.expires_at,
          status: doc.status,
        };
      }
    }

    if (prop && Date.now() / 1000 > prop.expires_at && prop.status === "PENDING") {
      prop.status = "EXPIRED";
      await this.updateStatus(proposalId, "EXPIRED");
    }

    return prop;
  }

  async listProposals(status?: ProposalStatus): Promise<PendingProposal[]> {
    let items: PendingProposal[];
    if (!this.conn) {
      items = Array.from(this.memProposals.values());
    } else {
      const Proposal = getProposalModel(this.conn);
      const docs = await Proposal.find().sort({ created_at: 1 }).lean();
      items = docs.map((doc) => ({
        proposal_id: doc.proposal_id,
        action_type: doc.action_type,
        summary: doc.summary,
        diff_preview: doc.diff_preview,
        source_id: doc.source_id,
        created_at: doc.created_at,
        expires_at: doc.expires_at,
        status: doc.status,
      }));
    }

    const now = Date.now() / 1000;
    const out: PendingProposal[] = [];
    for (const prop of items) {
      if (now > prop.expires_at && prop.status === "PENDING") {
        prop.status = "EXPIRED";
        await this.updateStatus(prop.proposal_id, "EXPIRED");
      }
      if (!status || prop.status === status) {
        out.push(prop);
      }
    }
    return out;
  }

  async mintToken(proposalId: string, idempotencyKey: string): Promise<string | null> {
    const prop = await this.getProposal(proposalId);
    if (!prop || prop.status !== "PENDING") {
      return null;
    }

    // Check source trust BEFORE minting
    await this.assertTrustedSource(prop.source_id, proposalId);

    const expiry = Math.trunc(prop.expires_at);
    const message = `${proposalId}:${expiry}:${idempotencyKey}`;
    const signature = crypto
      .createHmac("sha256", SECRET_KEY)
      .update(message, "utf8")
      .digest("hex");

    return `${proposalId}:${expiry}:${idempotencyKey}:${signature}`;
  }

  async consume(
    idempotencyKey: string,
    proposalId: string
  ): Promise<{ ok: boolean; reason: string }> {
    if (!this.conn) {
      if (this.memKeys.has(idempotencyKey)) {
        return {
          ok: false,
          reason: "Replay attack detected: Idempotency key already consumed.",
        };
      }
      const prop = await this.getProposal(proposalId);
      if (!prop || prop.status !== "PENDING") {
        return {
          ok: false,
          reason: `Proposal is not in executable state (Status: ${prop ? prop.status : "NOT_FOUND"}).`,
        };
      }
      this.memKeys.add(idempotencyKey);
      prop.status = "APPROVED";
      return {
        ok: true,
        reason: `Proposal '${proposalId}' cryptographically verified and authorized.`,
      };
    }

    const ConsumedKey = getConsumedKeyModel(this.conn);
    const Proposal = getProposalModel(this.conn);

    // 1. Atomic insert into consumed_keys with _id = idempotencyKey
    try {
      await ConsumedKey.create({
        _id: idempotencyKey,
        consumed_at: Date.now() / 1000,
      });
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        return {
          ok: false,
          reason: "Replay attack detected: Idempotency key already consumed.",
        };
      }
      throw err;
    }

    // 2. Atomic PENDING -> APPROVED transition; compensate by deleting key if not matched
    const updated = await Proposal.findOneAndUpdate(
      { _id: proposalId, status: "PENDING" },
      { $set: { status: "APPROVED" } },
      { new: true }
    );

    if (!updated) {
      await ConsumedKey.deleteOne({ _id: idempotencyKey });
      const current = await this.getProposal(proposalId);
      return {
        ok: false,
        reason: `Proposal is not in executable state (Status: ${current ? current.status : "NOT_FOUND"}).`,
      };
    }

    return {
      ok: true,
      reason: `Proposal '${proposalId}' cryptographically verified and authorized.`,
    };
  }

  async verifyAndConsume(tokenStr: string): Promise<{ ok: boolean; reason: string }> {
    const parts = tokenStr.split(":");
    if (parts.length !== 4) {
      return { ok: false, reason: "Malformed token format." };
    }
    const [proposalId, expiryStr, idempotencyKey, signature] = parts;
    const expiry = Number.parseInt(expiryStr, 10);
    if (!Number.isFinite(expiry)) {
      return { ok: false, reason: "Malformed token format." };
    }

    // 1. TTL check
    if (Date.now() / 1000 > expiry) {
      return { ok: false, reason: "Execution token has expired (TTL exceeded)." };
    }

    // 2. Signature verification
    const expectedMsg = `${proposalId}:${expiry}:${idempotencyKey}`;
    const expectedSig = crypto
      .createHmac("sha256", SECRET_KEY)
      .update(expectedMsg, "utf8")
      .digest("hex");

    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expectedSig, "utf8");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { ok: false, reason: "Invalid cryptographic HMAC signature." };
    }

    // 3. Trust check BEFORE consuming any key
    const prop = await this.getProposal(proposalId);
    if (!prop) {
      return {
        ok: false,
        reason: "Proposal is not in executable state (Status: NOT_FOUND).",
      };
    }
    await this.assertTrustedSource(prop.source_id, proposalId);

    // 4. Atomic replay + status transition
    return this.consume(idempotencyKey, proposalId);
  }
}
