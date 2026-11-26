import fs from "node:fs";
import path from "node:path";
import { runSecurityBenchmark } from "../src/benchmark.js";

const outPath = path.resolve(process.cwd(), "fixtures", "benchmark_results.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const report = await runSecurityBenchmark();
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(
  `Benchmark complete: ${report.passed}/${report.total} passed (${report.blocked} blocked, ${report.allowed} allowed) -> ${outPath}`
);
