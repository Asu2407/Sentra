# Sentra (MERN Stack: MongoDB, Express, React, Node.js)

Zero-trust out-of-band human consent layer for autonomous AI actions. Both the stdio MCP server (`apps/mcp`) and the Express API (`apps/api`) share the same MongoDB database via `@sentra/core`.

## Setup

```bash
cd sentra
cp .env.example .env
npm install
npm run build
npm test
```

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | *(required)* | MongoDB connection string shared by `apps/api` and `apps/mcp`. |
| `SENTRA_UI_URL` | `http://127.0.0.1:8001` | Base URL used by `propose_action` to build `review_url`. |
| `PORT` | `8001` | Port for the Express API (and production React app). |
| `WEB_ORIGIN` | `http://127.0.0.1:5173` | Allowed CORS origin in development (`NODE_ENV !== "production"`). |
| `SENTRA_APPROVER_PASSWORD` | *(required in prod, >= 12 chars)* | Password for `POST /api/login` (`local-approver`). |
| `SENTRA_SESSION_SECRET` | *(required in prod, >= 32 chars)* | HMAC-SHA256 secret signing the `httpOnly` session cookie. |
| `SENTRA_MCP_TOKEN` | *(required in prod, >= 32 chars)* | Bearer token required in `Authorization: Bearer <token>` for `/mcp`. |
| `SENTRA_TOKEN_KEY` | *(required in prod, 32-byte base64)* | AES-256-GCM key encrypting stored Google OAuth tokens in MongoDB. |
| `SENTRA_ENABLE_LIVE_EXECUTION` | `false` | Must be `true` (plus a connected Google account) to switch from `sandbox` to `live` writes. |
| `GOOGLE_CLIENT_ID` | *(optional)* | Google OAuth client ID for `/api/oauth/google/start`. |
| `GOOGLE_CLIENT_SECRET` | *(optional)* | Google OAuth client secret for `/api/oauth/google/callback`. |
| `GOOGLE_REDIRECT_URI` | `<origin>/api/oauth/google/callback` | Override OAuth redirect URI behind a reverse proxy. |
| `SENTRA_ENABLE_GMAIL_SCOPE` | `false` | Set `true` to also request `https://www.googleapis.com/auth/gmail.send` during Google OAuth. |
| `ELEVENLABS_API_KEY` | *(optional)* | ElevenLabs API key for humanized TTS voice summaries on `POST /api/voice/speak`. |
| `ELEVENLABS_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM` | Optional ElevenLabs voice ID for scam/email voice summaries. |

### Minimum Google OAuth Scopes
- `https://www.googleapis.com/auth/calendar.events` (create/update approved calendar events)
- `https://www.googleapis.com/auth/userinfo.email` (display connected account email in status)
- `https://www.googleapis.com/auth/gmail.send` *(optional, only requested when `SENTRA_ENABLE_GMAIL_SCOPE=true`)*

## Running Locally

1. Start the Express API on port `8001`:
   ```bash
   npm run dev:api
   ```
2. Start the React + Vite dev server on port `5173` (proxies `/api` to `8001`):
   ```bash
   npm run dev:web
   ```
3. Or run with Docker Compose (MongoDB + Sentra API + built React app):
   ```bash
   SENTRA_APPROVER_PASSWORD=your-strong-12-char-pass \
   SENTRA_SESSION_SECRET=your-random-32-character-session-secret-key \
   docker compose up --build
   ```
   Verify health: `curl http://127.0.0.1:8001/healthz` -> `{"status":"ok","db":"connected"}`.

## Deploying to Production (Render / Railway + MongoDB Atlas)

> **Note:** Do not deploy the Express API to serverless platforms like Vercel; use a persistent Node web service (Render via `render.yaml` or Railway).

1. **Create a MongoDB Atlas Free Cluster (M0)**:
   - Create a database user with **`readWrite` permissions on the `sentra` database only** (not cluster-wide admin).
   - Under **Network Access**, add your hosting provider's egress IPs (or temporarily `0.0.0.0/0` during initial setup, then tighten it to your host's egress IPs).
   - Copy the `mongodb+srv://...` connection string (pointing to `/sentra`).
