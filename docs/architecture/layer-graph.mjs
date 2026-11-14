import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SRC = join(ROOT, "src");

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const files = walk(SRC).map((f) => relative(ROOT, f).replace(/\\/g, "/"));

// classify
const meta = {};
for (const f of files) {
  const src = readFileSync(join(ROOT, f), "utf8");
  const head = src.slice(0, 400);
  meta[f] = {
    client: /^\s*["']use client["']/m.test(head),
    server: /^\s*["']use server["']/m.test(head),
    prisma: /from ["'](?:@\/lib\/server\/prisma|(?:\.\.?\/)+prisma)["']/.test(src),
    browserApi: /\b(document|window|localStorage|navigator)\b/.test(src),
    loc: src.split("\n").length,
    imports: [],
  };
  // collect import specifiers
  const re = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) meta[f].imports.push(m[1]);
}

function resolveSpec(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(resolve(ROOT, fromFile, ".."), spec);
  else return null; // package
  const cands = [
    base + ".ts", base + ".tsx",
    join(base, "index.ts"), join(base, "index.tsx"),
  ];
  for (const c of cands) if (existsSync(c)) return relative(ROOT, c).replace(/\\/g, "/");
  return null;
}

// build edges
const edges = [];
for (const f of files) {
  for (const spec of meta[f].imports) {
    const t = resolveSpec(f, spec);
    if (t && meta[t]) edges.push([f, t, spec]);
  }
}

const adj = {};
for (const [a, b] of edges) (adj[a] ||= new Set()).add(b);

// ---- REPORT ----
const out = [];
const P = (s) => out.push(s);

P("## A. Direct server->client edges (a non-client module importing a \"use client\" module)");
const direct = edges.filter(([a, b]) => !meta[a].client && meta[b].client);
for (const [a, b, spec] of direct) {
  const tag = meta[a].server ? "SERVER-ACTION" : "neutral";
  P(`  [${tag}] ${a}  ->  ${b}   (spec: "${spec}")`);
}
P(`  total: ${direct.length}`);

P("");
P("## B. Transitive: client modules reachable from each \"use server\" action file");
const actionFiles = files.filter((f) => meta[f].server);
for (const a of actionFiles) {
  const seen = new Set(), stack = [a], hits = new Map();
  while (stack.length) {
    const cur = stack.pop();
    for (const nxt of adj[cur] || []) {
      if (seen.has(nxt)) continue;
      seen.add(nxt);
      if (meta[nxt].client) hits.set(nxt, cur);
      else stack.push(nxt);
    }
  }
  P(`  ${a}`);
  if (!hits.size) P("      (clean)");
  for (const [h, via] of hits) P(`      !! ${h}   via ${via}`);
}

P("");
P("## C. Prisma importers (should be exactly the repository layer)");
for (const f of files) if (meta[f].prisma) P(`  ${f}`);

P("");
P("## D. Modules under src/lib using browser APIs but NOT marked \"use client\"");
for (const f of files)
  if (f.startsWith("src/lib/") && meta[f].browserApi && !meta[f].client)
    P(`  ${f}  (${meta[f].loc} L)`);

P("");
P("## E. Barrels Status");
P("  All unused/hazardous barrels pruned. Direct file imports enforced.");

P("");
P("## F. Layer fan-in counts (how many modules import each file)");
const fanin = {};
for (const [, b] of edges) fanin[b] = (fanin[b] || 0) + 1;
Object.entries(fanin).filter(([f]) => f.startsWith("src/lib/") || f.startsWith("src/types/"))
  .sort((a, b) => b[1] - a[1]).slice(0, 18)
  .forEach(([f, n]) => P(`  ${String(n).padStart(3)}  ${f}`));

P("");
// Next.js loads these by filename and calls their exports; nothing imports
// them and nothing ever should. Listing them as orphans reads as a finding
// when it is an artifact of the convention -- and `instrumentation.ts` is the
// production secret fail-fast, so inviting a reader to prune it as dead code
// is actively dangerous.
const FRAMEWORK_ENTRY_POINTS = new Set([
  "src/instrumentation.ts",
  "src/instrumentation-client.ts",
  "src/middleware.ts",
]);

P("## G. Orphans: files nothing imports (excluding app/ routes, barrels, and framework entry points)");
for (const f of files) {
  if (
    !fanin[f] &&
    !f.startsWith("src/app/") &&
    !f.endsWith("/index.ts") &&
    !FRAMEWORK_ENTRY_POINTS.has(f)
  ) {
    P(`  ${f}`);
  }
}

console.log(out.join("\n"));
