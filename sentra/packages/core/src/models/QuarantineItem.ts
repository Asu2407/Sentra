import mongoose, { type Connection, type Model, Schema } from "mongoose";

export interface QuarantineItemDoc {
  _id: string;
  id: string;
  title: string;
  reason: string;
  status: "QUARANTINED" | "RESTORED";
}

export const QuarantineItemSchema = new Schema<QuarantineItemDoc>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: ["QUARANTINED", "RESTORED"],
      required: true,
      default: "QUARANTINED",
    },
  },
  { collection: "quarantine", versionKey: false }
);

export function getQuarantineItemModel(
  conn: Connection = mongoose.connection
): Model<QuarantineItemDoc> {
  return (
    (conn.models.QuarantineItem as Model<QuarantineItemDoc>) ||
    conn.model<QuarantineItemDoc>("QuarantineItem", QuarantineItemSchema)
  );
}