2. **Configure the Web Service (`render.yaml`)**:
   - Connect the repository to Render (using `sentra/render.yaml`) or Railway.
   - Set environment variables in the host dashboard (never commit them):
     - `NODE_ENV=production`
     - `PORT=8001`
     - `MONGODB_URI=<your-atlas-uri>`
     - `SENTRA_UI_URL=https://<your-deployed-domain>`
     - `SENTRA_APPROVER_PASSWORD=<12+ char secret>`
     - `SENTRA_SESSION_SECRET=<32+ char random secret>`
3. **Deploy & Sign In**:
   - Deploy and confirm `GET /healthz` returns `200 {"status":"ok","db":"connected"}`.
   - Open `https://<your-deployed-domain>/dashboard` and sign in with `SENTRA_APPROVER_PASSWORD`.

### Option A: Netlify Frontend + Render Backend (with `netlify.toml`)
1. Deploy the backend on Render using `sentra/render.yaml` and copy its URL (e.g., `https://sentra-gateway.onrender.com`).
2. Connect the repository to Netlify (uses root `netlify.toml`).
3. In Netlify **Environment variables**, set `SENTRA_API_URL=https://sentra-gateway.onrender.com` so `/api/*`, `/mcp`, and `/healthz` proxy cleanly to Render.
4. Set `SENTRA_UI_URL=https://<your-site>.netlify.app` on Render so `propose_action` links and `/mcp` `Origin`/`Host` checks match your Netlify domain.

## Connecting VS Code / Antigravity to Sentra MCP

### Option A: HTTP API (`/mcp` with Bearer Token — Recommended)
- **VS Code** (`.vscode/mcp.json`):
  ```json
  {
    "servers": {
      "sentra": {
        "type": "http",
        "url": "http://127.0.0.1:8001/mcp",
        "headers": {
          "Authorization": "Bearer ${input:sentra_mcp_token}"
        }
      }
    }
  }
  ```
- **Antigravity / Cursor** (`mcp_config.json`):
  ```json
  {
    "mcpServers": {
      "sentra": {
        "serverUrl": "https://<your-deployed-domain>/mcp",
        "headers": {
          "Authorization": "Bearer <YOUR_SENTRA_MCP_TOKEN>"
        }
      }
    }
  }
  ```

### Option B: Local `stdio` MCP Server
The stdio MCP server runs locally and shares the same MongoDB database as your UI:

```json
{
  "mcpServers": {
    "sentra": {
      "command": "node",
      "args": ["C:/path/to/sentra/apps/mcp/dist/server.js"],
      "env": {
        "MONGODB_URI": "mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/sentra",
        "SENTRA_UI_URL": "https://<your-deployed-domain>"
      }
    }
  }
}
```

## Curl Transcript (Auth, State, Approve, Replay 409, Unauthenticated 401)

```bash
# 1. Approve without login -> 401
curl -i -X POST http://127.0.0.1:8001/api/proposals/P1/approve
# HTTP/1.1 401 Unauthorized
# {"detail":"Authentication required"}

# 2. Read-only state (no login required, no secrets/tokens)
curl -s http://127.0.0.1:8001/api/state
# {"proposals":[...],"quarantine":[...],"audit":[...],"chain_valid":true,"unapproved_writes_executed":0,"selftest":true}

# 3. Sign in and capture cookie + CSRF token
curl -i -c cookies.txt -X POST http://127.0.0.1:8001/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"<YOUR_APPROVER_PASSWORD>"}'
# HTTP/1.1 200 OK
# {"ok":true,"user":"local-approver","csrf":"<CSRF_TOKEN>"}

# 4. Approve P1 with session cookie + X-Sentra-CSRF -> 200
curl -i -b cookies.txt -X POST http://127.0.0.1:8001/api/proposals/P1/approve \
  -H "X-Sentra-CSRF: <CSRF_TOKEN>"
# HTTP/1.1 200 OK
# {"audit":{"n":4,"actor":"local-approver","text":"approved P1 at ...","hash":"...","prev_hash":"...","denied":false}}

# 5. Replay same approval -> 409 Conflict
curl -i -b cookies.txt -X POST http://127.0.0.1:8001/api/proposals/P1/approve \
  -H "X-Sentra-CSRF: <CSRF_TOKEN>"
# HTTP/1.1 409 Conflict
# {"detail":"Proposal is already APPROVED"}
```
