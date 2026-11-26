import { describe, expect, it } from "vitest";
import { LocalSandboxExecutionAdapter, runSecurityBenchmark } from "../src/index.js";

describe("Security Benchmark & ExecutionAdapter", () => {
  it("runs all 25 security scenarios with 100% expected outcomes", async () => {
    const report = await runSecurityBenchmark();
    expect(report.total).toBe(25);
    expect(report.passed).toBe(25);
    expect(report.blocked).toBe(20);
    expect(report.allowed).toBe(5);
    expect(report.source).toBe("evaluation");
  });

  it("dispatches approved proposals via LocalSandboxExecutionAdapter", async () => {
    const adapter = new LocalSandboxExecutionAdapter();
    const res = await adapter.execute({
      proposal_id: "P1",
      action_type: "create_event",
      summary: "Leave for station at 06:10",
      diff_preview: {},
      source_id: "SRC_P1",
      created_at: 100,
      expires_at: 400,
      status: "APPROVED",
    });
    expect(res.executed).toBe(true);
    expect(res.adapter).toBe("local-sandbox");
    expect(adapter.history).toHaveLength(1);
  });
});
