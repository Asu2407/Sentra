import crypto from "node:crypto";
import type { Connection } from "mongoose";
import mongoose from "mongoose";
import { getApiKeyModel } from "./models/ApiKey.js";

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey, "utf8").digest("hex");
}

function toSummary(doc: {
  _id: string;
  name: string;
  prefix: string;
  created_by: string;
  created_at: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
}): ApiKeySummary {
  return {
    id: doc._id,
    name: doc.name,
    prefix: doc.prefix,
    created_by: doc.created_by,
    created_at: doc.created_at,
    last_used_at: doc.last_used_at ?? null,
    revoked_at: doc.revoked_at ?? null,
  };
}

export class ApiKeyStore {
  private readonly conn: Connection;

  constructor(conn: Connection = mongoose.connection) {
    this.conn = conn;
  }

  async createKey(
    name: string,
    createdBy: string
  ): Promise<{ key: string; record: ApiKeySummary }> {
    const id = `KEY_${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const rawKey = `sentra_live_${crypto.randomBytes(24).toString("hex")}`;
    const prefix = rawKey.slice(0, 20);
    const keyHash = hashApiKey(rawKey);
    const createdAt = new Date().toISOString();

    const ApiKey = getApiKeyModel(this.conn);
    const doc = await ApiKey.create({
      _id: id,
      name,
      prefix,
      key_hash: keyHash,
      created_by: createdBy,
      created_at: createdAt,
      last_used_at: null,
      revoked_at: null,
    });

    return { key: rawKey, record: toSummary(doc) };
  }

  async verifyKey(rawKey: string): Promise<ApiKeySummary | null> {
    if (!rawKey.startsWith("sentra_live_")) return null;
    const keyHash = hashApiKey(rawKey);
    const ApiKey = getApiKeyModel(this.conn);
    const doc = await ApiKey.findOneAndUpdate(
      { key_hash: keyHash, revoked_at: null },
      { $set: { last_used_at: new Date().toISOString() } },
      { new: true }
    ).lean();
    return doc ? toSummary(doc) : null;
  }

  async listKeys(): Promise<ApiKeySummary[]> {
    const ApiKey = getApiKeyModel(this.conn);
    const docs = await ApiKey.find().sort({ created_at: -1 }).lean();
    return docs.map((d) => toSummary(d));
  }

  async revokeKey(id: string): Promise<ApiKeySummary | null> {
    const ApiKey = getApiKeyModel(this.conn);
    const doc = await ApiKey.findOneAndUpdate(
      { _id: id, revoked_at: null },
      { $set: { revoked_at: new Date().toISOString() } },
      { new: true }
    ).lean();
    return doc ? toSummary(doc) : null;
  }
}
