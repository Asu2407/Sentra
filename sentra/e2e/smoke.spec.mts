import crypto from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connect, disconnect } from "../packages/core/dist/index.js";
import { createApp } from "../apps/api/dist/app.js";

const SENTRA_ROOT = path.resolve(process.cwd());

test("dashboard: sign in, stage via MCP, see LIVE MCP within 5s, approve, audit updates", async ({
  page,
}) => {
  const mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri();
  await connect(mongoUri);

  const password = process.env.TEST_APPROVER_PASSWORD || crypto.randomBytes(16).toString("hex");
  const sessionSecret = process.env.TEST_SESSION_SECRET || crypto.randomBytes(24).toString("hex");
  const { app } = await createApp({
    authConfig: {
      approverPassword: password,
      sessionSecret,
      isProduction: false,
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    await page.goto(`${baseUrl}/dashboard`);
    await page.fill("#approver-pw", password);
    await page.click('button:has-text("Sign in")');
    await expect(page.locator("text=Signed in as")).toBeVisible();
    await expect(page.locator("text=SANDBOX")).toBeVisible();

    const mcpDist = path.join(SENTRA_ROOT, "apps", "mcp", "dist", "server.js");
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("node", [mcpDist], {
        env: { ...process.env, MONGODB_URI: mongoUri, SENTRA_UI_URL: baseUrl },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let buf = "";
      proc.stdout.on("data", (chunk) => {
        buf += chunk.toString();
        if (buf.includes("STAGED_FOR_APPROVAL")) {
          proc.kill();
          resolve();
        }
      });
      proc.on("error", reject);
      proc.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "pw", version: "1.0" },
          },
        }) + "\n"
      );
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
      proc.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "propose_action",
            arguments: {
              action_type: "create_event",
              summary: "Playwright MCP sync",
              diff_preview: { after: "14:00" },
              source_id: "SRC_USER_CHAT",
            },
          },
        }) + "\n"
      );
    });

    const liveSlip = page.locator("button.slip", { hasText: "Playwright MCP sync" });
    await expect(liveSlip).toBeVisible({ timeout: 5000 });
    await expect(liveSlip.locator(".badge-src.mcp")).toHaveText("LIVE MCP");

    await liveSlip.click();
    await page.click('button:has-text("Approve")');

    await expect(page.locator(".gate-log")).toContainText("approved PROP_", {
      timeout: 5000,
    });
    await expect(page.locator(".gate-log")).toContainText("Playwright MCP sync", {
      timeout: 5000,
    });
    await expect(page.locator('[aria-label="Calendar & Mail outbox"]')).toContainText(
      "Playwright MCP sync",
      { timeout: 5000 }
    );
    await expect(page.locator('[aria-label="Attack test record"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[aria-label="Attack test record"]')).toContainText("25", {
      timeout: 5000,
    });
  } finally {
    server.close();
    await disconnect();
    await mongod.stop();
  }
});
