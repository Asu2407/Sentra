"""
Data Provenance & Taint Tracking Engine
Labels data and instruction flows by trust level.
"""
from enum import Enum
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
import time

class TrustLevel(str, Enum):
    FULL = "FULL"          # Direct user typed prompt in host chat
    MEDIUM = "MEDIUM"      # Verified contacts, existing calendar blocks
    LOW = "LOW"            # Untrusted PDFs, receipts, stranger emails, external issues

class DataProvenance(BaseModel):
    source_id: str
    origin_type: str       # "user_prompt", "email", "pdf_attachment"
    trust_level: TrustLevel = TrustLevel.LOW
    sender: Optional[str] = None
    is_tainted: bool = True
    timestamp: float = Field(default_factory=time.time)

class TaintTracker:
    def __init__(self):
        self._sources: Dict[str, DataProvenance] = {}

    def register_source(self, source_id: str, origin_type: str, trust_level: TrustLevel, sender: Optional[str] = None) -> DataProvenance:
        is_tainted = (trust_level == TrustLevel.LOW)
        record = DataProvenance(
            source_id=source_id,
            origin_type=origin_type,
            trust_level=trust_level,
            sender=sender,
            is_tainted=is_tainted
        )
        self._sources[source_id] = record
        return record

    def check_execution_permission(self, source_id: str, action_type: str) -> tuple[bool, str]:
        """
        Validates if an action is allowed based on source trust.
        Sensitive actions: send_email, delete_event, update_calendar, pay
        """
        source = self._sources.get(source_id)
        sensitive_actions = {"delete_event", "update_calendar", "create_event", "send_email", "pay"}

        if not source:
            return False, "Unknown source. Defaulting to strict quarantine."

        if source.is_tainted and action_type in sensitive_actions:
            return False, f"Action '{action_type}' triggered by Low-Trust origin ({source.origin_type} from '{source.sender}'). Out-of-band human authorization required."

        return True, "Authorized by source trust."
