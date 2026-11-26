import mongoose, { type Connection } from "mongoose";
import { SENSITIVE_ACTIONS } from "./constants.js";
import { getSourceModel } from "./models/Source.js";
import type { DataProvenance, TrustLevel } from "./types.js";

export class TaintTracker {
  private readonly conn: Connection | null;
  private readonly mem = new Map<string, DataProvenance>();

  constructor(conn: Connection | null = mongoose.connection) {
    this.conn = conn;
  }

  async registerSource(
    sourceId: string,
    originType: string,
    trustLevel: TrustLevel,
    sender: string | null = null
  ): Promise<DataProvenance> {
    const record: DataProvenance = {
      source_id: sourceId,
      origin_type: originType,
      trust_level: trustLevel,
      sender,
      is_tainted: trustLevel === "LOW",
      timestamp: Date.now() / 1000,
    };

    if (!this.conn) {
      this.mem.set(sourceId, record);
      return record;
    }

    const Source = getSourceModel(this.conn);
    await Source.findOneAndUpdate(
      { _id: sourceId },
      {
        $set: {
          _id: sourceId,
          source_id: record.source_id,
          origin_type: record.origin_type,
          trust_level: record.trust_level,
          sender: record.sender,
          is_tainted: record.is_tainted,
          timestamp: record.timestamp,
        },
      },
      { upsert: true, new: true }
    );
    return record;
  }

  async getSource(sourceId: string): Promise<DataProvenance | undefined> {
    if (!this.conn) {
      return this.mem.get(sourceId);
    }
    const Source = getSourceModel(this.conn);
    const doc = await Source.findById(sourceId).lean();
    if (!doc) return undefined;
    return {
      source_id: doc.source_id,
      origin_type: doc.origin_type,
      trust_level: doc.trust_level,
      sender: doc.sender,
      is_tainted: doc.is_tainted,
      timestamp: doc.timestamp,
    };
  }

  async checkExecutionPermission(
    sourceId: string,
    actionType: string
  ): Promise<{ allowed: boolean; reason: string }> {
    const source = await this.getSource(sourceId);
    if (!source) {
      return {
        allowed: false,
        reason: "Unknown source. Defaulting to strict quarantine.",
      };
    }

    if (source.is_tainted && SENSITIVE_ACTIONS.has(actionType)) {
      return {
        allowed: false,
        reason: `Action '${actionType}' triggered by Low-Trust origin (${source.origin_type} from '${source.sender}'). Out-of-band human authorization required.`,
      };
    }

    return { allowed: true, reason: "Authorized by source trust." };
  }
}
