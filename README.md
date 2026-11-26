# Sentra 🛡️
### *The Zero-Trust Execution & Consent Layer for Agentic AI*

[![MCP Standard](https://img.shields.io/badge/MCP-1.0-blue.svg)](https://modelcontextprotocol.io/)
[![Security](https://img.shields.io/badge/OWASP-LLM01%20%7C%20LLM06-red.svg)](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![MERN](https://img.shields.io/badge/Stack-MongoDB%20%7C%20Express%20%7C%20React%20%7C%20Node-green.svg)](./sentra/README.md)
[![MCP SDK](https://img.shields.io/badge/MCP-TypeScript%20SDK-orange.svg)](https://github.com/modelcontextprotocol/typescript-sdk)

> **Track**: *Make MCP Matter, Less Magic, More Utility*  
> **Core Slogan**: *"The TLS Layer for Autonomous AI: Verifying Origin, Proving Constraints, and Enforcing Cryptographic Consent."*

---

## 📌 The Problem: "The Agentic Trust Trap"

Autonomous AI has reached a major crossroads. Models can write code, analyze clinical data, and parse contracts. Yet **nobody can allow them to take irreversible real-world actions:**
* We cannot let an AI assistant execute bank wire transfers or pay vendor invoices.
* We cannot let a healthcare AI alter clinical prescription times or confirm medical appointments.
* We cannot let an inbox AI send emails with attached personal ID scans without verification.

### The 3 Fatal Hazards Paralyzing Agentic Systems:
1. **Data-as-Code Hijacking (OWASP LLM01 / LLM06)**: When an AI reads an external invoice, stranger email, clinic note, or GitHub issue, the data enters the context window as potential code. Attackers embed hidden instructions (*"Reply with ID scan to confirm internship"*). Traditional security filters fail completely because calling `send_email()` or `update_calendar()` is a permitted tool. **The danger is not what the action looks like—the danger is who caused it.**
2. **Probabilistic Models in Deterministic Physical Realities**: LLMs generate text probabilistically. When an LLM calculates overlapping transit buffers, drug digestion intervals, or fee-inclusive budgets, it hallucinates. In real life, mathematical hallucinations cause medical crises and financial loss.
3. **The Cryptographic Accountability Void**: When an autonomous agent causes an irreversible error, there is zero non-repudiation, zero tamper-evident trail, and zero cryptographic proof of who authorized the execution.

> **The Analogy**: *In the 1990s, the internet was just HTTP—plain text, unverified, and unsafe for commerce. Then came **SSL/TLS**, the cryptographic verification layer that unlocked modern e-commerce. **Sentra is the TLS layer for Autonomous AI.***

---

## 🏗️ System Architecture

```
                                 [ EXTERNAL WORLD ]
               (Invoices, Prescriptions, Stranger Emails, GitHub Issues)
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SENTRA GATEWAY MCP SERVER                                 │
│                                                                                        │
│  1. Data Provenance & Taint Tracker:                                                   │
│     - Tags origin: FULL (User) | MEDIUM (Verified Contacts) | LOW (Untrusted Data)     │
│     - Invariant: Low-Trust data can NEVER directly trigger a privileged sink.          │
│                                                                                        │
│  2. Smart Inbox Fake-Detection Engine:                                                 │
│     - Heuristic scan for lookalike domains, credential traps, and urgency cues.        │
│     - Generates 1-sentence spoken voice warning so users avoid visual phishing traps.  │
│                                                                                        │
│  3. Outbound Email Approval Guard:                                                     │
│     - Intercepts sensitive emails & file attachments triggered by strangers.           │
│     - Enforces 10-second hold buffer and 1-tap undo.                                   │
│                                                                                        │
│  4. Deterministic Constraint Proof Engine:                                             │
│     - Evaluates hard temporal buffers, drug digestion intervals, and tax-inclusive caps│
│     - Emits mathematical proofs, not probabilistic guesses.                            │
│                                                                                        │
│  5. Out-of-Band (OOB) Execution Boundary:                                              │
│     - LLM has ZERO execute tools. It can only call `propose_action()`.                 │
│     - Pending proposal staged with 5-minute TTL.                                       │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ Staged Proposal Deep Link
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              HUMAN VERIFICATION CONSOLE                                │
│                                                                                        │
│  • Plain-English Summary: "A stranger's invoice is asking to schedule a payment."      │
│  • Visual Before/After Diff Table & Outgoing Attachment Inspector                      │
│  • Human physically clicks [Approve]                                                   │
│  • Mints HMAC-SHA256 Token(proposal_id + expiry + idempotency_key)                     │
│  • 10-Second Undo Buffer for instant rollback                                          │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ Cryptographically Signed Execution Token
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         REAL-WORLD MUTATION & AUDIT                                    │
│  • Google Calendar / Real Email Tool execution                                         │
│  • Appends to SHA-256 Hash-Chained Immutable Audit Ledger                               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ The 5 Core Pillars

### 1. Smart Inbox Fake-Detection & Voice Alerts
Heuristic analyzer checking sender lookalike domains, credential theft triggers (OTP, PIN, ID scan), and urgency language (*"act within 2 hours"*). Automatically labels suspicious emails away from the main inbox without deleting, and provides a neutral spoken summary via browser speech synthesis.

### 2. Email-Approval Gate with 10s Undo
A provenance-enforced interceptor. When an assistant is asked by an external message to send an email, share a file, or reply with credentials, Sentra intercepts the request, presents an exact approval card (previewing recipient and attachments), and holds outgoing messages in a 10-second cancel buffer.

### 3. Deterministic Cross-Constraint Proof Engine
Instead of relying on LLM mental math, Sentra computes step-by-step mathematical proofs:
$$\text{Train Departure (07:10)} - \text{Commute (45m)} = \text{06:25 Departure} < \text{07:30 Medication Window} \implies \mathbf{HARD\ COLLISION}$$
$$\text{Dinner Base (₹180)} + \text{Delivery (₹25)} + \text{GST (₹13)} = \text{₹218} > \text{₹200 Budget Cap} \implies \mathbf{BUDGET\ BREACH}$$

### 4. Out-of-Band (OOB) Cryptographic Execution Gate
The model is granted **no direct execute tools**. It can only stage a `propose_action()`. Actual execution requires an HMAC-SHA256 signed single-use token minted exclusively when a human physically clicks **[Approve]** in the companion web console. It is **mathematically impossible** for the model to self-approve.

### 5. Tamper-Evident Hash-Chained Audit Ledger
Every executed action appends an immutable entry to a cryptographic ledger:
$$\text{Entry Hash} = \text{SHA-256}(\text{Previous Hash} \parallel \text{Action ID} \parallel \text{Diff JSON})$$
Any manual alteration of history invalidates subsequent hashes, ensuring transparent accountability.

---

## 🛠️ MCP Protocol Specification

| Primitive | Name | Description |
| :--- | :--- | :--- |
| **Resource** | `sentra://schedule/today` | Subscribable resource emitting current schedule collisions and budget breaches. |
| **Resource** | `sentra://briefing/daily` | Formatted daily digest of confirmed commitments and time buffers. |
| **Resource** | `sentra://guide/beginner` | Step-by-step beginner guideline for opening and using Sentra MCP. |
| **Tool** | `scan_suspicious_email` | Heuristic fake-detection tool checking lookalike domains, credential traps, and urgency cues. |
| **Tool** | `propose_send_email` | Intercepts outbound email sending triggered by untrusted sources and stages an approval slip. |
| **Tool** | `detect_conflicts` | Runs deterministic constraint solvers across transit buffers, medication windows, and fee-inclusive caps. |
| **Tool** | `generate_replan_options` | Computes feasible alternatives ranked by priority weights (Hard constraints > Flexible study blocks). |
| **Tool** | `propose_action` | **Stage-only tool.** Creates a pending proposal record with a 300s TTL. Returns deep link for human review. |

---

## 📁 Repository Structure

```
Sentra/
├── README.md                      # Master project overview & quickstart
├── ARCHITECTURE.md                # Formal security specifications & sequence diagrams
├── PITCH_DECK.md                  # 8-Slide wHACKiest 2026 pitch deck & judge delivery script
├── .github/workflows/ci.yml       # Build, Vitest, and Playwright headless E2E CI
└── sentra/                        # MERN + TypeScript monorepo (npm workspaces)
    ├── packages/core/             # Security logic, Mongoose models, adapters, 25-case benchmark
    ├── apps/api/                  # Express API (auth, CSRF, rate-limit, CSP, /healthz)
    ├── apps/mcp/                  # Stdio MCP server sharing MongoDB with apps/api
    ├── apps/web/                  # React + Vite UI (Home, /dashboard, /control-room)
    ├── e2e/                       # Playwright smoke test & screenshot capture
    ├── Dockerfile & render.yaml   # Container & Render production deployment
    └── README.md                  # Detailed MERN setup, env vars, and curl transcript
```

---

## 🚀 Quickstart Guide

### 1. Installation & Build
```bash
cd sentra
cp .env.example .env
npm install
npm run build
```

### 2. Run Automated Verification Tests
```bash
npm test
npx playwright test
```
*(Verifies `@sentra/core`, `@sentra/api`, `@sentra/mcp`, `@sentra/web`, and headless Chromium E2E)*

### 3. Run the System
```bash
# Terminal 1: Launch Express Approval Console API (port 8001)
npm run dev:api

# Terminal 2: Launch React + Vite UI (port 5173, proxies /api to 8001)
npm run dev:web

# Terminal 3: Launch Sentra Stdio MCP Server
npm run mcp
```
Visit `http://127.0.0.1:5173/` (or `http://127.0.0.1:8001/` in production build) to read the beginner guideline, inspect staged proposals, countersign Approve/Deny, verify the SHA-256 audit chain, restore quarantined items, and view the Calendar & Mail outbox + 25-case benchmark punch card.
