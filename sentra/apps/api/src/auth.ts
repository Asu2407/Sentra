import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const SESSION_COOKIE_NAME = "sentra_session";
export const APPROVER_USER_ID = "local-approver";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionPayload {
  sub: string;
  sid: string;
  csrf: string;
  exp: number;
}

export interface AuthConfig {
  approverPassword: string;
  sessionSecret: string;
  mcpToken?: string;
  tokenEncryptionKey?: string;
  liveGoogleWrites?: boolean;
  isProduction: boolean;
}

export function loadAuthConfig(): AuthConfig {
  const isProduction = process.env.NODE_ENV === "production";
  const password = process.env.SENTRA_APPROVER_PASSWORD?.trim() ?? "";
  const secret = process.env.SENTRA_SESSION_SECRET?.trim() ?? "";
  const mcpToken = process.env.SENTRA_MCP_TOKEN?.trim() ?? "";
  const tokenEncryptionKey =
    process.env.SENTRA_TOKEN_KEY?.trim() ??
    process.env.SENTRA_TOKEN_ENCRYPTION_KEY?.trim() ??
    "";
  const liveGoogleWrites =
    process.env.SENTRA_ENABLE_LIVE_EXECUTION === "true" ||
    process.env.SENTRA_LIVE_GOOGLE_WRITES === "true";

  if (isProduction) {
    if (!process.env.MONGODB_URI?.trim()) {
      throw new Error("MONGODB_URI must be set in production.");
    }
    if (password.length < 12) {
      throw new Error(
        "SENTRA_APPROVER_PASSWORD must be set and at least 12 characters in production."
      );
    }
    if (secret.length < 32) {
      throw new Error(
        "SENTRA_SESSION_SECRET must be set and at least 32 characters in production."
      );
    }
    if (mcpToken.length < 32) {
      throw new Error(
        "SENTRA_MCP_TOKEN must be set and at least 32 characters in production."
      );
    }
    const decodedKey = Buffer.from(tokenEncryptionKey, "base64");
    const isValidBase64Key =
      decodedKey.length === 32 &&
      decodedKey.toString("base64").replace(/=+$/, "") ===
        tokenEncryptionKey.replace(/=+$/, "");
    if (!isValidBase64Key) {
      throw new Error(
        "SENTRA_TOKEN_KEY must be set to 32 random bytes encoded as base64 in production."
      );
    }
  }

  return {
    approverPassword: password || "sentra-dev-password-12",
    sessionSecret: secret || "sentra-dev-session-secret-0123456789abcdef",
    mcpToken: mcpToken || "sentra-dev-mcp-token-0123456789abcdef",
    tokenEncryptionKey:
      tokenEncryptionKey || "sentra-dev-token-encryption-key-0123456789",
    liveGoogleWrites,
    isProduction,
  };
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a, "utf8").digest();
  const hashB = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function signSession(payload: SessionPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(encoded, "utf8")
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySession(token: string | undefined, secret: string): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(encoded, "utf8")
    .digest("base64url");

  if (!timingSafeEqualStrings(sig, expectedSig)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed || typeof parsed.exp !== "number" || Date.now() > parsed.exp) {
      return null;
    }
    if (!parsed.sub || !parsed.csrf || !parsed.sid) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createSessionPayload(): SessionPayload {
  return {
    sub: APPROVER_USER_ID,
    sid: crypto.randomBytes(16).toString("hex"),
    csrf: crypto.randomBytes(24).toString("base64url"),
    exp: Date.now() + SESSION_MAX_AGE_MS,
  };
}

export function setSessionCookie(
  res: Response,
  token: string,
  isProduction: boolean
): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

export interface AuthenticatedRequest extends Request {
  approverSession?: SessionPayload;
}

export function requireApprover(secret: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const rawCookie = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    const session = verifySession(rawCookie, secret);
    if (!session) {
      res.status(401).json({ detail: "Authentication required" });
      return;
    }
    req.approverSession = session;
    next();
  };
}

export function requireApproverAndCsrf(secret: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const rawCookie = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    const session = verifySession(rawCookie, secret);
    if (!session) {
      res.status(401).json({ detail: "Authentication required" });
      return;
    }

    const csrfHeader = req.header("X-Sentra-CSRF") ?? "";
    if (!csrfHeader || !timingSafeEqualStrings(csrfHeader, session.csrf)) {
      res.status(403).json({ detail: "Invalid or missing X-Sentra-CSRF header" });
      return;
    }

    req.approverSession = session;
    next();
  };
}

export function requireMcpBearer(expectedToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (!match || !timingSafeEqualStrings(match[1], expectedToken)) {
      res.status(401).end();
      return;
    }
    next();
  };
}
