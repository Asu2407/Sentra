import crypto from "node:crypto";
import mongoose, { type Connection } from "mongoose";
import { GENESIS_HASH } from "./constants.js";
import { getAuditEntryModel } from "./models/AuditEntry.js";
import type { AuditEntryRecord, AuditVerifyResult } from "./types.js";

function computeEntryHash(
  prevHash: string,
  n: number,
  actor: string,
  text: string,
  denied: boolean
): string {
  const payload = `${prevHash}|${n}|${actor}|${text}|${denied ? 1 : 0}`;
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AuditLedger {
  private readonly conn: Connection | null;
  private readonly mem: AuditEntryRecord[] = [];

  constructor(conn: Connection | null = mongoose.connection) {
    this.conn = conn;
  }

  async append(actor: string, text: string, denied = false): Promise<AuditEntryRecord> {
    if (!this.conn) {
      const n = this.mem.length + 1;
      const prevHash = this.mem.length ? this.mem[this.mem.length - 1].hash : GENESIS_HASH;
      const hash = computeEntryHash(prevHash, n, actor, text, denied);
      const rec: AuditEntryRecord = { n, actor, text, hash, prev_hash: prevHash, denied };
      this.mem.push(rec);
      return rec;
    }

    const AuditEntry = getAuditEntryModel(this.conn);
    const maxAttempts = 10;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const latest = await AuditEntry.findOne().sort({ n: -1 }).lean();
      const n = latest ? latest.n + 1 : 1;
      const prevHash = latest ? latest.hash : GENESIS_HASH;
      const hash = computeEntryHash(prevHash, n, actor, text, denied);

      try {
        await AuditEntry.create({
          n,
          actor,
          text,
          hash,
          prev_hash: prevHash,
          denied,
        });
        return { n, actor, text, hash, prev_hash: prevHash, denied };
      } catch (err: unknown) {
        if (isDuplicateKeyError(err) && attempt < maxAttempts) {
          await sleep(5 + Math.floor(Math.random() * 20));
          continue;
        }
        throw err;
      }
    }

    throw new Error("AuditLedger.append exceeded maximum retry attempts");
  }

  async listEntries(): Promise<AuditEntryRecord[]> {
    if (!this.conn) {
      return this.mem.map((e) => ({ ...e }));
    }
    const AuditEntry = getAuditEntryModel(this.conn);
    const docs = await AuditEntry.find().sort({ n: 1 }).lean();
    return docs.map((d) => ({
      n: d.n,
      actor: d.actor,
      text: d.text,
      hash: d.hash,
      prev_hash: d.prev_hash,
      denied: Boolean(d.denied),
    }));
  }

  async verify(): Promise<AuditVerifyResult> {
    const items = await this.listEntries();
    let expectedPrev = GENESIS_HASH;
    for (let i = 0; i < items.length; i += 1) {
      const entry = items[i];
      if (entry.prev_hash !== expectedPrev) {
        return { valid: false, firstBrokenIndex: i };
      }
      const expectedHash = computeEntryHash(
        entry.prev_hash,
        entry.n,
        entry.actor,
        entry.text,
        entry.denied
      );
      if (expectedHash !== entry.hash) {
        return { valid: false, firstBrokenIndex: i };
      }
      expectedPrev = entry.hash;
    }
    return { valid: true, firstBrokenIndex: null };
  }

  async verifyChain(): Promise<boolean> {
    const res = await this.verify();
    return res.valid;
  }
}
