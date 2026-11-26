import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuditLedger,
  OOBExecutionGate,
  TaintTracker,
  syncAllIndexes,
} from "../src/index.js";

describe("Sentra MongoDB Concurrency", () => {
  let mongod: MongoMemoryServer;
  let connA: mongoose.Connection;
  let connB: mongoose.Connection;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    connA = await mongoose.createConnection(uri).asPromise();
    connB = await mongoose.createConnection(uri).asPromise();
    await syncAllIndexes(connA);
    await syncAllIndexes(connB);
  });

  afterAll(async () => {
    if (connA) await connA.close();
    if (connB) await connB.close();
    if (mongod) await mongod.stop();
  });

  it("allows exactly one of two separate Mongo connections to consume the same key", async () => {
    const trackerA = new TaintTracker(connA);
    const gateA = new OOBExecutionGate({ conn: connA, taintTracker: trackerA });
    const gateB = new OOBExecutionGate({ conn: connB, taintTracker: new TaintTracker(connB) });

    await trackerA.registerSource("SRC_RACE", "user_prompt", "FULL");
    await gateA.stageProposal("PROP_RACE", "create_event", "Concurrent event", {}, "SRC_RACE");
    const token = await gateA.mintToken("PROP_RACE", "SHARED_KEY_1");
    expect(token).not.toBeNull();

    const [resA, resB] = await Promise.all([
      gateA.verifyAndConsume(token!),
      gateB.verifyAndConsume(token!),
    ]);

    const successes = [resA, resB].filter((r) => r.ok);
    expect(successes).toHaveLength(1);
    const failures = [resA, resB].filter((r) => !r.ok);
    expect(failures).toHaveLength(1);
  });

  it("handles 10 concurrent AuditLedger.append() calls from two connections with no duplicate n", async () => {
    const ledgerA = new AuditLedger(connA);
    const ledgerB = new AuditLedger(connB);

    const calls = Array.from({ length: 10 }, (_, idx) =>
      idx % 2 === 0
        ? ledgerA.append("connA", `event-${idx}`)
        : ledgerB.append("connB", `event-${idx}`)
    );

    const results = await Promise.all(calls);
    const ns = results.map((r) => r.n);
    expect(new Set(ns).size).toBe(10);

    const verifyRes = await ledgerA.verify();
    expect(verifyRes).toEqual({ valid: true, firstBrokenIndex: null });
  });
});
