import mongoose, { type Connection, type Model, Schema } from "mongoose";

export interface AuditEntryDoc {
  n: number;
  actor: string;
  text: string;
  hash: string;
  prev_hash: string;
  denied: boolean;
}

export const AuditEntrySchema = new Schema<AuditEntryDoc>(
  {
    n: { type: Number, required: true, unique: true },
    actor: { type: String, required: true },
    text: { type: String, required: true },
    hash: { type: String, required: true },
    prev_hash: { type: String, required: true },
    denied: { type: Boolean, required: true, default: false },
  },
  { collection: "audit_entries", versionKey: false }
);

export function getAuditEntryModel(
  conn: Connection = mongoose.connection
): Model<AuditEntryDoc> {
  return (
    (conn.models.AuditEntry as Model<AuditEntryDoc>) ||
    conn.model<AuditEntryDoc>("AuditEntry", AuditEntrySchema)
  );
}
