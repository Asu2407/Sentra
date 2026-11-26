import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connect, disconnect } from "../packages/core/dist/index.js";
import { createApp } from "../apps/api/dist/app.js";

const outDir = path.resolve(process.cwd(), "..", "docs", "screens");
fs.mkdirSync(outDir, { recursive: true });

const mongod = await MongoMemoryServer.create();
await connect(mongod.getUri());

const password = crypto.randomBytes(16).toString("hex");
const sessionSecret = crypto.randomBytes(24).toString("hex");
const { app } = await createApp({
  authConfig: { approverPassword: password, sessionSecret, isProduction: false },
});

const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const consoleErrors = [];
const pageErrors = [];

try {
  const widths = [1440, 1024, 390];
  const pages = [
    { name: "dashboard", route: "/dashboard" },
    { name: "control-room", route: "/control-room" },
  ];

  // Signed-out screenshots
  const ctxOut = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pOut = await ctxOut.newPage();
  pOut.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  pOut.on("pageerror", (e) => pageErrors.push(e.message));

  for (const pg of pages) {
    for (const w of widths) {
      await pOut.setViewportSize({ width: w, height: 900 });
      await pOut.goto(`${baseUrl}${pg.route}`, { waitUntil: "networkidle" });
      const overflow = await pOut.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      await pOut.screenshot({
        path: path.join(outDir, `${pg.name}-signed-out-${w}.png`),
        fullPage: true,
      });
      console.log(`Captured ${pg.name}-signed-out-${w}.png (overflow=${overflow})`);
    }
  }
  await ctxOut.close();

  // Signed-in screenshots
  const ctxIn = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pIn = await ctxIn.newPage();
  pIn.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  pIn.on("pageerror", (e) => pageErrors.push(e.message));

  await pIn.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
  await pIn.fill("#approver-pw", password);
  await pIn.click('button:has-text("Sign in")');
  await pIn.waitForSelector("text=Signed in as");

  for (const pg of pages) {
    for (const w of widths) {
      await pIn.setViewportSize({ width: w, height: 900 });
      await pIn.goto(`${baseUrl}${pg.route}`, { waitUntil: "networkidle" });
      const overflow = await pIn.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      await pIn.screenshot({
        path: path.join(outDir, `${pg.name}-signed-in-${w}.png`),
        fullPage: true,
      });
      console.log(`Captured ${pg.name}-signed-in-${w}.png (overflow=${overflow})`);
    }
  }
  await ctxIn.close();

  console.log("CSP/Console errors:", consoleErrors.length, "Page errors:", pageErrors.length);
  if (consoleErrors.length) console.log(consoleErrors);
  if (pageErrors.length) console.log(pageErrors);
} finally {
  await browser.close();
  server.close();
  await disconnect();
  await mongod.stop();
}
