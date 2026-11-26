import mongoose, { type Connection, type Model, Schema } from "mongoose";
import type { TrustLevel } from "../types.js";

export interface SourceDoc {
  _id: string;
  source_id: string;
  origin_type: string;
  trust_level: TrustLevel;
  sender: string | null;
  is_tainted: boolean;
  timestamp: number;
}

export const SourceSchema = new Schema<SourceDoc>(
  {
    _id: { type: String, required: true },
    source_id: { type: String, required: true, unique: true },
    origin_type: { type: String, required: true },
    trust_level: { type: String, enum: ["FULL", "MEDIUM", "LOW"], required: true },
    sender: { type: String, default: null },
    is_tainted: { type: Boolean, required: true },
    timestamp: { type: Number, required: true },
  },
  { collection: "sources", versionKey: false }
);

export function getSourceModel(conn: Connection = mongoose.connection): Model<SourceDoc> {
  return (conn.models.Source as Model<SourceDoc>) || conn.model<SourceDoc>("Source", SourceSchema);
}
