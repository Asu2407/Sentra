#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  DEFAULT_UI_URL,
  ENV_SENTRA_UI_URL,
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  connect,
} from "@sentra/core";
import { registerSentraTools } from "./tools.js";

async function main(): Promise<void> {
  await connect();

  const server = new McpServer(
    { name: SERVER_NAME, version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS }
  );

  await registerSentraTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  const uiUrl = (process.env[ENV_SENTRA_UI_URL]?.trim() || DEFAULT_UI_URL).replace(/\/+$/, "");
  console.error(`[${SERVER_NAME}] MCP server listening on stdio`);
  console.error(`[${SERVER_NAME}] Beginner Guideline:`);
  console.error(`  1. Read freely: detect_conflicts, generate_replan_options, scan_suspicious_email`);
  console.error(`  2. Stage writes with propose_action (source_id: "SRC_USER_CHAT"; LOW-trust sources are blocked)`);
  console.error(`  3. Countersign in the Approval console: ${uiUrl}/dashboard`);
}

main().catch((err) => {
  console.error(`[${SERVER_NAME}] Fatal startup error:`, err);
  process.exit(1);
});
