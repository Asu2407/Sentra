import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxDemoPanel } from "../src/components/InboxDemoPanel.tsx";
import { VoiceAgentPanel } from "../src/components/VoiceAgentPanel.tsx";

describe("VoiceAgentPanel & InboxDemoPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  it("transitions through idle, listening, thinking, and speaking states", async () => {
    let recInstance: {
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      start: () => void;
    } | null = null;
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = class {
      lang = "en-US";
      interimResults = false;
      onresult = null;
      onerror = null;
      onend = null;
      start() {
        recInstance = this;
      }
    };

    let resolveAsk!: (v: Response) => void;
    let resolveSpeak!: (v: Response) => void;
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      const s = String(url);
      if (s === "/api/agent/ask") {
        return new Promise<Response>((res) => {
          resolveAsk = res;
        });
      }
      if (s === "/api/voice/speak") {
        return new Promise<Response>((res) => {
          resolveSpeak = res;
        });
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const onChaos = vi.fn();
    render(
      <MemoryRouter>
        <VoiceAgentPanel csrf="csrf-1" onChaosChange={onChaos} onActionComplete={vi.fn()} />
      </MemoryRouter>
    );

    const section = screen.getByLabelText("Gemini Voice Assistant");
    expect(section).toHaveAttribute("data-voice-state", "idle");

    // listening
    fireEvent.click(screen.getByRole("button", { name: "Speak to Sentra" }));
    expect(section).toHaveAttribute("data-voice-state", "listening");
    expect(recInstance).not.toBeNull();

    // trigger transcript -> thinking
    act(() => {
      recInstance!.onresult?.({ results: [[{ transcript: "Check conflicts" }]] });
    });
    expect(section).toHaveAttribute("data-voice-state", "thinking");
    expect(onChaos).toHaveBeenCalledWith("thinking");

    // resolve /api/agent/ask -> speaking
    await act(async () => {
      resolveAsk(
        new Response(
          JSON.stringify({
            reply: "Staged a sync meeting for approval.",
            tool_calls: [
              { name: "detect_conflicts", result: { status: "CONFLICTS_FOUND" } },
              {
                name: "propose_action",
                result: { status: "STAGED_FOR_APPROVAL", proposal_id: "PROP_TEST1" },
              },
            ],
          }),
          { status: 200 }
        )
      );
    });

    await waitFor(() => expect(section).toHaveAttribute("data-voice-state", "speaking"));
    expect(screen.getByTestId("user-slip")).toHaveTextContent("Check conflicts");
    expect(screen.getByText("detect_conflicts")).toBeInTheDocument();
    expect(screen.getByText("Staged: waiting for your approval")).toHaveAttribute(
      "href",
      "/approve/PROP_TEST1"
    );

    // resolve /api/voice/speak (503 fallback with no speechSynthesis -> back to idle)
    await act(async () => {
      resolveSpeak(new Response("{}", { status: 503 }));
    });
    await waitFor(() => expect(section).toHaveAttribute("data-voice-state", "idle"));
  });

  it("escapes hostile HTML/JS in email body and never renders raw HTML elements", () => {
    render(
      <MemoryRouter>
        <InboxDemoPanel csrf="csrf-1" quarantineCount={1} onIngested={vi.fn()} />
      </MemoryRouter>
    );

    const bodyInput = screen.getByLabelText("Ingest body");
    fireEvent.change(bodyInput, {
      target: { value: 'Hello <img src=x onerror="alert(1)"> urgent' },
    });

    expect(document.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByLabelText("Scanned email letter")).toHaveTextContent(
      '<img src=x onerror="alert(1)">'
    );
  });

  it("highlights flags returned by the scan response and calls /api/inbox/ingest once", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === "/api/inbox/ingest") {
        return new Response(
          JSON.stringify({
            scan: {
              sender: "hr@internship-secure-portal.xyz",
              subject: "Urgent: Internship confirmation - act within 2 hours",
              risk_level: "LIKELY_SCAM",
              flags: [
                "Suspicious lookalike sender domain: 'internship-secure-portal.xyz'",
                "Urgent psychological pressure detected: 'act within 2 hours'",
                "Demands sensitive credentials / personal ID / fee: 'national ID scan'",
                "Deceptive link text mismatch: Visible 'https://portal.university.edu/confirm' -> Real 'http://internship-secure-portal.xyz/steal'",
              ],
              plain_warning: "High risk phishing",
              spoken_summary: "Suspicious email from internship-secure-portal.xyz.",
              action_recommended: "MOVE_TO_REVIEW",
            },
            quarantined: true,
            quarantine_id: "INGEST_ABC123",
          }),
          { status: 200 }
        );
      }
      return new Response("{}", { status: 503 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <InboxDemoPanel csrf="csrf-1" quarantineCount={2} onIngested={vi.fn()} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Scan & Ingest Email" }));

    await waitFor(() => expect(screen.getByText("QUARANTINED")).toBeInTheDocument());

    const ingestCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]) === "/api/inbox/ingest"
    );
    expect(ingestCalls).toHaveLength(1);

    const marks = document.querySelectorAll("mark.flag-hl");
    expect(marks.length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Link mismatch")).toHaveTextContent(
      "https://portal.university.edu/confirm"
    );
    expect(screen.getByText("Look-alike domain")).toBeInTheDocument();
    expect(screen.getByText("Urgent pressure")).toBeInTheDocument();
    expect(screen.getByText("Asks for ID")).toBeInTheDocument();
    expect(screen.getByText("Link mismatch")).toBeInTheDocument();
    expect(screen.getByText("LIKELY_SCAM")).toBeInTheDocument();
  });
});
