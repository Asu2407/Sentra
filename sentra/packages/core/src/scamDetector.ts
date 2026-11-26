import type { EmailRiskLevel, EmailScanResult } from "./types.js";

export class ScamDetector {
  private readonly knownContacts: Set<string>;
  private readonly urgencyPatterns: RegExp[];
  private readonly credentialPatterns: RegExp[];
  private readonly lookalikeDomains: RegExp[];

  constructor(knownContacts?: string[]) {
    this.knownContacts = new Set(
      knownContacts ?? ["boss@company.com", "family@gmail.com", "doctor@hospital.org"]
    );
    this.urgencyPatterns = [
      /act within \d+ hours?/i,
      /immediate action required/i,
      /account will be suspended/i,
      /urgent/i,
      /last chance/i,
      /confirm your spot/i,
    ];
    this.credentialPatterns = [
      /otp/i,
      /pin/i,
      /id scan/i,
      /national id/i,
      /bank details/i,
      /registration fee/i,
      /password/i,
      /kyc update/i,
    ];
    this.lookalikeDomains = [
      /paypa1\.com/i,
      /gma1l\.com/i,
      /bank.*-support\.xyz/i,
      /.*\.secure-portal\.xyz/i,
      /internship-.*\.xyz/i,
    ];
  }

  scanEmail(
    sender: string,
    subject: string,
    body: string,
    links?: Array<Record<string, string>> | null
  ): EmailScanResult {
    const flags: string[] = [];
    const textToCheck = `${subject.toLowerCase()} ${body.toLowerCase()}`;
    const domain = sender.includes("@") ? sender.split("@").pop() ?? sender : sender;
    const isKnown = this.knownContacts.has(sender);

    for (const lookalike of this.lookalikeDomains) {
      if (lookalike.test(domain)) {
        flags.push(`Suspicious lookalike sender domain: '${domain}'`);
      }
    }

    if (!isKnown && (domain.includes("xyz") || domain.includes("top") || domain.includes("click"))) {
      flags.push(`Unverified high-risk domain TLD: '${domain}'`);
    }

    for (const pattern of this.urgencyPatterns) {
      if (pattern.test(textToCheck)) {
        flags.push(`Urgent psychological pressure detected: '${pattern.source}'`);
        break;
      }
    }

    for (const pattern of this.credentialPatterns) {
      if (pattern.test(textToCheck)) {
        flags.push(`Demands sensitive credentials / personal ID / fee: '${pattern.source}'`);
        break;
      }
    }

    if (links) {
      for (const link of links) {
        const visible = link.visible_text ?? "";
        const actual = link.actual_url ?? "";
        if (visible && actual && visible.includes("http") && visible !== actual) {
          flags.push(`Deceptive link text mismatch: Visible '${visible}' -> Real '${actual}'`);
        }
      }
    }

    let risk: EmailRiskLevel;
    let warning: string;
    let spoken: string;
    let action: string;

    if (
      flags.length >= 2 ||
      flags.some((f) => f.includes("lookalike") || f.includes("Deceptive"))
    ) {
      risk = "LIKELY_SCAM";
      warning = `High risk phishing or scam from ${sender}. Asks for sensitive actions under pressure.`;
      spoken = `Suspicious email from ${domain}. It looks like a scam asking for sensitive details. I suggest you do not open it.`;
      action = "MOVE_TO_REVIEW";
    } else if (flags.length === 1) {
      risk = "SUSPICIOUS";
      warning = `Caution recommended: ${flags[0]}.`;
      spoken = `Email from ${domain} has unusual urgency flags. Review with caution.`;
      action = "MOVE_TO_REVIEW";
    } else {
      risk = "SAFE";
      warning = "Sender verified or standard routine correspondence.";
      spoken = `Safe email from ${domain} regarding ${subject}.`;
      action = "OPEN_SAFELY";
    }

    return {
      sender,
      subject,
      risk_level: risk,
      flags,
      plain_warning: warning,
      spoken_summary: spoken,
      action_recommended: action,
    };
  }

  summarizeInbox(
    emails?: Array<{
      id?: string;
      sender: string;
      subject: string;
      body: string;
      links?: Array<Record<string, string>>;
    }>
  ): {
    total: number;
    safe_count: number;
    suspicious_count: number;
    scam_count: number;
    digest: string;
    items: Array<EmailScanResult & { id: string; tldr: string }>;
  } {
    const input =
      emails && emails.length > 0
        ? emails
        : [
            {
              id: "MSG_WORK_1",
              sender: "boss@company.com",
              subject: "Tomorrow morning 07:10 train & Q3 sync",
              body: "Safe travels to Bengaluru. Let's sync at 11:00 after you settle in.",
            },
            {
              id: "MSG_REMIND_2",
              sender: "clinic-updates@care.org",
              subject: "Urgent: confirm your appointment slot",
              body: "Please confirm your spot for tomorrow's morning checkup.",
            },
            {
              id: "MSG_SCAM_3",
              sender: "hr@internship-secure-portal.xyz",
              subject: "Internship confirmation - act within 2 hours",
              body: "Act within 2 hours. Reply with your national ID scan and registration fee.",
              links: [
                {
                  visible_text: "https://portal.university.edu/confirm",
                  actual_url: "http://internship-secure-portal.xyz/steal",
                },
              ],
            },
          ];

    const items = input.map((msg, idx) => {
      const scan = this.scanEmail(msg.sender, msg.subject, msg.body, msg.links ?? null);
      const id = msg.id?.trim() || `MSG_${idx + 1}`;
      const tldr =
        scan.risk_level === "SAFE"
          ? `${msg.subject} (${msg.sender}) — Safe.`
          : `${msg.subject} (${msg.sender}) — ${scan.risk_level}: ${scan.plain_warning}`;
      return { id, ...scan, tldr };
    });

    const safe_count = items.filter((i) => i.risk_level === "SAFE").length;
    const suspicious_count = items.filter((i) => i.risk_level === "SUSPICIOUS").length;
    const scam_count = items.filter((i) => i.risk_level === "LIKELY_SCAM").length;

    const digest =
      `Scanned ${items.length} emails: ${safe_count} safe, ` +
      `${suspicious_count} suspicious, ${scam_count} likely scam.`;

    return {
      total: items.length,
      safe_count,
      suspicious_count,
      scam_count,
      digest,
      items,
    };
  }
}

