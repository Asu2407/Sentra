import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "../src/pages/Dashboard.tsx";

describe("Dashboard React Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    vi.useRealTimers();
  });

  it("calls approve API with credentials and X-Sentra-CSRF when signed in", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s === "/api/session") {
        return new Response(
          JSON.stringify({ authenticated: true, user: "local-approver", csrf: "csrf-tok-123" }),
          { status: 200 }
        );
      }
      if (s === "/api/state") {
        return new Response(
          JSON.stringify({
            proposals: [
              { id: "P1", no: "0184", title: "Leave for station", trust: "FULL", source: "demo" },
            ],
            quarantine: [],
            audit: [],
            chain_valid: true,
          }),
          { status: 200 }
        );
      }
      if (s === "/api/proposals/P1/approve") {
        return new Response(JSON.stringify({ audit: { n: 1, text: "approved P1" } }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]) === "/api/proposals/P1/approve");
      expect(call).toBeDefined();
      const init = call![1] as RequestInit;
      expect(init.credentials).toBe("include");
      expect((init.headers as Record<string, string>)["X-Sentra-CSRF"]).toBe("csrf-tok-123");
    });
  });

  it("focuses sign-in bar and blocks approve call when signed out", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s === "/api/session") {
        return new Response(JSON.stringify({ authenticated: false, user: null, csrf: null }), { status: 200 });
      }
      if (s === "/api/state") {
        return new Response(
          JSON.stringify({
            proposals: [{ id: "P1", no: "0184", title: "Leave for station", trust: "FULL", source: "demo" }],
            quarantine: [],
            audit: [],
            chain_valid: true,
          }),
          { status: 200 }
        );
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(screen.getByText("Sign in above to countersign proposals.")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Approver password"));
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/approve"))).toBe(false);
  });

  it("pauses polling when document.hidden is true and animates an mcp proposal only once", async () => {
    vi.useFakeTimers();
    let pollStep = 0;
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s === "/api/session") {
        return new Response(JSON.stringify({ authenticated: false, user: null, csrf: null }), { status: 200 });
      }
      if (s === "/api/state") {
        pollStep += 1;
        const proposals =
          pollStep >= 2
            ? [
                { id: "P1", no: "0184", title: "Leave", trust: "FULL", source: "demo" },
                { id: "PROP_MCP_9", no: "CP_9", title: "Live MCP task", trust: "FULL", source: "mcp" },
              ]
            : [{ id: "P1", no: "0184", title: "Leave", trust: "FULL", source: "demo" }];
        return new Response(JSON.stringify({ proposals, quarantine: [], audit: [], chain_valid: true }), {
          status: 200,
        });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const stateCallsInitial = fetchMock.mock.calls.filter((c) => c[0] === "/api/state").length;
    expect(stateCallsInitial).toBe(1);

    // Pause when hidden
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await act(async () => {
      vi.advanceTimersByTime(4500);
      await Promise.resolve();
    });
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/state").length).toBe(1);

    // Resume when visible -> new mcp proposal arrives and animates once
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    await act(async () => {
      vi.advanceTimersByTime(4500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("Agent staged a proposal")).toBeInTheDocument();

    // Finish arrival animation and poll again -> same MCP ID does not replay arrival animation
    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(4500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("Held in your tray")).toBeInTheDocument();
  });
});
