import mongoose, { type Connection, type Model, Schema } from "mongoose";

export interface ConsumedKeyDoc {
  _id: string;
  consumed_at: number;
}

export const ConsumedKeySchema = new Schema<ConsumedKeyDoc>(
  {
    _id: { type: String, required: true },
    consumed_at: { type: Number, required: true },
  },
  { collection: "consumed_keys", versionKey: false }
);

export function getConsumedKeyModel(
  conn: Connection = mongoose.connection
): Model<ConsumedKeyDoc> {
  return (
    (conn.models.ConsumedKey as Model<ConsumedKeyDoc>) ||
    conn.model<ConsumedKeyDoc>("ConsumedKey", ConsumedKeySchema)
  );
}
