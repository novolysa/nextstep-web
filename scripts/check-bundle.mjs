// Fails if the production browser bundle contains anything that looks like a secret:
// OAuth client secrets, private keys, or any value from local infrastructure/service env files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(root, ".next/static");
if (!fs.existsSync(bundle)) {
  console.error("No production build found; run `pnpm build` first.");
  process.exit(1);
}
// The OIDC library mentions `client_secret` as a parameter name; flag only literal values.
const patterns = [
  /client_secret["']?\s*[:=]\s*["'`][^"'`]{6,}/i,
  /SERVICE_CLIENT_SECRET/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
];
const values = new Set();
for (const file of [
  "../nextstep-infrastructure/.env",
  "../nextstep-infrastructure/.local-stack/local-user.json",
  "../nextstep-infrastructure/.local-stack/minio-capture.json",
]) {
  const full = path.resolve(root, file);
  if (!fs.existsSync(full)) continue;
  const text = fs.readFileSync(full, "utf8");
  for (const match of text.matchAll(/(?:=|":\s*")([^"\n]{8,})/g)) values.add(match[1]);
}
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|css|html|json|map)$/.test(entry.name)) files.push(full);
  }
};
walk(bundle);
const findings = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const p of patterns) if (p.test(text)) findings.push(`${path.relative(root, file)}: matches ${p}`);
  for (const v of values)
    if (text.includes(v)) findings.push(`${path.relative(root, file)}: contains a local secret value`);
}
if (findings.length) {
  console.error(`Possible secrets in the browser bundle:\n${findings.join("\n")}`);
  process.exit(1);
}
console.log(`No secrets found in ${files.length} browser bundle files (${values.size} local secret values checked).`);
