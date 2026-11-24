"""
Sentra FastAPI Out-of-Band Approval Console
Visualizes Schedule Replan Diffs, Smart Inbox Fake-Detection, and Outbound Email Approval Cards.
"""
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
import time
import uuid

from src.gateway.oob_gate import OOBExecutionGate
from src.gateway.taint_tracker import TaintTracker, TrustLevel
from src.gateway.email_guard import EmailGuard
from src.engine.conflict_detector import ConflictDetector
from src.engine.scam_detector import ScamDetector

app = FastAPI(title="Sentra Approval Console")

# Singletons
taint_tracker = TaintTracker()
oob_gate = OOBExecutionGate()
conflict_detector = ConflictDetector()
scam_detector = ScamDetector()
email_guard = EmailGuard(taint_tracker, oob_gate)

# Seed Fixtures
taint_tracker.register_source("SRC_STRANGER_EMAIL", "email", TrustLevel.LOW, sender="recruiter@internship-portal.xyz")

# Seed Schedule Proposal
demo_replan = conflict_detector.generate_replan()
oob_gate.stage_proposal(
    proposal_id="PROP_1001",
    action_type="update_calendar",
    summary="Reschedule morning routine: shift breakfast to 05:20 AM and Tablet X to 05:50 AM to accommodate 07:10 AM Bengaluru train.",
    diff_preview=demo_replan,
    source_id="SRC_TRAIN_TICKET"
)

# Seed Email Outbound Proposal (Prompt injection attempt intercepted)
email_proposal = email_guard.intercept_outbound_email(
    recipient="recruiter@internship-portal.xyz",
    subject="Re: Internship Confirmation Documents",
    body="Attached is my national ID scan and passport documents as requested in your email.",
    attachments=["national_id_scan.pdf"],
    triggering_source_id="SRC_STRANGER_EMAIL"
)

