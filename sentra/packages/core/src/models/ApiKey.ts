import mongoose, { type Connection, type Model, Schema } from "mongoose";

export interface ApiKeyDoc {
  _id: string;
  name: string;
  prefix: string;
  key_hash: string;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export const ApiKeySchema = new Schema<ApiKeyDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    prefix: { type: String, required: true },
    key_hash: { type: String, required: true, unique: true },
    created_by: { type: String, required: true },
    created_at: { type: String, required: true },
    last_used_at: { type: String, default: null },
    revoked_at: { type: String, default: null },
  },
  { collection: "api_keys", versionKey: false }
);

export function getApiKeyModel(
  conn: Connection = mongoose.connection
): Model<ApiKeyDoc> {
  return (
    (conn.models.ApiKey as Model<ApiKeyDoc>) ||
    conn.model<ApiKeyDoc>("ApiKey", ApiKeySchema)
  );
}
