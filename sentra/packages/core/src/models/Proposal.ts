import mongoose, { type Connection, type Model, Schema } from "mongoose";
import type { ProposalStatus } from "../types.js";

export interface ProposalDoc {
  _id: string;
  proposal_id: string;
  action_type: string;
  summary: string;
  diff_preview: Record<string, unknown>;
  source_id: string;
  created_at: number;
  expires_at: number;
  status: ProposalStatus;
}

export const ProposalSchema = new Schema<ProposalDoc>(
  {
    _id: { type: String, required: true },
    proposal_id: { type: String, required: true, unique: true },
    action_type: { type: String, required: true },
    summary: { type: String, required: true },
    diff_preview: { type: Schema.Types.Mixed, required: true },
    source_id: { type: String, required: true },
    created_at: { type: Number, required: true },
    expires_at: { type: Number, required: true },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "EXPIRED"],
      required: true,
    },
  },
  { collection: "proposals", versionKey: false }
);

export function getProposalModel(conn: Connection = mongoose.connection): Model<ProposalDoc> {
  return (
    (conn.models.Proposal as Model<ProposalDoc>) ||
    conn.model<ProposalDoc>("Proposal", ProposalSchema)
  );
}