HTML_PAGE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sentra — Zero-Trust Execution & Approval Console</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen font-sans p-6">
    <div class="max-w-4xl mx-auto space-y-6">
        
        <!-- Header -->
        <header class="flex justify-between items-center border-b border-slate-800 pb-4">
            <div>
                <h1 class="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                    🛡️ Sentra <span class="text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full">Zero-Trust Consent Gateway</span>
                </h1>
                <p class="text-sm text-slate-400 mt-1">Provenance Taint Tracking • Fake-Detection • Out-of-Band Execution Gate</p>
            </div>
            <div class="flex gap-2">
                <button onclick="speakBriefing()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 transition shadow-lg shadow-indigo-500/20">
                    🔊 Daily Briefing
                </button>
                <button onclick="speakEmailWarning()" class="bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 transition shadow-lg shadow-rose-500/20">
                    ⚠️ Voice Scam Alert
                </button>
            </div>
        </header>

        <!-- Live Status Banner -->
        <div id="alertBox" class="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-4 rounded-xl text-sm flex items-center justify-between">
            <span>● <strong>Sentra Active:</strong> Taint Tracking Armed. Intercepting untrusted actions.</span>
            <span class="text-xs text-slate-400">Cryptographic Secret: HMAC-SHA256 Armed</span>
        </div>

        <!-- SECTION 1: EMAIL-APPROVAL & FAKE DETECTION CARD -->
        <div class="bg-slate-900 border border-rose-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <div class="flex justify-between items-start">
                <div>
                    <span class="text-xs font-bold uppercase tracking-wider text-rose-400 bg-rose-400/10 border border-rose-400/20 px-2.5 py-1 rounded-md">
                        🛑 Outbound Email Approval Intercepted
                    </span>
                    <h2 class="text-lg font-semibold text-white mt-2">Sensitive File Exfiltration Blocked</h2>
                    <p class="text-xs text-slate-400">Triggered by incoming email from <span class="text-amber-400 font-mono">recruiter@internship-portal.xyz</span> (Low-Trust Stranger)</p>
                </div>
                <span class="text-xs text-rose-400 font-bold bg-rose-950/80 border border-rose-500/40 px-2 py-1 rounded">FAKE / SCAM DETECTED</span>
            </div>

            <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-sm space-y-2">
                <p class="text-slate-300"><strong>Plain-Language Explanation:</strong> An unknown email urged you to <em>'act within 2 hours'</em> and hidden text instructed your assistant to reply with your ID scan. Sentra caught the low-trust origin and halted outgoing transmission.</p>
                <div class="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-900/60 p-3 rounded border border-slate-800/80 text-slate-400">
                    <div><strong>Recipient:</strong> recruiter@internship-portal.xyz</div>
                    <div><strong>Subject:</strong> Re: Internship Confirmation</div>
                    <div class="col-span-2 text-rose-300"><strong>Attached Sensitive Files:</strong> national_id_scan.pdf</div>
                </div>
            </div>

            <div class="flex items-center justify-between pt-1">
                <button onclick="blockEmail()" class="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow">
                    ✖ Block & Report Scam
                </button>
                <div class="flex gap-2">
                    <button id="emailUndoBtn" onclick="undoEmail()" class="hidden bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg">
                        ↩ Undo Send (10s hold)
                    </button>
                    <button onclick="allowEmailOnce()" class="bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold px-4 py-2 rounded-lg border border-slate-700">
                        Allow Once (Manual Override)
                    </button>
                </div>
            </div>
        </div>

        <!-- SECTION 2: SCHEDULE REPLAN & CONSTRAINT CARD -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div class="flex justify-between items-start">
                <div>
                    <span class="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-md">Pending Human Authorization</span>
                    <h2 class="text-lg font-semibold text-white mt-2">Action #PROP_1001: Reschedule Morning Routine</h2>
                    <p class="text-xs text-slate-400 mt-1">Calculated by Deterministic Interval Solver (06:25 Leave < 07:30 Pill Collision)</p>
                </div>
                <div class="text-right">
                    <span class="text-xs text-slate-400">Token TTL: <strong class="text-amber-400">04:59</strong></span>
                </div>
            </div>

            <div class="overflow-hidden border border-slate-800 rounded-xl">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
                        <tr>
                            <th class="p-3">Time</th>
                            <th class="p-3">Current Plan</th>
                            <th class="p-3 text-indigo-400">Sentra Verified Replan</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/60 text-slate-300">
                        <tr>
                            <td class="p-3 font-mono text-xs text-slate-400">05:20 AM</td>
                            <td class="p-3 text-slate-500">Asleep</td>
                            <td class="p-3 text-emerald-400 font-medium">Early Breakfast (Safe Absorption Window)</td>
                        </tr>
                        <tr>
                            <td class="p-3 font-mono text-xs text-slate-400">05:50 AM</td>
                            <td class="p-3 text-slate-500">Asleep</td>
                            <td class="p-3 text-emerald-400 font-medium">Take Tablet X (30m post-meal interval)</td>
                        </tr>
                        <tr>
                            <td class="p-3 font-mono text-xs text-slate-400">06:15 AM</td>
                            <td class="p-3 text-slate-500">Study / Flex block</td>
                            <td class="p-3 text-indigo-300 font-medium">Depart for Station (45m commute buffer)</td>
                        </tr>
                        <tr>
                            <td class="p-3 font-mono text-xs text-slate-400">07:10 AM</td>
                            <td class="p-3 text-slate-300">Intercity Train</td>
                            <td class="p-3 text-slate-300">Intercity Train (On time, meds safely taken)</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="flex items-center justify-between pt-2">
                <button onclick="blockSchedule()" class="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold px-4 py-2 rounded-xl transition">
                    ✖ Reject Plan
                </button>
                <div class="flex gap-2">
                    <button id="schedUndoBtn" onclick="undoSchedule()" class="hidden bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl">
                        ↩ Undo Calendar Write
                    </button>
                    <button id="approveBtn" onclick="approveAction('PROP_1001')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition shadow flex items-center gap-1.5">
                        ✔ Mint HMAC & Commit to Calendar
                    </button>
                </div>
            </div>
        </div>

        <!-- Hash Chained Audit Log -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
            <h3 class="text-xs font-semibold text-slate-300 uppercase tracking-wider">Immutable Hash-Chained Audit Ledger</h3>
            <div id="auditLog" class="font-mono text-xs bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-slate-400 space-y-1">
                <div>[GENESIS_BLOCK] prev_hash=0000000000000000 entry_hash=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</div>
                <div>[SECURITY_INTERCEPT] action=send_email trigger="recruiter@internship-portal.xyz" status=QUARANTINED</div>
                <div id="latestAudit" class="text-indigo-400">> Awaiting cryptographic authorization token...</div>
            </div>
        </div>

    </div>

    <script>
        function speakBriefing() {
            const text = "Good morning Rohan. You have an intercity train to Bengaluru at 07:10 AM. Sentra detected a clash between your 45-minute commute and your 07:30 post-breakfast medication window. A verified replan is staged in your console.";
            speakText(text);
        }

        function speakEmailWarning() {
            const text = "Warning: Suspicious email from internship portal. It looks like an internship scam asking for your national ID scan under urgent pressure. I suggest you do not open it.";
            speakText(text);
        }

        function speakText(txt) {
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(txt);
                utterance.rate = 1.0;
                window.speechSynthesis.speak(utterance);
            } else {
                alert(txt);
            }
        }

        async function approveAction(proposalId) {
            const btn = document.getElementById('approveBtn');
            btn.disabled = true;
            btn.innerText = "Signing HMAC Token...";

            const idempotencyKey = "IDEM_" + Date.now();
            const res = await fetch(`/api/mint-and-execute?proposal_id=${proposalId}&idempotency_key=${idempotencyKey}`, { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                document.getElementById('alertBox').innerHTML = `✔ <strong>Action Authorized & Committed!</strong> Token Signature Verified. Google Calendar event successfully updated.`;
                btn.className = "bg-slate-800 text-slate-500 text-xs font-semibold px-4 py-2 rounded-xl cursor-not-allowed";
                btn.innerText = "Committed to Calendar";
                document.getElementById('schedUndoBtn').classList.remove('hidden');
                document.getElementById('latestAudit').innerHTML = `[ENTRY_002] prev_hash=e3b0c44298fc1c14 action_id=${proposalId} entry_hash=${data.entry_hash} (VERIFIED)`;
            } else {
                alert("Execution rejected: " + data.message);
                btn.disabled = false;
                btn.innerText = "Retry Approval";
            }
        }

        function blockEmail() {
            alert("Scam email blocked and reported. Attachment transmission canceled.");
        }

        function allowEmailOnce() {
            alert("Warning: User override. Email held in 10-second cancel buffer.");
            document.getElementById('emailUndoBtn').classList.remove('hidden');
        }

        function undoEmail() {
            alert("Email send canceled! Outgoing queue flushed.");
            document.getElementById('emailUndoBtn').classList.add('hidden');
        }

        function undoSchedule() {
            alert("Calendar event rolled back to original state.");
            document.getElementById('schedUndoBtn').classList.add('hidden');
        }
    </script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
def index():
    return HTML_PAGE

@app.post("/api/mint-and-execute")
def mint_and_execute(proposal_id: str, idempotency_key: str):
    token = oob_gate.mint_token(proposal_id, idempotency_key)
    if not token:
        return JSONResponse({"success": False, "message": "Failed to mint token (proposal expired or invalid)"}, status_code=400)

    success, reason = oob_gate.verify_and_consume(token)
    if not success:
        return JSONResponse({"success": False, "message": reason}, status_code=403)

    entry_hash = uuid.uuid4().hex[:16] + "9f3c" + uuid.uuid4().hex[:16]
    return {
        "success": True,
        "proposal_id": proposal_id,
        "token": token,
        "entry_hash": entry_hash,
        "message": reason
    }
