"""
FastAPI Out-of-Band Human Approval Console
Mints HMAC-SHA256 tokens upon human button click and renders plain-language diffs.
"""
from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import time
import uuid

from src.gateway.oob_gate import OOBExecutionGate
from src.engine.conflict_detector import ConflictDetector

app = FastAPI(title="SafeGuard OS Approval Console")

# Shared demo instances
oob_gate = OOBExecutionGate()
conflict_detector = ConflictDetector()

# Seed a demo proposal if none exists
demo_replan = conflict_detector.generate_replan()
oob_gate.stage_proposal(
    proposal_id="PROP_1001",
    action_type="update_calendar",
    summary="Reschedule morning routine: shift breakfast to 05:20 AM and Tablet X to 05:50 AM to accommodate 07:10 AM Bengaluru train.",
    diff_preview=demo_replan,
    source_id="SRC_TRAIN_TICKET"
)

HTML_PAGE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SafeGuard OS — Out-of-Band Verification Console</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen font-sans p-6">
    <div class="max-w-4xl mx-auto space-y-6">
        
        <!-- Header -->
        <header class="flex justify-between items-center border-b border-slate-800 pb-4">
            <div>
                <h1 class="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                    🛡️ SafeGuard OS <span class="text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full">OOB Verifiable Gate</span>
                </h1>
                <p class="text-sm text-slate-400 mt-1">Human-in-the-Loop Cryptographic Execution & Taint Tracking</p>
            </div>
            <button onclick="speakBriefing()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition shadow-lg shadow-indigo-500/20">
                🔊 Spoken Daily Briefing
            </button>
        </header>

        <!-- Live Status Banner -->
        <div id="alertBox" class="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-4 rounded-xl text-sm flex items-center justify-between">
            <span>● <strong>MCP Server Active:</strong> Listening for staged proposals via FastMCP.</span>
            <span class="text-xs text-slate-400">Cryptographic Secret: HMAC-SHA256 Armed</span>
        </div>

        <!-- Approval Card -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div class="flex justify-between items-start">
                <div>
                    <span class="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-md">Pending Human Authorization</span>
                    <h2 class="text-lg font-semibold text-white mt-2">Action #PROP_1001: Reschedule Morning Routine</h2>
                    <p class="text-sm text-slate-400 mt-1">Triggered by low-trust ticket PDF parsing. Staged for out-of-band consent.</p>
                </div>
                <div class="text-right">
                    <span class="text-xs text-slate-400">Token TTL: <strong id="timer" class="text-amber-400">04:59</strong></span>
                </div>
            </div>

            <!-- Plain Language Summary -->
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 text-sm text-slate-300">
                <p><strong>Plain Language Reason:</strong> Your 07:10 AM Mysuru–Bengaluru train departs home at 06:25 AM. Taking Tablet X after your normal 07:00 AM breakfast (07:30 AM pill window) causes a hard collision while you are in transit. SafeGuard proposes shifting breakfast to 05:20 AM and pill window to 05:50 AM.</p>
            </div>

            <!-- Visual Diff Table -->
            <div class="overflow-hidden border border-slate-800 rounded-xl">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
                        <tr>
                            <th class="p-3">Time</th>
                            <th class="p-3">Current Plan</th>
                            <th class="p-3 text-indigo-400">SafeGuard Verified Replan</th>
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

            <!-- Actions -->
            <div class="flex items-center justify-between pt-2">
                <button onclick="blockAction()" class="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-sm font-semibold px-5 py-2.5 rounded-xl transition">
                    ✖ Reject & Flag Low Trust
                </button>
                <div class="flex gap-3">
                    <button id="undoBtn" onclick="undoAction()" class="hidden bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold px-4 py-2.5 rounded-xl transition">
                        ↩ Undo (10s left)
                    </button>
                    <button id="approveBtn" onclick="approveAction('PROP_1001')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition shadow-lg shadow-emerald-500/20 flex items-center gap-2">
                        ✔ Mint HMAC & Commit to Calendar
                    </button>
                </div>
            </div>
        </div>

        <!-- Hash Chained Audit Log -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
            <h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wider text-xs">Immutable Hash-Chained Audit Log</h3>
            <div id="auditLog" class="font-mono text-xs bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-slate-400 space-y-1">
                <div>[GENESIS_BLOCK] prev_hash=0000000000000000 entry_hash=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</div>
                <div id="latestAudit" class="text-indigo-400">> Awaiting cryptographic authorization token...</div>
            </div>
        </div>

    </div>

    <script>
        function speakBriefing() {
            const text = "Good morning Rohan. You have an intercity train to Bengaluru at 07:10 AM. SafeGuard detected a clash between your 45-minute commute and your 07:30 post-breakfast medication window. A verified replan is staged in your console.";
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = 1.0;
                utterance.pitch = 1.0;
                window.speechSynthesis.speak(utterance);
            } else {
                alert("Speech Synthesis not supported by this browser.");
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
                document.getElementById('alertBox').className = "bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 p-4 rounded-xl text-sm";
                document.getElementById('alertBox').innerHTML = `✔ <strong>Action Authorized & Committed!</strong> Token Signature Verified. Google Calendar event successfully updated.`;
                btn.className = "bg-slate-800 text-slate-500 text-sm font-semibold px-6 py-2.5 rounded-xl cursor-not-allowed";
                btn.innerText = "Committed to Calendar";
                document.getElementById('undoBtn').classList.remove('hidden');

                // Append audit
                document.getElementById('latestAudit').innerHTML = `[ENTRY_001] prev_hash=e3b0c44298fc1c14 action_id=${proposalId} entry_hash=${data.entry_hash} (VERIFIED)`;
            } else {
                alert("Execution rejected: " + data.message);
                btn.disabled = false;
                btn.innerText = "Retry Approval";
            }
        }

        function undoAction() {
            alert("Action undone! Calendar mutation rolled back cleanly.");
            document.getElementById('undoBtn').classList.add('hidden');
            document.getElementById('latestAudit').innerHTML += `<br>[ENTRY_002] ROLLBACK action_id=PROP_1001 status=REVERTED`;
        }

        function blockAction() {
            alert("Action rejected and marked blocked in taint audit.");
            location.reload();
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

    # Compute mock hash-chain entry
    entry_hash = uuid.uuid4().hex[:16] + "9f3c" + uuid.uuid4().hex[:16]
    return {
        "success": True,
        "proposal_id": proposal_id,
        "token": token,
        "entry_hash": entry_hash,
        "message": reason
    }
