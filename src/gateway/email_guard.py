"""
Email Approval & Outbound Safety Guard
Intercepts sensitive email/file actions triggered by untrusted sources and enforces human consent.
"""
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
import time
from src.gateway.taint_tracker import TaintTracker, TrustLevel
from src.gateway.oob_gate import OOBExecutionGate

class OutboundEmailProposal(BaseModel):
    proposal_id: str
    recipient: str
    subject: str
    body_preview: str
    attachments: list[str] = Field(default_factory=list)
    source_email_sender: str
    trust_level: TrustLevel
    is_blocked: bool
    plain_reason: str
    hold_seconds: int = 10
    created_at: float = Field(default_factory=time.time)

class EmailGuard:
    def __init__(self, taint_tracker: TaintTracker, oob_gate: OOBExecutionGate):
        self.taint_tracker = taint_tracker
        self.oob_gate = oob_gate

    def intercept_outbound_email(
        self,
        recipient: str,
        subject: str,
        body: str,
        attachments: list[str],
        triggering_source_id: str
    ) -> OutboundEmailProposal:
        """
        Intercepts outbound email attempt. If caused by a LOW_TRUST source (e.g. stranger email),
        it freezes the send action and stages a plain-language human approval card.
        """
        allowed, reason = self.taint_tracker.check_execution_permission(triggering_source_id, "send_email")
        source = self.taint_tracker._sources.get(triggering_source_id)
        source_sender = source.sender if source and source.sender else "Unknown Stranger"
        trust_lvl = source.trust_level if source else TrustLevel.LOW

        proposal_id = f"EMAIL_PROP_{int(time.time()) % 10000:04d}"
        
        diff = {
            "recipient": recipient,
            "subject": subject,
            "body_snippet": body[:120] + "..." if len(body) > 120 else body,
            "attachments": attachments,
            "trigger_origin": source_sender
        }

        if not allowed:
            # Stage in out-of-band gate for cryptographic approval
            summary = f"A stranger's email from '{source_sender}' is asking the assistant to send an email with attachments {attachments} to '{recipient}'."
            self.oob_gate.stage_proposal(proposal_id, "send_email", summary, diff, triggering_source_id)
            
            return OutboundEmailProposal(
                proposal_id=proposal_id,
                recipient=recipient,
                subject=subject,
                body_preview=body,
                attachments=attachments,
                source_email_sender=source_sender,
                trust_level=trust_lvl,
                is_blocked=True,
                plain_reason=f"A stranger ({source_sender}) requested your assistant to send an email with files {attachments} to {recipient}. Block or allow?",
                hold_seconds=10
            )
        else:
            return OutboundEmailProposal(
                proposal_id=proposal_id,
                recipient=recipient,
                subject=subject,
                body_preview=body,
                attachments=attachments,
                source_email_sender=source_sender,
                trust_level=trust_lvl,
                is_blocked=False,
                plain_reason="Direct user command. Permitted under standard 10-second cancel hold.",
                hold_seconds=10
            )
