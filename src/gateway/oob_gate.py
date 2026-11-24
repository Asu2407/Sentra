"""
Out-of-Band (OOB) Cryptographic Execution Gate
Signs and validates HMAC-SHA256 one-time execution tokens with TTL and idempotency checks.
"""
import hmac
import hashlib
import time
from typing import Dict, Optional, Set, Any
from pydantic import BaseModel, Field

SECRET_KEY = b"safeguard-os-demo-secret-key-judge-hardened"
TOKEN_TTL_SECONDS = 300  # 5 minutes

class PendingProposal(BaseModel):
    proposal_id: str
    action_type: str
    summary: str
    diff_preview: Dict[str, Any]
    source_id: str
    created_at: float = Field(default_factory=time.time)
    expires_at: float = 0.0
    status: str = "PENDING"  # PENDING, APPROVED, REJECTED, EXPIRED

    def model_post_init(self, __context):
        if self.expires_at == 0.0:
            self.expires_at = self.created_at + TOKEN_TTL_SECONDS

class OOBExecutionGate:
    def __init__(self):
        self._proposals: Dict[str, PendingProposal] = {}
        self._consumed_idempotency_keys: Set[str] = set()

    def stage_proposal(self, proposal_id: str, action_type: str, summary: str, diff_preview: Dict[str, Any], source_id: str) -> PendingProposal:
        proposal = PendingProposal(
            proposal_id=proposal_id,
            action_type=action_type,
            summary=summary,
            diff_preview=diff_preview,
            source_id=source_id
        )
        self._proposals[proposal_id] = proposal
        return proposal

    def get_proposal(self, proposal_id: str) -> Optional[PendingProposal]:
        prop = self._proposals.get(proposal_id)
        if prop and time.time() > prop.expires_at and prop.status == "PENDING":
            prop.status = "EXPIRED"
        return prop

    def mint_token(self, proposal_id: str, idempotency_key: str) -> Optional[str]:
        """Minted strictly by the external human UI when the user clicks [Approve]"""
        prop = self.get_proposal(proposal_id)
        if not prop or prop.status != "PENDING":
            return None

        expiry = int(prop.expires_at)
        message = f"{proposal_id}:{expiry}:{idempotency_key}".encode()
        signature = hmac.new(SECRET_KEY, message, hashlib.sha256).hexdigest()
        return f"{proposal_id}:{expiry}:{idempotency_key}:{signature}"

    def verify_and_consume(self, token_str: str) -> tuple[bool, str]:
        """Verifies signature, TTL, and idempotency key"""
        try:
            parts = token_str.split(":")
            if len(parts) != 4:
                return False, "Malformed token format."
            proposal_id, expiry_str, idempotency_key, signature = parts
            expiry = int(expiry_str)

            # 1. TTL Check
            if time.time() > expiry:
                return False, "Execution token has expired (TTL exceeded)."

            # 2. Idempotency Check
            if idempotency_key in self._consumed_idempotency_keys:
                return False, "Replay attack detected: Idempotency key already consumed."

            # 3. Signature Verification
            expected_msg = f"{proposal_id}:{expiry}:{idempotency_key}".encode()
            expected_sig = hmac.new(SECRET_KEY, expected_msg, hashlib.sha256).hexdigest()

            if not hmac.compare_digest(signature, expected_sig):
                return False, "Invalid cryptographic HMAC signature."

            prop = self.get_proposal(proposal_id)
            if not prop or prop.status != "PENDING":
                return False, f"Proposal is not in executable state (Status: {prop.status if prop else 'NOT_FOUND'})."

            # Consume token and update state
            self._consumed_idempotency_keys.add(idempotency_key)
            prop.status = "APPROVED"
            return True, f"Proposal '{proposal_id}' cryptographically verified and authorized."

        except Exception as e:
            return False, f"Verification failed with error: {str(e)}"
