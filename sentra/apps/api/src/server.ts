import "dotenv/config";
import { DEFAULT_PORT, connect, disconnect, syncAllIndexes } from "@sentra/core";
import { createApp } from "./app.js";
import { loadAuthConfig } from "./auth.js";

async function main(): Promise<void> {
  const authConfig = loadAuthConfig();
  await connect();
  await syncAllIndexes();
  const { app } = await createApp({ authConfig });
  const port = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10) || DEFAULT_PORT;

  const server = app.listen(port, "0.0.0.0", () => {
    console.error(`[Sentra-API] listening on http://0.0.0.0:${port}`);
  });

  const shutdown = async (signal: string) => {
    console.error(`[Sentra-API] received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await disconnect();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[Sentra-API] Fatal startup error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
