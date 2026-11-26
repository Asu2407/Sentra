import crypto from "node:crypto";

export const SERVER_NAME = "Sentra-Gateway";
export const SERVER_INSTRUCTIONS =
  "Sentra-Gateway is an out-of-band human consent layer for autonomous AI actions. " +
  "Read operations are allowed freely, but all state-changing writes (such as calendar updates, " +
  "outbound emails, or payments) are staged as pending proposals with a 300-second TTL and " +
  "cannot execute until a human approves them in the Sentra UI.";

export const ENV_MONGODB_URI = "MONGODB_URI";
export const ENV_SENTRA_UI_URL = "SENTRA_UI_URL";
export const ENV_PORT = "PORT";
export const DEFAULT_UI_URL = "http://127.0.0.1:8001";
export const DEFAULT_PORT = 8001;

export const SECRET_KEY = "safeguard-os-demo-secret-key-judge-hardened";
export const TOKEN_TTL_SECONDS = 300;
export const PROPOSAL_TTL_SECONDS = TOKEN_TTL_SECONDS;

export const GENESIS_HASH = crypto
  .createHash("sha256")
  .update("GENESIS_BLOCK_SENTRA_OS", "utf8")
  .digest("hex");

export const SENSITIVE_ACTIONS = new Set([
  "delete_event",
  "update_calendar",
  "create_event",
  "send_email",
  "pay",
]);

export const SRC_USER_CHAT = "SRC_USER_CHAT";
export const SRC_TRAIN_TICKET = "SRC_TRAIN_TICKET";
export const SRC_STRANGER_EMAIL = "SRC_STRANGER_EMAIL";

export const MSG_STAGED_FOR_APPROVAL =
  "Action staged. Please open the review URL in Sentra UI to authorize via single-use HMAC token.";
export const SECURITY_ALERT_LOW_TRUST =
  "Unauthorized sensitive action attempted from Low-Trust source. Blocked cold.";
