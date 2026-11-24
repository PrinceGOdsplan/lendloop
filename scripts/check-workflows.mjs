#!/usr/bin/env node
// Static checks on the exported n8n workflows (run in CI with `npm run check:workflows`):
//  - valid JSON with nodes + connections
//  - no credentials blocks and nothing that looks like a secret or token
//  - only allow-listed $env variables are referenced
//  - every HTTP Request node retries; every workflow (except the handler) has an error workflow
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../n8n/workflows/", import.meta.url).pathname;
const ALLOWED_ENV = new Set(["LENDLOOP_CONVEX_SITE_URL", "LENDLOOP_TO_N8N_SECRET", "N8N_TO_LENDLOOP_SECRET"]);
const SECRET_PATTERNS = [
  [/sha256=[0-9a-f]{64}/i, "a literal HMAC signature"],
  [/\b(sk|pk|rk)_(test|live)_[A-Za-z0-9]+/, "a Clerk/Stripe-style key"],
  [/\b[0-9a-f]{40,}\b/i, "a long hex string"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "a JWT"],
  [/(secret|password|token|apikey|api_key)\s*[:=]\s*['"][^'"$]{6,}['"]/i, "a hard-coded secret assignment"],
];

let failures = 0;
const fail = (file, msg) => {
  failures++;
  console.error(`✖ ${file}: ${msg}`);
};

const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
if (files.length < 3) fail("n8n/workflows", `expected at least 3 workflows, found ${files.length}`);
const ids = new Set();

for (const file of files) {
  const raw = readFileSync(join(dir, file), "utf8");
  let wf;
  try {
    wf = JSON.parse(raw);
  } catch (e) {
    fail(file, `invalid JSON: ${e.message}`);
    continue;
  }
  ids.add(wf.id);
  if (!Array.isArray(wf.nodes) || typeof wf.connections !== "object") fail(file, "missing nodes/connections");
  for (const [re, what] of SECRET_PATTERNS) if (re.test(raw)) fail(file, `contains ${what}`);
  for (const m of raw.matchAll(/\$env\.([A-Z0-9_]+)/g)) {
    if (!ALLOWED_ENV.has(m[1])) fail(file, `references unexpected env var ${m[1]}`);
  }
  for (const node of wf.nodes ?? []) {
    if (node.credentials) fail(file, `node "${node.name}" has a credentials block`);
    if (node.type === "n8n-nodes-base.httpRequest" && !node.retryOnFail) {
      fail(file, `HTTP node "${node.name}" has no retries`);
    }
    for (const target of Object.keys(wf.connections ?? {})) {
      if (!wf.nodes.some((n) => n.name === target)) fail(file, `connection from unknown node "${target}"`);
    }
  }
  const isHandler = wf.nodes?.some((n) => n.type === "n8n-nodes-base.errorTrigger");
  if (!isHandler && !wf.settings?.errorWorkflow) fail(file, "no settings.errorWorkflow");
  console.log(`✔ ${file} (${wf.nodes?.length ?? 0} nodes)`);
}

for (const file of files) {
  const wf = JSON.parse(readFileSync(join(dir, file), "utf8"));
  if (wf.settings?.errorWorkflow && !ids.has(wf.settings.errorWorkflow)) {
    fail(file, `errorWorkflow ${wf.settings.errorWorkflow} is not one of the exported workflows`);
  }
}

if (failures) {
  console.error(`\n${failures} problem(s) found`);
  process.exit(1);
}
console.log("All workflow exports are valid and credential-free.");
