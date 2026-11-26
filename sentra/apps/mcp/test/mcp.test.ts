import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SENTRA_ROOT = path.resolve(__dirname, "..", "..", "..");

describe("Sentra MCP Stdio Server", () => {
  let mongod: MongoMemoryServer;
  let mongoUri = "";

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    mongoUri = mongod.getUri();
  });

  afterAll(async () => {
    if (mongod) await mongod.stop();
  });

  it("lists all 5 tools, calls each once, and writes only valid JSON-RPC frames to stdout", async () => {
    const mcpDist = path.join(SENTRA_ROOT, "apps", "mcp", "dist", "server.js");
    const proc = spawn("node", [mcpDist], {
      env: { ...process.env, MONGODB_URI: mongoUri, SENTRA_UI_URL: "http://127.0.0.1:8001" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const responses = new Map<number, unknown>();
    const rawLines: string[] = [];
    let buffer = "";

    const waitForId = (id: number) =>
      new Promise<unknown>((resolve, reject) => {
        const timer = setInterval(() => {
          if (responses.has(id)) {
            clearInterval(timer);
            resolve(responses.get(id));
          }
        }, 20);
        setTimeout(() => {
          clearInterval(timer);
          reject(new Error(`Timeout waiting for JSON-RPC response id=${id}`));
        }, 20000);
      });

    proc.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        rawLines.push(line);
        const parsed = JSON.parse(line) as { id?: number; jsonrpc?: string };
        expect(parsed.jsonrpc).toBe("2.0");
        if (typeof parsed.id === "number") {
          responses.set(parsed.id, parsed);
        }
      }
    });

    const send = (obj: unknown) => proc.stdin.write(`${JSON.stringify(obj)}\n`);

    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0" } },
    });
    await waitForId(1);
    send({ jsonrpc: "2.0", method: "notifications/initialized" });

    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const listResp = (await waitForId(2)) as { result: { tools: Array<{ name: string }> } };
    const toolNames = listResp.result.tools.map((t) => t.name).sort();
    expect(toolNames).toEqual([
      "detect_conflicts",
      "generate_replan_options",
      "propose_action",
      "propose_send_email",
      "scan_email",
      "summarize_inbox",
    ]);

    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "detect_conflicts", arguments: {} } });
    await waitForId(3);

    send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "generate_replan_options", arguments: {} } });
    await waitForId(4);

    send({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "propose_action",
        arguments: {
          action_type: "create_event",
          summary: "MCP test event",
          diff_preview: { after: "12:00" },
          source_id: "SRC_USER_CHAT",
        },
      },
    });
    const propResp = (await waitForId(5)) as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(propResp.result.content[0].text).review_url).toContain("http://127.0.0.1:8001/approve/");

    send({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "scan_email",
        arguments: { sender: "hr@internship-secure-portal.xyz", subject: "Urgent", body: "Send national ID scan" },
      },
    });
    await waitForId(6);

    send({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "propose_send_email",
        arguments: {
          recipient: "hr@internship-secure-portal.xyz",
          subject: "Re: ID",
          body: "Attached",
          attachments: ["id.pdf"],
          source_id: "SRC_STRANGER_EMAIL",
        },
      },
    });
    await waitForId(7);

    send({ jsonrpc: "2.0", id: 8, method: "prompts/list", params: {} });
    const promptRes = (await waitForId(8)) as {
      result?: { prompts?: Array<{ name: string }> };
    };
    const promptNames = (promptRes.result?.prompts ?? []).map((p) => p.name);
    expect(promptNames).toContain("prepare-tomorrow");
    expect(promptNames).toContain("triage-inbox");

    // Verify resources use sentra:// (no disha://) and tools remain stage-only
    send({ jsonrpc: "2.0", id: 9, method: "resources/list", params: {} });
    const resList = (await waitForId(9)) as {
      result?: { resources?: Array<{ uri: string }> };
    };
    const uris = (resList.result?.resources ?? []).map((r) => r.uri);
    expect(uris).toContain("sentra://schedule/today");
    expect(uris).toContain("sentra://briefing/daily");
    expect(uris).toContain("sentra://guide/beginner");
    expect(uris.some((u) => u.startsWith("disha://"))).toBe(false);

    // Stage-only invariant: no tool can approve/reject/mint/execute, and propose_action returns no token
    send({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "summarize_inbox", arguments: {} },
    });
    const sumResp = (await waitForId(10)) as { result: { content: Array<{ text: string }> } };
    const sumJson = JSON.parse(sumResp.result.content[0].text) as {
      total: number;
      scam_count: number;
      quarantined_ids: string[];
    };
    expect(sumJson.total).toBe(3);
    expect(sumJson.scam_count).toBeGreaterThanOrEqual(1);
    expect(sumJson.quarantined_ids.length).toBeGreaterThanOrEqual(1);

    const stagedText = JSON.stringify(propResp ?? {});
    expect(stagedText).not.toContain('"token"');
    expect(toolNames.some((n) => /approve|reject|mint|execute/i.test(n))).toBe(false);

    proc.kill();
    expect(rawLines.length).toBeGreaterThanOrEqual(10);
  });
});
