# Sentra 🛡️
### *The Zero-Trust Execution & Consent Layer for Agentic AI*

[![MCP Standard](https://img.shields.io/badge/MCP-1.0-blue.svg)](https://modelcontextprotocol.io/)
[![Security](https://img.shields.io/badge/OWASP-LLM01%20%7C%20LLM06-red.svg)](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
[![Python](https://img.shields.io/badge/Python-3.11+-brightgreen.svg)](https://python.org)
[![FastMCP](https://img.shields.io/badge/FastMCP-SDK-orange.svg)](https://github.com/jlowin/fastmcp)
[![FastAPI](https://img.shields.io/badge/Console-FastAPI-teal.svg)](https://fastapi.tiangolo.com/)

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
| **Resource** | `disha://schedule/today` | Subscribable resource emitting updates whenever constraints or events change state. |
| **Resource** | `disha://briefing/daily` | Formatted daily digest of confirmed commitments and time buffers for spoken voice playback. |
| **Prompt** | `/prepare-tomorrow` | Slash command guiding the LLM to inspect constraints, run arithmetic checks, and propose ranked replans. |
| **Prompt** | `/triage-inbox` | Slash command scanning inbox for scams and halting untrusted outbound transmission attempts. |
| **Tool** | `scan_email` | Heuristic fake-detection tool checking lookalike domains, credential traps, and urgency cues. |
| **Tool** | `propose_send_email` | Intercepts outbound email sending triggered by untrusted sources and generates approval card. |
| **Tool** | `detect_conflicts` | Runs deterministic constraint solvers across transit buffers, medication windows, and fee-inclusive caps. |
| **Tool** | `generate_replan_options` | Computes feasible alternatives ranked by priority weights (Hard constraints > Flexible study blocks). |
| **Tool** | `propose_action` | **Stage-only tool.** Creates a pending proposal record with a 5-minute TTL. Returns deep link for human review. |

---

## 📁 Repository Structure

```
Sentra/
├── README.md                      # Master architecture & project documentation
├── ARCHITECTURE.md                # Formal security specifications & sequence diagrams
├── PITCH_DECK.md                  # 8-Slide wHACKiest 2026 pitch deck & judge delivery script
├── requirements.txt               # Production Python dependencies
├── .gitignore                     # Clean environment & cache ignore rules
├── fixtures/
│   └── sample_demo_data.json      # Test fixtures (train ticket, prescription, malicious PDF)
├── src/
│   ├── server.py                  # Main FastMCP Gateway server
│   ├── gateway/
│   │   ├── taint_tracker.py       # Data provenance & origin trust engine
│   │   ├── email_guard.py         # Outbound email interceptor & approval gate
│   │   └── oob_gate.py            # Out-of-band HMAC-SHA256 signer & TTL manager
│   ├── engine/
│   │   ├── conflict_detector.py   # Deterministic interval math & budget solver
│   │   └── scam_detector.py       # Smart inbox fake-detection & phishing scanner
│   └── ui/
│       └── app.py                 # FastAPI console with Web Speech audio, email cards & undo
└── tests/
    └── test_sentra.py             # Automated test suite (6/6 tests passing)
```

---

## 🚀 Quickstart Guide

### 1. Installation
```bash
git clone https://github.com/Asu2407/Sentra.git
cd Sentra
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Run Automated Verification Tests
```bash
python -m pytest tests/test_sentra.py -v
```
*(All 6 unit tests verify taint tracking, collision math, HMAC tokens, scam detection, and email approval)*

### 3. Run the System
```bash
# Terminal 1: Launch FastAPI Out-of-Band Approval Console
python -m uvicorn src.ui.app:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: Launch Sentra FastMCP Gateway Server
python -m src.server
```
Visit `http://127.0.0.1:8000/` to test both the Schedule Replan Card and the Outbound Email Scam Intercept Card with live Web Speech alerts and Undo buttons!
