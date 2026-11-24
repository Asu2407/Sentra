"""
SafeGuard OS FastMCP Server
Exposes subscribable resources, slash prompts, and stage-only propose_action tool.
"""
from fastmcp import FastMCP
from typing import Dict, Any
from src.gateway.taint_tracker import TaintTracker, TrustLevel
from src.gateway.oob_gate import OOBExecutionGate
from src.engine.conflict_detector import ConflictDetector

# Initialize Server
mcp = FastMCP("SafeGuard-OS-Gateway")

# Initialize Core Singletons
taint_tracker = TaintTracker()
oob_gate = OOBExecutionGate()
conflict_detector = ConflictDetector()

# Register Sample Fixture Data
taint_tracker.register_source("SRC_USER_CHAT", "user_prompt", TrustLevel.FULL)
taint_tracker.register_source("SRC_TRAIN_TICKET", "pdf_attachment", TrustLevel.LOW, sender="IRCTC Booking")
taint_tracker.register_source("SRC_MALICIOUS_INVOICE", "pdf_attachment", TrustLevel.LOW, sender="fake-internship-portal.xyz")

# ==========================================
# MCP Resources
# ==========================================
@mcp.resource("disha://schedule/today")
def get_today_schedule() -> str:
    """Returns live schedule, active constraints, and detected arithmetic collisions."""
    conflict_med = conflict_detector.check_transit_and_medication()
    conflict_budget = conflict_detector.check_dinner_budget()
    
    output = "=== SAFEGUARD OS: LIVE SCHEDULE & CONFLICT AUDIT ===\n"
    if conflict_med:
        output += f"\n⚠️ [COLLISION DETECTED] {conflict_med.description}\nProof: {conflict_med.arithmetic_proof}\n"
    if conflict_budget:
        output += f"\n⚠️ [BUDGET BREACH] {conflict_budget.description}\nProof: {conflict_budget.arithmetic_proof}\n"
    return output

@mcp.resource("disha://briefing/daily")
def get_daily_briefing() -> str:
    """Returns spoken daily digest formatted for audio playback."""
    return (
        "Good morning Rohan. You have an intercity train to Bengaluru at 07:10 AM. "
        "SafeGuard detected a clash between your 45-minute commute and your 07:30 post-breakfast medication window. "
        "A proposed replan is waiting in your approval console."
    )

# ==========================================
# MCP Prompts (Slash Commands)
# ==========================================
@mcp.prompt("/prepare-tomorrow")
def prepare_tomorrow_prompt() -> str:
    return (
        "Inspect disha://schedule/today, detect all arithmetic and time buffer collisions, "
        "call generate_replan_options to rank alternatives, and call propose_action to stage "
        "the verified plan for out-of-band human consent."
    )

# ==========================================
# MCP Tools (Read & Propose ONLY)
# ==========================================
@mcp.tool()
def detect_conflicts() -> Dict[str, Any]:
    """Runs deterministic checks across time buffers, medication intervals, and taxes."""
    med_conflict = conflict_detector.check_transit_and_medication()
    budget_conflict = conflict_detector.check_dinner_budget()
    return {
        "status": "CONFLICTS_FOUND",
        "conflicts": [c.model_dump() for c in [med_conflict, budget_conflict] if c is not None]
    }

@mcp.tool()
def generate_replan_options() -> Dict[str, Any]:
    """Calculates safe schedule and meal adjustments using deterministic weights."""
    return conflict_detector.generate_replan()

@mcp.tool()
def propose_action(action_type: str, summary: str, diff_preview: Dict[str, Any], source_id: str) -> Dict[str, Any]:
    """
    Stages an action for out-of-band human consent. 
    The model has NO DIRECT EXECUTE TOOL; execution requires a human click in the companion UI.
    """
    # 1. Taint check
    allowed, reason = taint_tracker.check_execution_permission(source_id, action_type)
    if not allowed:
        return {
            "status": "BLOCKED_BY_TAINT_TRACKER",
            "message": reason,
            "security_alert": "Unauthorized sensitive action attempted from Low-Trust source. Blocked cold."
        }

    # 2. Stage proposal with 5-minute TTL
    proposal_id = f"PROP_{int(hash(summary) % 10000):04d}"
    proposal = oob_gate.stage_proposal(proposal_id, action_type, summary, diff_preview, source_id)

    return {
        "status": "STAGED_FOR_APPROVAL",
        "proposal_id": proposal.proposal_id,
        "review_url": f"http://localhost:8000/approve/{proposal.proposal_id}",
        "expires_in_seconds": 300,
        "message": f"Action staged. Please click the review link to authorize via HMAC token."
    }

if __name__ == "__main__":
    mcp.run()
