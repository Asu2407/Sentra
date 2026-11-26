import mongoose, { type Connection, type Model, Schema } from "mongoose";

export interface OAuthTokenDoc {
  _id: string;
  provider: "google";
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
  scope: string;
  email: string | null;
  updated_at: string;
}

export const OAuthTokenSchema = new Schema<OAuthTokenDoc>(
  {
    _id: { type: String, required: true },
    provider: { type: String, enum: ["google"], required: true },
    access_token: { type: String, required: true },
    refresh_token: { type: String, default: null },
    expires_at: { type: Number, default: null },
    scope: { type: String, default: "" },
    email: { type: String, default: null },
    updated_at: { type: String, required: true },
  },
  { collection: "oauth_tokens", versionKey: false }
);

export function getOAuthTokenModel(
  conn: Connection = mongoose.connection
): Model<OAuthTokenDoc> {
  return (
    (conn.models.OAuthToken as Model<OAuthTokenDoc>) ||
    conn.model<OAuthTokenDoc>("OAuthToken", OAuthTokenSchema)
  );
}
