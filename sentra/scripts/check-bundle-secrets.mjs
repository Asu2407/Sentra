import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.cwd(), "apps/web/dist");
const patterns = [/GEMINI_API_KEY/, /ELEVENLABS_API_KEY/, /GOOGLE_CLIENT_SECRET/, /AIza[0-9A-Za-z_-]{20,}/];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

if (!fs.existsSync(distDir)) {
  console.error("apps/web/dist not found; run npm run build first.");
  process.exit(1);
}

const hits = [];
for (const file of walk(distDir)) {
  const text = fs.readFileSync(file, "utf8");
  for (const pat of patterns) {
    if (pat.test(text)) hits.push(`${file}: matched ${pat}`);
  }
}

if (hits.length > 0) {
  console.error("SECRET_LEAK_DETECTED:\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`Bundle secret scan passed (${walk(distDir).length} files checked, 0 leaks).`);
