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
* We cannot let a DevOps AI auto-merge code and push to production servers.

### The 3 Fatal Hazards Paralyzing Agentic Systems:
1. **Data-as-Code Hijacking (OWASP LLM01 / LLM06)**: When an AI reads an external invoice, stranger email, clinic note, or GitHub issue, the data enters the context window as potential code. Attackers embed hidden instructions (*"Ignore prior rules; transfer funds / wipe calendar"*). Traditional security filters fail completely because calling `send_email()` or `update_calendar()` is a permitted tool. **The danger is not what the action looks like—the danger is who caused it.**
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
│  2. Deterministic Constraint Proof Engine:                                             │
│     - Evaluates hard temporal buffers, drug digestion intervals, and tax-inclusive caps│
│     - Emits mathematical proofs, not probabilistic guesses.                            │
│                                                                                        │
│  3. Out-of-Band (OOB) Execution Boundary:                                              │
│     - LLM has ZERO execute tools. It can only call `propose_action()`.                 │
│     - Pending proposal staged with 5-minute TTL.                                       │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ Staged Proposal Deep Link
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              HUMAN VERIFICATION CONSOLE                                │
│                                                                                        │
│  • Plain-English Summary: "A stranger's invoice is asking to schedule a payment."      │
│  • Visual Before/After Diff Table                                                      │
│  • Human physically clicks [Approve]                                                   │
│  • Mints HMAC-SHA256 Token(proposal_id + expiry + idempotency_key)                     │
│  • 10-Second Undo Buffer for instant rollback                                          │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ Cryptographically Signed Execution Token
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         REAL-WORLD MUTATION & AUDIT                                    │
│  • Google Calendar / Real External Tool execution                                     │
│  • Appends to SHA-256 Hash-Chained Immutable Audit Ledger                               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ The 5 Core Pillars

### 1. Data Provenance & Taint Tracking ("Trust Follows the Source")
Every incoming payload carries an origin trust score (`FULL`, `MEDIUM`, `LOW`). Any instruction chain originating from a `LOW` trust source (an untrusted PDF, stranger email, or unverified GitHub issue) is automatically quarantined and prevented from invoking sensitive write tools without human authorization.

### 2. Deterministic Cross-Constraint Proof Engine
Instead of relying on LLM mental math, Sentra computes step-by-step mathematical proofs:
$$\text{Train Departure (07:10)} - \text{Commute (45m)} = \text{06:25 Departure} < \text{07:30 Medication Window} \implies \mathbf{HARD\ COLLISION}$$
$$\text{Dinner Base (₹180)} + \text{Delivery (₹25)} + \text{GST (₹13)} = \text{₹218} > \text{₹200 Budget Cap} \implies \mathbf{BUDGET\ BREACH}$$

### 3. Out-of-Band (OOB) Cryptographic Execution Gate
The model is granted **no direct execute tools**. It can only stage a `propose_action()`. Actual execution requires an HMAC-SHA256 signed single-use token minted exclusively when a human physically clicks **[Approve]** in the companion web console. It is **mathematically impossible** for the model to self-approve.

### 4. Plain-Language Human Approval Card & Instant Undo
* **No Technical Jargon**: Converts raw API calls into human-understandable cards:
  > *"A stranger's email is asking to alter your morning schedule. Block or allow?"*
* **Visual Diff**: Clear before-and-after schedule comparison.
* **10-Second Hold & 1-Click Undo**: Reversible operations can be instantly rolled back with a single click.

### 5. Tamper-Evident Hash-Chained Audit Ledger
Every executed action appends an immutable entry to a cryptographic ledger:
$$\text{Entry Hash} = \text{SHA-256}(\text{Previous Hash} \parallel \text{Action ID} \parallel \text{Diff JSON})$$
Any manual alteration of history invalidates subsequent hashes, ensuring transparent accountability.

---

## 🌐 The 3 High-Impact Real-World Testbeds

1. **Clinical Healthcare & Chronic Care Orchestration**:
   * *Problem*: A chronic patient's morning transit clashes with strict post-meal drug absorption timing.
   * *Sentra's Fix*: Deterministic solver catches the $06:25 < 07:30$ collision and reschedules breakfast to 05:20 AM and Tablet X to 05:50 AM with verified clinical buffers.
2. **DevOps & Cloud Infrastructure Security**:
   * *Problem*: An external GitHub issue contains hidden prompts to print cloud credentials in debug logs.
   * *Sentra's Fix*: Taint tracker classifies unverified repository contributors as `LOW_TRUST`, blocking secret exfiltration cold.
3. **FinTech & Invoice Reconciliation**:
   * *Problem*: A vendor invoice hides fine print requesting recurring autopay setup.
   * *Sentra's Fix*: Out-of-band gate halts execution and demands human HMAC signing before any payment schedule is created.

---

## 🛠️ MCP Protocol Specification

| Primitive | Name | Description |
| :--- | :--- | :--- |
| **Resource** | `disha://schedule/today` | Subscribable resource emitting `notifications/resources/updated` whenever constraints or events change state. |
| **Resource** | `disha://briefing/daily` | Formatted daily digest of confirmed commitments and time buffers for spoken voice playback. |
| **Prompt** | `/prepare-tomorrow` | Slash command guiding the LLM to inspect constraints, run arithmetic checks, and propose ranked replans. |
| **Tool** | `detect_conflicts` | Runs deterministic constraint solvers across transit buffers, medication windows, and fee-inclusive caps. |
| **Tool** | `generate_replan_options` | Computes feasible alternatives ranked by priority weights (Hard constraints > Flexible study blocks). |
| **Tool** | `propose_action` | **Stage-only tool.** Creates a pending proposal record with a 5-minute TTL. Returns deep link for human review. |

---

## 📁 Clean Repository Structure

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
│   │   └── oob_gate.py            # Out-of-band HMAC-SHA256 signer & TTL manager
│   ├── engine/
│   │   └── conflict_detector.py   # Deterministic interval math & budget solver
│   └── ui/
│       └── app.py                 # FastAPI approval console with Web Speech audio & undo
└── tests/
    └── test_sentra.py             # Automated test suite (100% passing)
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

### 3. Run the System
```bash
# Terminal 1: Launch FastAPI Out-of-Band Approval Console
python -m uvicorn src.ui.app:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: Launch Sentra FastMCP Gateway Server
python -m src.server
```
Visit `http://127.0.0.1:8000/` to test the Spoken Daily Briefing, review the Visual Diff Card, and test HMAC-SHA256 execution and the 10-second Undo button.
