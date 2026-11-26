import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "v1";

function deriveAesKey(secret: string): Buffer {
  const trimmed = secret.trim();
  const decoded = Buffer.from(trimmed, "base64");
  if (
    decoded.length === 32 &&
    decoded.toString("base64").replace(/=+$/, "") === trimmed.replace(/=+$/, "")
  ) {
    return decoded;
  }
  return crypto.createHash("sha256").update(trimmed, "utf8").digest();
}

export function encryptToken(plaintext: string, keySecret: string): string {
  const key = deriveAesKey(keySecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptToken(payload: string, keySecret: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Invalid encrypted token format");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = deriveAesKey(keySecret);
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const ct = Buffer.from(ctB64, "base64url");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
