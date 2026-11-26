import { StrictMode } from "react";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChaosField } from "../src/components/ChaosField.tsx";
import { GeminiAssistant } from "../src/components/assistant/GeminiAssistant.tsx";
import { Dashboard } from "../src/pages/Dashboard.tsx";

describe("GeminiAssistant & ChaosField", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  it("Composer: idle -> listening -> idle with SpeechRecognition, Enter sends, Ask disabled while thinking, unsupported mic shows inline error", async () => {
    // 1) Unsupported mic
    render(
      <MemoryRouter>
        <GeminiAssistant csrf="csrf-1" onActionComplete={vi.fn()} />
      </MemoryRouter>
    );
    const bar = document.querySelector(".bar")!;
    expect(bar).toHaveAttribute("data-s", "idle");
    // Nothing renders in conversation before first message
    expect(screen.queryByTestId("user-slip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reply-slip")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Speak to Sentra" }));
    expect(bar).toHaveAttribute("data-s", "idle");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Microphone is not available. Type your request instead."
    );
    cleanup();

    // 2) Mocked SpeechRecognition + Enter + disabled while thinking
    let recInstance: {
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onend: (() => void) | null;
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
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === "/api/agent/ask") {
        return new Promise<Response>((res) => {
          resolveAsk = res;
        });
      }
      return Promise.resolve(new Response("{}", { status: 503 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <GeminiAssistant csrf="csrf-1" onActionComplete={vi.fn()} />
      </MemoryRouter>
    );

    const orb = screen.getByRole("button", { name: "Speak to Sentra" });
    fireEvent.click(orb);
    expect(document.querySelector(".bar")).toHaveAttribute("data-s", "listening");
    expect(orb).toHaveAttribute("aria-pressed", "true");

    act(() => {
      recInstance!.onresult?.({ results: [[{ transcript: "Check conflicts" }]] });
      recInstance!.onend?.();
    });
    await waitFor(() => expect(document.querySelector(".bar")).toHaveAttribute("data-s", "thinking"));
    expect(screen.getByRole("button", { name: "Ask Gemini" })).toBeDisabled();

    await act(async () => {
      resolveAsk(
        new Response(
          JSON.stringify({ reply: "Done.", tool_calls: [{ name: "detect_conflicts", result: {} }] }),
          { status: 200 }
        )
      );
    });
    await waitFor(() => expect(document.querySelector(".bar")).toHaveAttribute("data-s", "idle"));

    // Enter sends
    const input = screen.getByLabelText("Ask Gemini");
    fireEvent.change(input, { target: { value: "Hello via Enter" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(document.querySelector(".bar")).toHaveAttribute("data-s", "thinking"));
  });

  it("Conversation: renders slips, real tool stamps, and staged chip only when staged proposal exists", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          reply: "Checked schedule.",
          tool_calls: [{ name: "detect_conflicts", result: { status: "CONFLICTS_FOUND" } }],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <GeminiAssistant csrf="csrf-1" onActionComplete={vi.fn()} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Check my schedule" }));
    await waitFor(() => expect(screen.getByTestId("reply-slip")).toBeInTheDocument());
    expect(screen.getByTestId("user-slip")).toHaveTextContent("Check my schedule");
    expect(screen.getByText("detect_conflicts")).toBeInTheDocument();
    expect(screen.queryByText("Staged: waiting for your approval")).not.toBeInTheDocument();
  });

  it("Scan: highlights real flags, calls /api/inbox/ingest once under StrictMode, and safe verdict shows no stamp", async () => {
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
              spoken_summary: "Suspicious email.",
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
      <StrictMode>
        <MemoryRouter>
          <GeminiAssistant csrf="csrf-1" quarantineCount={3} onActionComplete={vi.fn()} />
        </MemoryRouter>
      </StrictMode>
    );

    fireEvent.click(screen.getByRole("button", { name: "Try a sample email" }));
    await waitFor(() => expect(screen.getByText("QUARANTINED")).toBeInTheDocument());

    const ingestCalls = fetchMock.mock.calls.filter((c) => String(c[0]) === "/api/inbox/ingest");
    expect(ingestCalls).toHaveLength(1);
    expect(document.querySelectorAll("mark").length).toBeGreaterThan(0);
    expect(screen.getByText("LIKELY_SCAM")).toBeInTheDocument();
    expect(screen.getByLabelText("Link mismatch")).toHaveTextContent("https://portal.university.edu/confirm");
    expect(screen.getByLabelText("Quarantine tin")).toHaveTextContent("Quarantine: 3");

    cleanup();

    // SAFE verdict: no stamp, no quarantine
    const safeFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          scan: {
            sender: "boss@company.com",
            subject: "Sync",
            risk_level: "SAFE",
            flags: [],
            plain_warning: "Routine correspondence.",
            spoken_summary: "Safe email.",
            action_recommended: "OPEN_SAFELY",
          },
          quarantined: false,
          quarantine_id: null,
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", safeFetch);

    render(
      <MemoryRouter>
        <GeminiAssistant csrf="csrf-1" quarantineCount={0} onActionComplete={vi.fn()} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Try a sample email" }));
    await waitFor(() => expect(screen.getByText("SAFE")).toBeInTheDocument());
    expect(screen.queryByText("QUARANTINED")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Quarantine tin")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("reply-slip")).toHaveTextContent("looks safe")
    );
  });

  it("Security: hostile HTML/JS in email renders as plain text and assistant never calls approval/execution routes", async () => {
    const hostile = 'Hi <img src=x onerror="alert(1)"> javascript:alert(1)';
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          reply: "Scanned.",
          tool_calls: [
            {
              name: "scan_email",
              result: {
                sender: "evil@example.xyz",
                subject: "Hostile",
                risk_level: "LIKELY_SCAM",
                flags: [],
                plain_warning: hostile,
                spoken_summary: "Warning.",
                action_recommended: "MOVE_TO_REVIEW",
              },
            },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <GeminiAssistant csrf="csrf-1" onActionComplete={vi.fn()} />
      </MemoryRouter>
    );

    const input = screen.getByLabelText("Ask Gemini");
    fireEvent.change(input, { target: { value: "Scan email" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask Gemini" }));

    const letter = await screen.findByLabelText("Scanned email letter");
    expect(letter.querySelectorAll("img")).toHaveLength(0);
    expect(letter.querySelectorAll("a")).toHaveLength(0);
    expect(letter).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(letter).toHaveTextContent("javascript:alert(1)");

    const forbidden = fetchMock.mock.calls.filter((c) =>
      /\/(approve|reject|restore|mint|selftest)/.test(String(c[0]))
    );
    expect(forbidden).toHaveLength(0);
  });

  it("Hero sync & cleanup: thinking -> sorted (2000ms) -> idle, idle on error, dev buttons hidden in prod, old inbox panel gone", async () => {
    render(
      <MemoryRouter>
        <ChaosField state="idle" showDevControls={false} onStateChange={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.queryByRole("button", { name: "Simulate a Gemini run" })).not.toBeInTheDocument();
    cleanup();

    let resolveAsk!: (v: Response) => void;
    let rejectNext = false;
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      const s = String(url);
      if (s === "/api/session") {
        return Promise.resolve(
          new Response(JSON.stringify({ authenticated: true, user: "a", csrf: "c1" }), { status: 200 })
        );
      }
      if (s === "/api/state") {
        return Promise.resolve(
          new Response(JSON.stringify({ proposals: [], quarantine: [], audit: [], chain_valid: true }), {
            status: 200,
          })
        );
      }
      if (s === "/api/agent/ask") {
        if (rejectNext) {
          return Promise.resolve(new Response(JSON.stringify({ detail: "Boom" }), { status: 500 }));
        }
        return new Promise<Response>((res) => {
          resolveAsk = res;
        });
      }
      return Promise.resolve(new Response("{}", { status: 503 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByLabelText("Gemini Voice Assistant")).toBeInTheDocument());
    expect(screen.queryByLabelText("Email Scam & Voice Summary Demo")).not.toBeInTheDocument();

    const hero = screen.getByLabelText("Sentra Gemini orbit hero");
    expect(hero).toHaveAttribute("data-chaos-state", "idle");

    fireEvent.click(screen.getByRole("button", { name: "Check my schedule" }));
    expect(hero).toHaveAttribute("data-chaos-state", "thinking");

    vi.useFakeTimers();
    await act(async () => {
      resolveAsk(new Response(JSON.stringify({ reply: "OK", tool_calls: [] }), { status: 200 }));
    });
    expect(hero).toHaveAttribute("data-chaos-state", "sorted");

    act(() => {
      vi.advanceTimersByTime(2050);
    });
    expect(hero).toHaveAttribute("data-chaos-state", "idle");
    vi.useRealTimers();

    // Error goes straight to idle
    rejectNext = true;
    fireEvent.click(screen.getByRole("button", { name: "Check my schedule" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Boom"));
    expect(hero).toHaveAttribute("data-chaos-state", "idle");
  });

  it("Accessibility: aria-live announces replies and reduced-motion renders final states", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ reply: "Reduced motion reply.", tool_calls: [] }), {
          status: 200,
        })
      )
    );

    render(
      <MemoryRouter>
        <GeminiAssistant csrf="csrf-1" onActionComplete={vi.fn()} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Check my schedule" }));
    const live = document.querySelector('[aria-live="polite"]')!;
    await waitFor(() => expect(live).toHaveTextContent("Reply received: Reduced motion reply."));
    expect(screen.getByTestId("reply-slip")).toHaveTextContent("Reduced motion reply.");
  });
});
