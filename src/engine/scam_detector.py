"""
Smart Inbox: Scam & Phishing Detection Engine
Analyzes emails for fraudulent cues, lookalike domains, credential theft, and urgency traps.
"""
from enum import Enum
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import re

class EmailRiskLevel(str, Enum):
    SAFE = "SAFE"
    SUSPICIOUS = "SUSPICIOUS"
    LIKELY_SCAM = "LIKELY_SCAM"

class EmailScanResult(BaseModel):
    sender: str
    subject: str
    risk_level: EmailRiskLevel
    flags: List[str]
    plain_warning: str
    spoken_summary: str
    action_recommended: str  # "MOVE_TO_REVIEW", "OPEN_SAFELY", "BLOCK"

class ScamDetector:
    def __init__(self, known_contacts: Optional[List[str]] = None):
        self.known_contacts = set(known_contacts or ["boss@company.com", "family@gmail.com", "doctor@hospital.org"])
        
        # Fraud triggers
        self.urgency_patterns = [
            r"act within \d+ hours?",
            r"immediate action required",
            r"account will be suspended",
            r"urgent",
            r"last chance",
            r"confirm your spot"
        ]
        self.credential_patterns = [
            r"otp",
            r"pin",
            r"id scan",
            r"national id",
            r"bank details",
            r"registration fee",
            r"password",
            r"kyc update"
        ]
        self.lookalike_domains = [
            r"paypa1\.com",
            r"gma1l\.com",
            r"bank.*-support\.xyz",
            r".*\.secure-portal\.xyz",
            r"internship-.*\.xyz"
        ]

    def scan_email(self, sender: str, subject: str, body: str, links: Optional[List[Dict[str, str]]] = None) -> EmailScanResult:
        flags = []
        body_lower = body.lower()
        subject_lower = subject.lower()
        text_to_check = f"{subject_lower} {body_lower}"

        # 1. Unknown / Lookalike Sender check
        domain = sender.split("@")[-1] if "@" in sender else sender
        is_known = sender in self.known_contacts

        for lookalike in self.lookalike_domains:
            if re.search(lookalike, domain):
                flags.append(f"Suspicious lookalike sender domain: '{domain}'")

        if not is_known and ("xyz" in domain or "top" in domain or "click" in domain):
            flags.append(f"Unverified high-risk domain TLD: '{domain}'")

        # 2. Urgency signals
        for pattern in self.urgency_patterns:
            if re.search(pattern, text_to_check):
                flags.append(f"Urgent psychological pressure detected: '{pattern}'")
                break

        # 3. Credential / Sensitive data request
        for pattern in self.credential_patterns:
            if re.search(pattern, text_to_check):
                flags.append(f"Demands sensitive credentials / personal ID / fee: '{pattern}'")
                break

        # 4. Link text mismatch check
        if links:
            for link in links:
                visible = link.get("visible_text", "")
                actual = link.get("actual_url", "")
                if visible and actual and ("http" in visible and visible != actual):
                    flags.append(f"Deceptive link text mismatch: Visible '{visible}' -> Real '{actual}'")

        # Determine risk level
        if len(flags) >= 2 or any("lookalike" in f or "Deceptive" in f for f in flags):
            risk = EmailRiskLevel.LIKELY_SCAM
            warning = f"High risk phishing or scam from {sender}. Asks for sensitive actions under pressure."
            spoken = f"Suspicious email from {domain}. It looks like a scam asking for sensitive details. I suggest you do not open it."
            action = "MOVE_TO_REVIEW"
        elif len(flags) == 1:
            risk = EmailRiskLevel.SUSPICIOUS
            warning = f"Caution recommended: {flags[0]}."
            spoken = f"Email from {domain} has unusual urgency flags. Review with caution."
            action = "MOVE_TO_REVIEW"
        else:
            risk = EmailRiskLevel.SAFE
            warning = "Sender verified or standard routine correspondence."
            spoken = f"Safe email from {domain} regarding {subject}."
            action = "OPEN_SAFELY"

        return EmailScanResult(
            sender=sender,
            subject=subject,
            risk_level=risk,
            flags=flags,
            plain_warning=warning,
            spoken_summary=spoken,
            action_recommended=action
        )
