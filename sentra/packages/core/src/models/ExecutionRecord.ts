import mongoose, { type Connection, type Model, Schema } from "mongoose";

export interface ExecutionRecordDoc {
  proposal_id: string;
  action_type: string;
  adapter: string;
  detail: string;
  external_id: string | null;
  executed_at: string;
}

export const ExecutionRecordSchema = new Schema<ExecutionRecordDoc>(
  {
    proposal_id: { type: String, required: true, unique: true },
    action_type: { type: String, required: true },
    adapter: { type: String, required: true },
    detail: { type: String, required: true },
    external_id: { type: String, default: null },
    executed_at: { type: String, required: true },
  },
  { collection: "executions", versionKey: false }
);

export function getExecutionRecordModel(
  conn: Connection = mongoose.connection
): Model<ExecutionRecordDoc> {
  return (
    (conn.models.ExecutionRecord as Model<ExecutionRecordDoc>) ||
    conn.model<ExecutionRecordDoc>("ExecutionRecord", ExecutionRecordSchema)
  );
}
