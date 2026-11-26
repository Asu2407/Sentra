import type { OOBExecutionGate } from "./oobGate.js";
import type { TaintTracker } from "./taintTracker.js";
import type { OutboundEmailProposal } from "./types.js";

export class EmailGuard {
  private readonly taintTracker: TaintTracker;
  private readonly oobGate: OOBExecutionGate;

  constructor(taintTracker: TaintTracker, oobGate: OOBExecutionGate) {
    this.taintTracker = taintTracker;
    this.oobGate = oobGate;
  }

  async interceptOutboundEmail(
    recipient: string,
    subject: string,
    body: string,
    attachments: string[],
    triggeringSourceId: string
  ): Promise<OutboundEmailProposal> {
    const { allowed } = await this.taintTracker.checkExecutionPermission(
      triggeringSourceId,
      "send_email"
    );
    const source = await this.taintTracker.getSource(triggeringSourceId);
    const sourceSender = source?.sender ?? "Unknown Stranger";
    const trustLvl = source?.trust_level ?? "LOW";

    const suffix = String(Math.trunc(Date.now() / 1000) % 10000).padStart(4, "0");
    const proposalId = `EMAIL_PROP_${suffix}`;

    const diff = {
      recipient,
      subject,
      body_snippet: body.length > 120 ? `${body.slice(0, 120)}...` : body,
      attachments,
      trigger_origin: sourceSender,
    };

    if (!allowed) {
      const summary = `A stranger's email from '${sourceSender}' is asking the assistant to send an email with attachments ${JSON.stringify(attachments)} to '${recipient}'.`;
      await this.oobGate.stageProposal(
        proposalId,
        "send_email",
        summary,
        diff,
        triggeringSourceId
      );

      return {
        proposal_id: proposalId,
        recipient,
        subject,
        body_preview: body,
        attachments,
        source_email_sender: sourceSender,
        trust_level: trustLvl,
        is_blocked: true,
        plain_reason: `A stranger (${sourceSender}) requested your assistant to send an email with files ${JSON.stringify(attachments)} to ${recipient}. Block or allow?`,
        hold_seconds: 10,
        created_at: Date.now() / 1000,
      };
    }

    return {
      proposal_id: proposalId,
      recipient,
      subject,
      body_preview: body,
      attachments,
      source_email_sender: sourceSender,
      trust_level: trustLvl,
      is_blocked: false,
      plain_reason: "Direct user command. Permitted under standard 10-second cancel hold.",
      hold_seconds: 10,
      created_at: Date.now() / 1000,
    };
  }
}
