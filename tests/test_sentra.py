"""
Unit tests for SafeGuard OS Core Components
Verifies taint tracking, arithmetic proof solver, and cryptographic OOB gate.
"""
import pytest
from src.gateway.taint_tracker import TaintTracker, TrustLevel
from src.gateway.oob_gate import OOBExecutionGate
from src.engine.conflict_detector import ConflictDetector

def test_taint_tracker_blocks_low_trust():
    tracker = TaintTracker()
    tracker.register_source("UNTRUSTED_PDF", "pdf_attachment", TrustLevel.LOW, sender="malicious-site.com")
    
    # Low trust origin trying sensitive action
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

    # Mint token
    token = gate.mint_token("TEST_001", "IDEMPOTENCY_KEY_123")
    assert token is not None

    # First verification succeeds
    success, reason = gate.verify_and_consume(token)
    assert success is True

    # Replay attack with same token & idempotency key must fail
    replay_success, replay_reason = gate.verify_and_consume(token)
    assert replay_success is False
    assert "Replay attack detected" in replay_reason
