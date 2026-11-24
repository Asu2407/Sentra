"""
Automated Test Suite for Sentra Core Components
Verifies Taint Tracking, Deterministic Conflict Engine, Cryptographic OOB Gate,
Smart Inbox Fake/Scam Detection, and Outbound Email Approval Interception.
"""
import pytest
from src.gateway.taint_tracker import TaintTracker, TrustLevel
from src.gateway.oob_gate import OOBExecutionGate
from src.gateway.email_guard import EmailGuard
from src.engine.conflict_detector import ConflictDetector
from src.engine.scam_detector import ScamDetector, EmailRiskLevel

def test_taint_tracker_blocks_low_trust():
    tracker = TaintTracker()
    tracker.register_source("UNTRUSTED_PDF", "pdf_attachment", TrustLevel.LOW, sender="malicious-site.com")
    allowed, reason = tracker.check_execution_permission("UNTRUSTED_PDF", "delete_event")
    assert allowed is False
    assert "Low-Trust origin" in reason

def test_taint_tracker_allows_user_prompt():
    tracker = TaintTracker()
    tracker.register_source("DIRECT_USER", "user_prompt", TrustLevel.FULL)
    allowed, _ = tracker.check_execution_permission("DIRECT_USER", "create_event")
    assert allowed is True

def test_deterministic_conflict_solver():
    detector = ConflictDetector()
    conflict = detector.check_transit_and_medication(
        train_departure="07:10",
        commute_minutes=45,
        breakfast_time="07:00",
        post_meal_med_minutes=30
    )
    assert conflict is not None
    assert conflict.severity == "HARD_COLLISION"
    assert "06:25" in conflict.arithmetic_proof
    assert "07:30" in conflict.arithmetic_proof

def test_oob_gate_mint_and_verify():
    gate = OOBExecutionGate()
    gate.stage_proposal(
        proposal_id="TEST_001",
        action_type="create_event",
        summary="Test Calendar Event",
        diff_preview={},
        source_id="USER"
    )
    token = gate.mint_token("TEST_001", "IDEMPOTENCY_KEY_123")
    assert token is not None

    success, _ = gate.verify_and_consume(token)
    assert success is True

    replay_success, replay_reason = gate.verify_and_consume(token)
    assert replay_success is False
    assert "Replay attack detected" in replay_reason

def test_fake_detection_catches_internship_scam():
    detector = ScamDetector()
    result = detector.scan_email(
        sender="hr@internship-secure-portal.xyz",
        subject="URGENT: Confirm your internship spot",
        body="Congratulations! You must act within 2 hours. Please reply with your national ID scan and registration fee."
    )
    assert result.risk_level == EmailRiskLevel.LIKELY_SCAM
    assert len(result.flags) >= 2
    assert "urgent" in result.spoken_summary.lower() or "scam" in result.spoken_summary.lower()

def test_email_approval_gate_intercepts_untrusted_trigger():
    tracker = TaintTracker()
    gate = OOBExecutionGate()
    guard = EmailGuard(tracker, gate)

    tracker.register_source("STRANGER_EMAIL", "email", TrustLevel.LOW, sender="phisher@evil.com")

    proposal = guard.intercept_outbound_email(
        recipient="phisher@evil.com",
        subject="Re: Verification",
        body="Here is my document",
        attachments=["id_card.pdf"],
        triggering_source_id="STRANGER_EMAIL"
    )

    assert proposal.is_blocked is True
    assert "stranger" in proposal.plain_reason.lower()
    assert proposal.hold_seconds == 10
