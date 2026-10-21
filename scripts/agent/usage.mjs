/**
 * `node scripts/agent.mjs usage`: what agent sessions in this repo cost, so every later agent
 * script can prove it saved something.
 *
 * Reads the Claude Code transcripts for this repo (the main checkout and every worktree, subagents
 * included), groups the transcript lines of one model request together, prices each request at its
 * own model's official rates, and reports aggregates only. It never prints message text or tool
 * output: the report holds counts, token totals, dollars, session ids, tool names and coarse
 * command classes such as `git diff` or `npm run test`.
 *
 * The core (everything exported) does no I/O and takes parsed records; `main` is the I/O shell.
 * `priceFiles` and `summarize` write each in-window request's price onto it, clearing any earlier
 * one first, and the analyses read "has a price" as "inside the window".
 * What it is the measuring stick for, and the baseline it recorded:
 * `tasks/open/agent-scripts-must-cut-what-a-session-costs.md`.
 *
 * Exit codes, as the rest of the repo: 0 the report was produced, 2 it could not be. There is no
 * exit 1, because a measurement has no failing state. An unpriceable request (unknown model, a
 * speed or region with no published price) is a 2, never a guess.
 */

import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";

import { caseFolder } from "../lib/invokedAs.mjs";
import { projectsDir as transcriptsHome, sessionId } from "./transcript.mjs";

// ================================ prices ================================

export const PRICE_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
export const PRICES_CHECKED = "2026-10-20";

/** USD per million tokens, copied from the "Model pricing" table at PRICE_SOURCE. */
const rates = (input, write5m, write1h, cacheRead, output) => ({ input, write5m, write1h, cacheRead, output });

export const PRICES = {
  "claude-fable-5-1": rates(10, 12.5, 20, 0.25, 50),
  "claude-fable-5": rates(10, 12.5, 20, 1, 50),
  "claude-opus-5-5": rates(4, 5, 8, 0.2, 20),
  "claude-opus-5": rates(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-8": rates(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-7": rates(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-6": rates(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-5": rates(5, 6.25, 10, 0.5, 25),
  "claude-sonnet-5-5": rates(2, 2.5, 4, 0.1, 10),
  "claude-sonnet-5": rates(2, 2.5, 4, 0.2, 10),
  "claude-sonnet-4-6": rates(3, 3.75, 6, 0.3, 15),
  "claude-sonnet-4-5": rates(3, 3.75, 6, 0.3, 15),
  // "A request whose prompt is over 100,000 tokens pays higher prices. A request's prompt length
  // counts all of its input tokens, including cache reads and cache writes. Each request is priced
  // on its own." Every rate moves, output included.
  "claude-haiku-5-5": { ...rates(0.1, 0.125, 0.2, 0.01, 0.5), over: { prompt: 100_000, ...rates(0.5, 0.625, 1, 0.05, 2.5) } },
  "claude-haiku-4-5": rates(1, 1.25, 2, 0.1, 5),
  // Still listed with prices, though retired outside some clouds or in limited availability.
  "claude-mythos-5-1": rates(10, 12.5, 20, 0.25, 50),
  "claude-mythos-5": rates(10, 12.5, 20, 1, 50),
  "claude-opus-4-1": rates(15, 18.75, 30, 1.5, 75),
  "claude-opus-4": rates(15, 18.75, 30, 1.5, 75),
  "claude-sonnet-4": rates(3, 3.75, 6, 0.3, 15),
  "claude-3-5-haiku": rates(0.8, 1, 1.6, 0.08, 4),
};

/**
 * "Fast mode pricing": Opus 5.5 at $8/$40, Opus 5 and Opus 4.8 at $10/$50, which is twice the
 * standard input and output rates, and "prompt caching multipliers apply on top", so every
 * category doubles. No other model has a fast price.
 */
const FAST_MULTIPLIER = { "claude-opus-5-5": 2, "claude-opus-5": 2, "claude-opus-4-8": 2 };

/** "Web search is $10 per 1,000 searches"; web fetch costs only its tokens. */
const WEB_SEARCH_USD = 0.01;

/** `inference_geo` values priced at standard rates. "us" is 1.1x on every category. */
const GEO_MULTIPLIER = { global: 1, not_available: 1, us: 1.1 };
/** Models before Claude 4.6, which do not take `inference_geo` and have no flat 1M pricing. */
const BEFORE_4_6 = new Set([
  "claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5",
  "claude-opus-4-1", "claude-opus-4", "claude-sonnet-4", "claude-3-5-haiku",
]);
/**
 * The pricing page promises the 1M context at standard rates for "Claude 4.6 and later models"
 * only, and publishes no long-context rates for the earlier ones, so a prompt over 200K on one of
 * them has no known price.
 */
const BEFORE_4_6_STANDARD_PROMPT = 200_000;

export class UnpriceableError extends Error {}

/** The PRICES key for a model id: a dated snapshot (`claude-haiku-4-5-20251001`) prices as its model. */
export const priceKey = (model) => String(model).replace(/-\d{8}$/, "");

/**
 * The rates one request pays, or a throw. `model` is the model that served the request
 * (`message.model`), not the one asked for: a fallback bills at the model that answered. A dated
 * snapshot id (`claude-haiku-4-5-20251001`) prices as its model, as the pricing page lists it.
 * `served`, when it differs (under --price-as), is the model whose transcript fields are checked.
 *
 * @param {{ model: string, served?: string, prompt: number, speed?: string | null, geo?: string | null, tier?: string | null }} request
 */
export function ratesFor({ model, served = model, prompt, speed, geo, tier: serviceTier }) {
  // The table is the standard tier's; batch and priority are priced differently.
  if (serviceTier != null && serviceTier !== "standard") throw new UnpriceableError(`no price for service tier ${serviceTier}`);
  const base = priceKey(model);
  const table = Object.hasOwn(PRICES, base) ? PRICES[base] : undefined;
  if (!table) throw new UnpriceableError(`no price for model ${model}`);
  let speedMultiplier = 1;
  // The model that served a fast request decides whether it had a fast price; under --price-as
  // the same premium is applied to the rates it is priced at, as the model is the one thing a
  // before/after comparison holds constant.
  const servedKey = priceKey(served);
  if (speed === "fast" && Object.hasOwn(FAST_MULTIPLIER, servedKey)) speedMultiplier = FAST_MULTIPLIER[servedKey];
  else if (speed != null && speed !== "standard") throw new UnpriceableError(`no price for ${servedKey} at speed ${speed}`);
  const geoMultiplier = geo == null ? 1 : Object.hasOwn(GEO_MULTIPLIER, geo) ? GEO_MULTIPLIER[geo] : undefined;
  if (geoMultiplier === undefined) throw new UnpriceableError(`no price for inference_geo ${geo}`);
  const multiplier = speedMultiplier * geoMultiplier;
  // "For Claude 4.6 and later models"; earlier ones refuse the parameter, so a US-only request
  // on one is a transcript this table does not understand.
  // Neither the model that served a US-only request nor the model it is priced at may be one
  // that has no US-only price.
  for (const name of new Set([priceKey(served), base])) {
    if (geo === "us" && BEFORE_4_6.has(name)) throw new UnpriceableError(`no price for ${name} with inference_geo us`);
  }
  if (BEFORE_4_6.has(base) && prompt > BEFORE_4_6_STANDARD_PROMPT) {
    throw new UnpriceableError(`no published price for ${base} above a ${BEFORE_4_6_STANDARD_PROMPT / 1000}K prompt`);
  }
  const tier = table.over && prompt > table.over.prompt ? table.over : table;
  return {
    input: tier.input * multiplier,
    write5m: tier.write5m * multiplier,
    write1h: tier.write1h * multiplier,
    cacheRead: tier.cacheRead * multiplier,
    output: tier.output * multiplier,
  };
}

// ================================ classification ================================

const SHELLS = new Set(["Bash", "PowerShell"]);
/** Tools whose result is a person's answer. */
const PERSON_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode"]);
/** Tools that read files by path; their "command" is the path and pattern they were given. */
const FILE_TOOLS = new Set(["Read", "Glob", "Grep"]);

/**
 * A shell command split into the commands of its chain (`&&`, `||`, `;`, `|`, `&`, a newline),
 * leaving any of those inside quotes alone, so `grep "a|b" tasks/open/x.md` stays one command.
 * A heredoc's body (`<<'EOF'` … `EOF`) and a PowerShell here-string (`@'` … `'@`) are text, not
 * commands, and are dropped. Each shell's own escape character applies (Bash's backslash,
 * PowerShell's backtick, so `"D:\x\"` is a path there), and in both a `#` that starts a word
 * comments out the rest of its line.
 *
 * ceiling: this is a tokenizer for classifying commands into families, not a shell parser. It
 * handles the shapes above and nothing more: not `$( … )` nesting (a `|` inside an unquoted
 * substitution splits there), not every quoting form. Accuracy is measured, not argued: a miss
 * leaves a call out of its family, and `usage --json` shows each family's share, so a miss is
 * worth fixing only when it moves a share the baseline records. Known misses are listed in
 * `tasks/open/usage-classifier-known-misses.md`; new shapes go there, not into this function.
 */
export function splitChain(cmd, tool = "Bash") {
  const escape = tool === "PowerShell" ? "`" : "\\";
  const parts = [];
  let current = "";
  let quote = null;
  let heredoc = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (ch === "\n" && heredoc) {
      // The heredoc's line ends here, and its body runs to the line that is only the delimiter
      // (after leading tabs, for `<<-`). That holds inside `"$(cat <<'EOF' … )"`, the usual shape
      // of a commit message, too, so the quote stays open across the body.
      if (!quote) {
        parts.push(current);
        current = "";
      }
      const lines = cmd.slice(i + 1).split("\n");
      const end = lines.findIndex((line) => (heredoc.tabs ? line.replace(/^\t+/, "") : line).replace(/\r$/, "") === heredoc.word);
      i += end === -1 ? cmd.length : lines.slice(0, end + 1).join("\n").length;
      heredoc = null;
      continue;
    }
    // A PowerShell here-string opens with `@'` or `@"` at the end of a line, nowhere else.
    if (tool === "PowerShell" && !quote && ch === "@" && (cmd[i + 1] === "'" || cmd[i + 1] === '"') && /^\r?\n/.test(cmd.slice(i + 2, i + 4))) {
      const close = cmd.indexOf(`\n${cmd[i + 1]}@`, i + 2);
      i = close === -1 ? cmd.length : close + 2;
      current += "@string";
      continue;
    }
    // A PowerShell block comment, `<# … #>`.
    if (!quote && tool === "PowerShell" && ch === "<" && cmd[i + 1] === "#") {
      const close = cmd.indexOf("#>", i + 2);
      i = close === -1 ? cmd.length : close + 1;
      continue;
    }
    // `<<EOF`, `<< 'EOF'`, `<<"EOF"`, `<<\EOF`, and `<<-EOF`, whose closing line may be tabbed;
    // not a shift inside `$(( ))`, `(( ))`, `let` or `[[ ]]`.
    // Inside double quotes only a command substitution (`"$(cat <<'EOF'`) can hold one, and `<<<`
    // is a here-string, at either of its first two `<`.
    // The cheap character tests come first: the context tests scan all of `current`.
    if (
      ch === "<" &&
      cmd[i + 1] === "<" &&
      cmd[i + 2] !== "<" &&
      cmd[i - 1] !== "<" &&
      (!quote || (quote === '"' && /\$\([^)]*$/.test(current))) &&
      !/\(\([^)]*$|\[\[[^\]]*$|(^|\s)let\s[^;]*$/.test(current)
    ) {
      const m = /^<<(-?)\s*\\?(['"]?)([A-Za-z_][\w-]*)\2/.exec(cmd.slice(i));
      if (m) {
        heredoc = { word: m[3], tabs: m[1] === "-" };
        current += m[0];
        i += m[0].length - 1;
        continue;
      }
    }
    if (quote === "'") {
      // Neither shell escapes inside single quotes.
      if (ch === "'") quote = null;
      current += ch;
    } else if (quote === "$'") {
      // Bash's ANSI-C quoting, `$'it\'s'`, where a backslash does escape.
      if (ch === "\\" && i + 1 < cmd.length) current += ch + cmd[++i];
      else {
        if (ch === "'") quote = null;
        current += ch;
      }
    } else if (!quote && tool === "Bash" && ch === "$" && cmd[i + 1] === "'") {
      quote = "$'";
      current += "$'";
      i++;
    } else if (ch === escape && i + 1 < cmd.length) {
      // An escaped line end continues the command on the next line, as one line.
      const continued = /^\r?\n/.exec(cmd.slice(i + 1));
      if (continued) {
        current += " ";
        i += continued[0].length;
      } else current += ch + cmd[++i];
    } else if (quote === '"') {
      if (ch === '"') quote = null;
      current += ch;
    } else if (ch === "#" && /(^|\s)$/.test(current)) {
      // A comment runs to the end of the line; an apostrophe in it opens no quote.
      const eol = cmd.indexOf("\n", i);
      i = (eol === -1 ? cmd.length : eol) - 1;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ";" || ch === "|" || ch === "\n" || (ch === "&" && cmd[i - 1] !== ">" && cmd[i + 1] !== ">")) {
      // A lone `&` (a background job, PowerShell's call operator) ends a command too, but not the
      // `&` of a redirection such as `2>&1` or `&>`.
      parts.push(current);
      current = "";
      if ((ch === "|" || ch === "&") && cmd[i + 1] === ch) i++;
    } else current += ch;
  }
  parts.push(current);
  return parts;
}

/**
 * The workflow families: the runs of calls each proposed agent command would replace (gates,
 * orient, ledger, merge, drift, pr; plus targeted test runs and port checks, which stay manual).
 * Matched against the command string at extraction time; only the family name is kept. Paths
 * match with either separator and listing or reading verbs in either shell, because PowerShell
 * is this machine's primary shell.
 *
 * ceiling: these patterns cover the spellings found in this repo's transcripts, not every way to
 * write each command; a spelling they miss leaves its call out of the family. The families are a
 * measure of where a command would save, so a miss worth fixing is one that moves a family's
 * share, which `usage --json` shows per family.
 */
export const FAMILIES = {
  gates: (tool, cmd, vitest) =>
    SHELLS.has(tool) &&
    !isTargetedRun(cmd, vitest) &&
    (RUNS.gates.test(cmd) ||
      VITEST_RUN.test(cmd) ||
      GATE_SCRIPTS.has(npmScript(cmd)) ||
      vitest.has(npmScript(cmd))),
  "targeted tests": (tool, cmd, vitest) => SHELLS.has(tool) && isTargetedRun(cmd, vitest),
  // Listing and reading verbs lead the command (familiesOf hands over one command of a chain at a
  // time), so `mkdir tasks/lessons` is not a listing; and a redirect into a ledger path is a write.
  orient: (tool, cmd) => SHELLS.has(tool) && RUNS.orient.test(cmd),
  ledger: (tool, cmd) =>
    // Only what comes before a redirect is read: `cat > tasks/open/x.md` writes, while
    // `cat tasks/open/x.md > copy.md` reads, as `Get-Content … | Out-File` does.
    (SHELLS.has(tool) && RUNS.ledger.test(cmd.split(/\s\d?>/)[0])) ||
    (FILE_TOOLS.has(tool) && /tasks[\\/](todo\.md|(open|lessons|decisions)\b)/.test(cmd)),
  merge: (tool, cmd) => SHELLS.has(tool) && RUNS.merge.test(cmd),
  // Reading the drift log is the workflow, whatever command reads it.
  drift: (tool, cmd) => SHELLS.has(tool) && /agent-drift\.log/.test(cmd),
  pr: (tool, cmd) => SHELLS.has(tool) && RUNS.pr.test(cmd),
  // Port checks and process kills, not every command that carries a `:5432` database URL. A
  // socket probe sits inside `node -e` (`net.connect(`, `require('net').connect(`), so it is
  // matched where it appears.
  ports: (tool, cmd) => SHELLS.has(tool) && (RUNS.ports.test(cmd) || /\bnet\b['")\]]*\.connect\(/.test(cmd)),
};

/** Vitest options that take a value as the next word, which is therefore not a file filter. */
const VITEST_VALUE_FLAGS = new Set([
  "--project", "--reporter", "--config", "-c", "--pool", "--root", "-r", "--dir", "--environment",
  "--maxWorkers", "--minWorkers", "--shard", "--outputFile", "--bail", "--retry", "--testTimeout",
  "--hookTimeout", "--teardownTimeout", "--exclude", "--mode", "--maxConcurrency",
]);
/** Filters that name a whole test tier, which is the gate, not a targeted run. */
const WHOLE_SUITE = new Set(["tests", "tests/unit", "tests/components", "tests/integration", "tests/integration/db"]);

/**
 * The start of one command, past `VAR=value` assignments and `cross-env`, so a program name is
 * matched where it runs and not where it is merely mentioned (`grep vitest notes.md`).
 */
const ASSIGNMENT = String.raw`[A-Za-z_]\w*=(?:"[^"$]*"|'[^']*'|[^\s$]*)\s+`;
const COMMAND_START = String.raw`^\s*(?:${ASSIGNMENT})*(?:(?:cross-env|time)\s+(?:${ASSIGNMENT})*|timeout\s+(?:-\S+\s+)*\S+\s+)*`;
/** `npx` with any of its own flags (`npx -y`, `npx --yes`). */
const NPX = String.raw`npx\s+(?:-\S+\s+)*`;

/**
 * The family commands, each matched only where a command starts. The `git log …
 * HEAD..origin/master` check belongs to merge only; the orient listing of master's new commits
 * is `git log --oneline master..origin/master`.
 */
const RUNS = Object.fromEntries(
  Object.entries({
    gates: String.raw`(?:(?:${NPX})?tsc\b.*--noEmit|(?:${NPX})?next\s+build\b)`,
    orient: String.raw`(?:git\s+(?:worktree list|branch -a|branch --list|rev-parse --show-toplevel|log --oneline master\.\.origin\/master|fetch)|gh\s+pr\s+list|ls\s+-la\s+\.git\/\S*lock|(?:ls|dir|Get-ChildItem)\s+(?:-\S+\s+)*tasks[\\/](?:open|lessons|decisions))`,
    ledger: String.raw`(?:ls|dir|Get-ChildItem|cat|head|tail|sed -n|awk|grep|Get-Content|Select-String)\s.*tasks[\\/](?:todo\.md|open|lessons|decisions)`,
    merge: String.raw`git\s+(?:merge-tree|merge-base\s+HEAD\s+origin\/master|log\b.*HEAD\.\.origin\/master)`,
    pr: String.raw`gh\s+(?:pr\s+(?:checks|view)|run\s+(?:view|watch|list)|api\s+\S*(?:commits\/\S+\/status|deployments))`,
    ports: String.raw`(?:Get-NetTCPConnection|Test-NetConnection|netstat|lsof\s+-i|Stop-Process|taskkill|Get-CimInstance\s+Win32_Process)`,
  }).map(([name, pattern]) => [name, new RegExp(COMMAND_START + pattern)]),
);
const NPM_CALL = new RegExp(String.raw`${COMMAND_START}npm\s+(.*)$`);

/** Gate scripts that are not test runs. */
const GATE_SCRIPTS = new Set(["typecheck", "lint", "docs:check", "build", "check"]);

/**
 * The npm script a command runs and the words after it, if any: `npm test`, `npm run -s lint`,
 * `npm -s run test:components -- x`.
 */
function npmCall(cmd) {
  const m = NPM_CALL.exec(cmd);
  if (!m) return undefined;
  const words = m[1].trim().split(/\s+/);
  let i = 0;
  const skipFlags = () => {
    while (words[i]?.startsWith("-")) {
      // `--prefix <dir>` and `-w <name>` take the next word with them.
      if (NPM_VALUE_FLAGS.has(words[i])) i++;
      i++;
    }
  };
  skipFlags();
  const viaRun = words[i] === "run" || words[i] === "run-script";
  if (viaRun) {
    i++;
    skipFlags();
  }
  return words[i] ? { script: words[i], args: words.slice(i + 1).join(" "), viaRun } : undefined;
}
const npmScript = (cmd) => npmCall(cmd)?.script;
/** npm options that take a value as the next word. */
const NPM_VALUE_FLAGS = new Set(["--prefix", "-w", "--workspace", "--userconfig", "--cache", "--loglevel"]);

/**
 * `vitest run …`, `npx vitest --run …`, or bare `vitest …`, which runs once in a shell with no
 * terminal, as an agent's is: the words after it. `vitest.config.ts` is not `vitest`.
 */
const VITEST_RUN = new RegExp(
  // Bare `vitest` too, but not its subcommands or options that run no tests or never finish
  // (`list`, `bench`, `init`, `watch`, `dev`, `--version`, `--help`). `vitest related <files>`
  // reads as a filtered, so targeted, run.
  `${COMMAND_START}(?:${NPX})?vitest(?:\\s+(?:run|--run)\\b|(?=\\s|$)(?!\\s+(?:list|bench|init|watch|dev|--version|-v|--help|-h)(?=\\s|$)))(.*)$`,
);

/**
 * The test filters in the words after `vitest run`: each positional word, normalised, and "-t"
 * for a name filter (`-t x`, `--testNamePattern x`, `--testNamePattern=x`).
 *
 * ceiling: a vitest option missing from VITEST_VALUE_FLAGS makes its value read as a filter. The
 * exact parse would use vitest's own CLI definition, which is not available without the package.
 */
function filtersIn(args) {
  const words = String(args)
    .trim()
    .split(/\s+/)
    .filter((w) => w && w !== "--")
    .map((w) => w.replace(/^(["'])(.*)\1$/, "$2"));
  const filters = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // A name filter, or `--changed` (only the tests uncommitted changes touch), narrows any run.
    // A name filter's pattern, read on as a path filter too, changes nothing.
    if (word.startsWith("--testNamePattern") || word === "-t" || word.startsWith("-t=") || word.startsWith("--changed")) {
      filters.push("-t");
      continue;
    }
    // A redirection (`2>&1`, `> out.txt`, PowerShell's `*>&1`) is the shell's, not a filter; a
    // bare operator takes the next word as its target.
    if (/^[\d*&]?(>>?|<)/.test(word)) {
      if (/^[\d*&]?(>>?|<)$/.test(word)) i++;
      continue;
    }
    if (word.startsWith("-")) {
      if (VITEST_VALUE_FLAGS.has(word)) i++;
      continue;
    }
    filters.push(word.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, ""));
  }
  return filters;
}

/**
 * The repo's npm scripts that run vitest once, from package.json, and whether each already passes
 * a test path. Vitest ORs its path filters, so a file added to `npm test` (which passes
 * `tests/unit`) still runs the whole unit suite.
 */
export function vitestScripts(scripts = {}) {
  const out = new Map();
  for (const [name, body] of Object.entries(scripts)) {
    // Only the command that runs vitest; anything chained after it is not its arguments.
    for (const part of splitChain(String(body))) {
      const run = VITEST_RUN.exec(part);
      if (run) out.set(name, { filtered: filtersIn(run[1]).some((f) => f !== "-t") });
    }
  }
  return out;
}

/**
 * Whether a set of filters narrows a run. A name filter always does (vitest ANDs it with the
 * paths). Paths narrow only when none of them is a whole tier, since vitest ORs paths: a file
 * beside `tests/unit` still runs the whole unit suite.
 */
const narrows = (filters) => {
  if (filters.includes("-t")) return true;
  const paths = filters.filter((f) => f !== "-t");
  // A tier given as an absolute path (`D:/…/tests/unit`) is the tier too.
  const wholeTier = (f) => [...WHOLE_SUITE].some((tier) => f === tier || f.endsWith(`/${tier}`));
  return paths.length > 0 && !paths.some(wholeTier);
};

/**
 * A vitest run narrowed to some tests, given after `vitest run` or after an npm script that runs
 * vitest. A script that passes a path of its own is narrowed only by a name filter.
 */
export function isTargetedRun(cmd, vitest = new Map()) {
  const text = String(cmd).trim();
  const direct = VITEST_RUN.exec(text);
  if (direct) return narrows(filtersIn(direct[1]));
  const npm = npmCall(text);
  const script = npm && vitest.get(npm.script);
  if (!script) return false;
  const filters = filtersIn(npm.args);
  return script.filtered ? filters.includes("-t") : narrows(filters);
}

/**
 * One spelling per command: `npm.cmd run lint` is `npm run lint` (PowerShell often names the
 * Windows shim), and `git -C <dir> fetch` is `git fetch` (subagents with a reset cwd use `-C`).
 */
const withoutExeSuffix = (cmd) =>
  cmd
    .replace(/\b(npm|npx|node|git|gh)\.(cmd|exe)\b/gi, "$1")
    // git's global options before the subcommand: `-C <dir>`, `-c k=v`, `--no-pager`, `-P`,
    // `--git-dir=…`, `--work-tree=…`.
    .replace(/\bgit\s+(?:(?:-[Cc]\s+("[^"]*"|'[^']*'|\S+)|--no-pager|-P|--(?:git-dir|work-tree)=\S+)\s+)+/g, "git ");

/** Families a call belongs to. A call can count toward more than one. */
export function familiesOf(tool, cmd, vitest = new Map()) {
  // Each command of a chain is classed on its own, so `vitest run <file> && npm run lint` is both
  // a targeted run and a gate.
  const parts = SHELLS.has(tool) ? splitChain(withoutExeSuffix(String(cmd)), tool) : [cmd];
  return Object.keys(FAMILIES).filter((name) => parts.some((part) => FAMILIES[name](tool, part, vitest)));
}

/**
 * A command word: letters with `_`, `.` or `-`; no digit, path separator, flag, quote or
 * substitution. Digits are out because a key or token pasted where a command goes has them, and
 * command names rarely do.
 */
const VERB = /^[A-Za-z][A-Za-z_.-]{0,29}$/;
/** An npm script name may also carry colons (`test:components`). */
const SCRIPT = /^[A-Za-z][A-Za-z0-9_.:-]{0,39}$/;
const SUBCOMMAND = new Set(["git", "gh", "npx"]);

/**
 * A coarse, content-free label for what a tool call was: the tool name, or for a shell the leading
 * verb (`git diff`, `npm run test`, `cat`). Leading `cd ... &&` and `VAR=x` are skipped. A word
 * that could be argument text (a path, a flag, a quoted or substituted value) turns the whole label
 * into `<tool> other`, so no argument text reaches the report.
 */
export function commandClass(tool, cmd) {
  if (tool.startsWith("mcp__")) return tool.split("__").slice(0, 2).join("__");
  if (!SHELLS.has(tool)) return tool;
  let rest = withoutExeSuffix(String(cmd).trim());
  for (;;) {
    const cd = /^(cd|Set-Location|pushd)\s+("[^"]*"|'[^']*'|\S+)\s*(&&|;)\s*/.exec(rest);
    // A value with a `$(` in it is a command, not a value: stop there rather than read its
    // arguments as the label.
    const env = /^[A-Za-z_][A-Za-z0-9_]*=("[^"$]*"|'[^']*'|[^\s"';&|$]*)\s+/.exec(rest);
    const psEnv = /^\$env:[A-Za-z_][A-Za-z0-9_]*\s*=\s*("[^"]*"|'[^']*'|[^\s;]*)\s*;\s*/.exec(rest);
    const match = cd || env || psEnv;
    if (!match) break;
    rest = rest.slice(match[0].length);
  }
  // Only the first command of a chain, past PowerShell's call operator (`& npm …`); an npm call
  // is read by the same parser the families use, and npx's own flags are skipped.
  const first = splitChain(rest.replace(/^&\s+/, ""), tool)[0];
  const npm = npmCall(first);
  const words = first.split(/\s+/).filter(Boolean);
  if (words[0] === "npx") while (/^-/.test(words[1] ?? "")) words.splice(1, 1);
  const take = SUBCOMMAND.has(words[0]) ? 2 : 1;
  const label = npm ? (npm.viaRun ? ["npm", "run", npm.script] : ["npm", npm.script]) : words.slice(0, take);
  const plain = label.length > 0 && label.every((w, i) => (i === 2 ? SCRIPT : VERB).test(w));
  if (!plain) return `${tool} other`;
  return label.join(" ");
}

// ================================ extraction ================================

/**
 * The text a tool result put into context.
 * ceiling: image blocks count as nothing. Their token cost depends on pixel size, which the
 * transcript does not record; 3 tool results here carried one (2026-10-20).
 */
const textLength = (content) =>
  typeof content === "string"
    ? content.length
    : Array.isArray(content)
      ? content.reduce((n, block) => n + (block && block.type === "text" ? String(block.text).length : 0), 0)
      : 0;

/**
 * What woke the session, for a user record that carries no tool result: "person" for a message
 * someone sent, "event" for a background task's notice or another session's message, and nothing
 * for a meta record, which rides along with something else.
 *
 * ceiling: transcripts written before Claude Code recorded `origin` carry neither field, and their
 * non-meta records are taken as a person's message.
 */
export function triggerOf(record) {
  // The origin decides first: another session's message is written with `isMeta` set too, and it
  // still woke the session.
  if (record.type === "attachment") {
    // Anything that arrives while a turn runs (a person's message, a background notice, another
    // session's message) is queued and written as a `queued_command` attachment. Older ones carry
    // no origin, and then `commandMode` "prompt" is someone typing; anything else is a notice.
    const queued = record.attachment;
    if (queued?.type !== "queued_command") return undefined;
    const kind = queued.origin?.kind;
    if (kind) return kind === "human" ? "person" : "event";
    if (queued.isMeta) return undefined;
    return queued.commandMode === "prompt" ? "person" : "event";
  }
  const kind = record.origin?.kind;
  if (kind) return kind === "human" ? "person" : "event";
  // A compaction's summary is written as a user record too; no one sent it.
  if (record.isMeta || record.isCompactSummary) return undefined;
  // In a subagent's transcript, a message with no origin is its parent agent's prompt.
  if (record.isSidechain) return "event";
  return "person";
}

/** Token fields a request's lines are merged on. Streamed lines repeat them; output grows. */
const USAGE_FIELDS = ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens"];

/**
 * One transcript file, fed record by record. Keeps numbers and labels only.
 *
 * Lines of one request share a `requestId` and need not be adjacent; their usage is merged by
 * taking the maximum of each field, because streamed lines carry a growing `output_tokens`.
 * `seen` is shared across files: a request copied into a second file (a fork, a relocated
 * subagent) is counted once, in the first file read. `vitest` is `vitestScripts(package.json)`,
 * which tells a targeted test run from a gate.
 */
export function createExtractor({ session, sub }, seen = new Set(), vitest = new Map()) {
  const requests = [];
  const byKey = new Map();
  const calls = new Map();
  const results = [];
  const compactions = [];
  let synthetic = 0;
  let duplicates = 0;
  const dupKeys = new Set();
  let lastStart;
  let prevStart;
  // What woke the session since the last request. A person outranks an event, which outranks a
  // tool result, whatever order their records were written in.
  let pendingTrigger;
  const RANK = { tool: 1, event: 2, person: 3 };
  const noteTrigger = (trigger) => {
    if (trigger && (RANK[trigger] ?? 0) > (RANK[pendingTrigger] ?? 0)) pendingTrigger = trigger;
  };
  // Whether a tool (not one that waits on a person) returned since the last request: the session
  // was then waiting on that tool, whatever else was queued meanwhile.
  let pendingAfterTool = false;

  return {
    add(record) {
      if (!record || typeof record !== "object") return;
      if (record.type === "system" && record.subtype === "compact_boundary") {
        // A fork copies its parent's boundaries along with its history; only the first file to
        // carry one owns it, as with requests.
        const key = `compact:${record.uuid}`;
        if (record.uuid && seen.has(key)) return;
        if (record.uuid) seen.add(key);
        compactions.push(requests.length);
        return;
      }
      if (record.type === "attachment") {
        noteTrigger(triggerOf(record));
        return;
      }
      const message = record.message;
      if (!message || typeof message !== "object") return;

      if (record.type === "assistant") {
        if (message.model === "<synthetic>") {
          synthetic++;
          return;
        }
        const key = record.requestId || message.id || record.uuid;
        // When the previous request started, copied history included, so the first new request of
        // a forked or relocated transcript still knows how long the session sat idle. The start,
        // not the last streamed line: the cache's clock restarts when a request reads it.
        // ceiling: "start" is the request's first written line, which lands after its first block
        // has streamed; transcripts do not record when a request was sent, so near a lifetime's
        // edge a long first block can move a resume across it.
        let trigger;
        let afterTool = false;
        // A key in neither map is a request this file has not seen before.
        if (!byKey.has(key) && !dupKeys.has(key)) {
          prevStart = lastStart;
          lastStart = record.timestamp;
          trigger = pendingTrigger;
          afterTool = pendingAfterTool;
          pendingTrigger = undefined;
          pendingAfterTool = false;
        }
        const prevTs = prevStart;
        if (dupKeys.has(key)) return;
        let request = byKey.get(key);
        if (!request) {
          if (seen.has(key)) {
            dupKeys.add(key);
            duplicates++;
            return;
          }
          seen.add(key);
          request = {
            index: requests.length,
            ts: record.timestamp,
            prevTs,
            // What the request answered: a person, a background event, or a tool's result; and
            // whether a tool returned in the gap, whatever else came with it.
            trigger,
            afterTool,
            model: message.model,
            speed: undefined,
            geo: undefined,
            tier: undefined,
            webSearch: 0,
            w5: 0,
            w1h: 0,
            tools: 0,
          };
          for (const field of USAGE_FIELDS) request[field] = 0;
          byKey.set(key, request);
          requests.push(request);
        }
        // ceiling: a line with no usage adds 0 tokens to its request, so a request with no other
        // line is one of 0 tokens, which segmentBreaks takes for a compaction and the meter for an
        // empty context. None of the 25,798 assistant lines on the owner's machine lacked usage
        // (2026-10-21).
        const usage = message.usage || {};
        for (const field of USAGE_FIELDS) request[field] = Math.max(request[field], Number(usage[field]) || 0);
        const creation = usage.cache_creation || {};
        request.w5 = Math.max(request.w5, Number(creation.ephemeral_5m_input_tokens) || 0);
        request.w1h = Math.max(request.w1h, Number(creation.ephemeral_1h_input_tokens) || 0);
        if (usage.speed != null) request.speed = usage.speed;
        if (usage.inference_geo != null) request.geo = usage.inference_geo;
        if (usage.service_tier != null) request.tier = usage.service_tier;
        request.webSearch = Math.max(request.webSearch, Number(usage.server_tool_use?.web_search_requests) || 0);
        for (const block of Array.isArray(message.content) ? message.content : []) {
          if (block?.type !== "tool_use" || calls.has(block.id)) continue;
          request.tools++;
          const input = block.input || {};
          // For the file tools, the paths they were given: Grep's pattern is what it searches for,
          // not where, so it is left out; Glob's pattern is itself a path.
          const where = String(block.name) === "Grep" ? [input.path] : [input.file_path, input.path, input.pattern];
          const cmd = String(input.command ?? where.filter(Boolean).join(" "));
          calls.set(block.id, {
            request: request.index,
            tool: String(block.name),
            class: commandClass(String(block.name), cmd),
            families: familiesOf(String(block.name), cmd, vitest),
          });
        }
      } else if (record.type === "user") {
        const blocks = Array.isArray(message.content) ? message.content : [];
        let toolResult = false;
        for (const block of blocks) {
          if (block?.type !== "tool_result") continue;
          toolResult = true;
          results.push({ id: block.tool_use_id, chars: textLength(block.content) });
          // A tool that waits for an answer returns when the person gives it.
          // ceiling: a permission prompt also waits on a person, but leaves no mark in the record.
          if (PERSON_TOOLS.has(calls.get(block.tool_use_id)?.tool)) noteTrigger("person");
          else pendingAfterTool = true;
        }
        // A text block beside a tool result is not a person: in this repo's transcripts the only
        // ones (4 of 19,315 results, 2026-10-20) are a fork's injected boilerplate. A message
        // typed mid-turn arrives as a queued_command attachment, which `triggerOf` reads.
        noteTrigger(toolResult ? "tool" : triggerOf(record));
      }
    },
    finish() {
      // A call's order is the order its tool_use appeared, which is the order of `calls`.
      const callList = [...calls.entries()].map(([id, call]) => ({ id, ...call }));
      const chars = new Map(results.map((r) => [r.id, r.chars]));
      for (const call of callList) call.resultChars = chars.get(call.id) ?? 0;
      return { session, sub, requests, calls: callList, compactions, synthetic, duplicates };
    },
  };
}

// ================================ pricing a file ================================

/** What a request sent: fresh input, cache reads and cache writes. */
export const promptOf = (r) => r.input_tokens + r.cache_read_input_tokens + r.cache_creation_input_tokens;

/**
 * Prices, in place, every request of the extracted files that falls in the window. Throws one
 * UnpriceableError naming every unpriceable kind of request, so no run reports a partial total.
 * Requests outside the window stay unpriced, so one before `since` cannot stop a measurement of
 * the window, and every analysis skips unpriced requests.
 */
export function priceFiles(files, { priceAs, inWindow = () => true } = {}) {
  const unpriceable = {};
  for (const f of files) {
    for (const r of f.requests) {
      // A price is how every analysis knows a request is in the window, so a previous call's
      // prices must not survive into this one.
      delete r.rates;
      delete r.usd;
      delete r.cost;
      if (!inWindow(r.ts)) continue;
      try {
        priceRequest(r, priceAs);
      } catch (error) {
        if (!(error instanceof UnpriceableError)) throw error;
        unpriceable[error.message] = (unpriceable[error.message] || 0) + 1;
      }
    }
  }
  if (Object.keys(unpriceable).length) {
    throw new UnpriceableError(Object.entries(unpriceable).map(([m, n]) => `${m} (${n} requests)`).join("; "));
  }
  return files;
}

/**
 * Prices one request in place. `priceAs` prices it at another model's rates (speed and region
 * still apply), which is how a before/after comparison removes a change of model from the result.
 */
function priceRequest(r, priceAs) {
  r.ctx = promptOf(r);
  const p = ratesFor({ model: priceAs ?? r.model, served: r.model, prompt: r.ctx, speed: r.speed, geo: r.geo, tier: r.tier });
  // The two cache lifetimes are priced differently, so a write the split does not account for
  // has no known price. Every line in this repo's transcripts carries a split that sums to the
  // total (36,459 of 36,459 on 2026-10-20); one that does not is refused, never guessed.
  if (r.w5 + r.w1h !== r.cache_creation_input_tokens) {
    throw new UnpriceableError("cache write without a 5m/1h split that sums to its total");
  }
  r.rates = p;
  r.usd = {
    read: (r.cache_read_input_tokens * p.cacheRead) / 1e6,
    write: (r.w5 * p.write5m + r.w1h * p.write1h) / 1e6,
    output: (r.output_tokens * p.output) / 1e6,
    input: (r.input_tokens * p.input) / 1e6,
    search: r.webSearch * WEB_SEARCH_USD,
  };
  r.cost = r.usd.read + r.usd.write + r.usd.output + r.usd.input + r.usd.search;
}

// ================================ the analyses ================================

export const CONTEXT_BUCKETS = [
  { label: "under 200K", max: 200_000 },
  { label: "200K-400K", max: 400_000 },
  { label: "400K-600K", max: 600_000 },
  { label: "over 600K", max: Infinity },
];

/**
 * A context drop larger than this between consecutive requests is a compaction.
 * ceiling: a heuristic for compactions older transcripts did not mark; `compact_boundary` records
 * are used where present, and this can go once every transcript in range carries them.
 */
const COMPACTION_DROP = 0.6;

/** Indexes of the requests that start a new context, after a compaction. */
export function segmentBreaks(file) {
  const breaks = new Set(file.compactions);
  for (let i = 1; i < file.requests.length; i++) {
    if (promptOf(file.requests[i]) < COMPACTION_DROP * promptOf(file.requests[i - 1])) breaks.add(i);
  }
  return breaks;
}

/** Index of the last request each request's context survives to. */
function segmentEnds(file, breaks) {
  const n = file.requests.length;
  const ends = new Array(n);
  let end = n - 1;
  for (let i = n - 1; i >= 0; i--) {
    ends[i] = end;
    if (breaks.has(i)) end = i - 1;
  }
  return ends;
}

/**
 * What carrying tool output cost. A result enters the context with the next request, which writes
 * it to the cache, and every later request in the same segment reads it again. Tokens are
 * estimated as characters / 4, which is why the report calls this an estimate.
 *
 * Only priced requests are charged, so under `--since` a result from before the window still
 * counts for the reads inside it, and its write counts only if that fell inside too.
 *
 * ceiling: chars/4 over-counts dense code and under-counts non-Latin text; the exact figure is
 * the cache-write delta of the next request, which mixes in everything else that turn added.
 */
export function carriedOutput(file, breaks = segmentBreaks(file)) {
  const reqs = file.requests;
  const ends = segmentEnds(file, breaks);
  const readPrefix = [0];
  for (const r of reqs) readPrefix.push(readPrefix[readPrefix.length - 1] + (r.rates?.cacheRead ?? 0));
  const byClass = {};
  let total = 0;
  for (const call of file.calls) {
    const writeAt = call.request + 1;
    if (!call.resultChars || writeAt >= reqs.length || writeAt > ends[call.request]) continue;
    const w = reqs[writeAt];
    // The rate the next request actually wrote at, blended across the two lifetimes; if it wrote
    // nothing to the cache, the result went in as fresh input at the input rate.
    const written = w.w5 + w.w1h;
    const writeRate = !w.rates ? 0 : written ? (w.w5 * w.rates.write5m + w.w1h * w.rates.write1h) / written : w.rates.input;
    const reads = readPrefix[ends[call.request] + 1] - readPrefix[writeAt + 1];
    if (!writeRate && !reads) continue;
    const usd = ((call.resultChars / 4) * (writeRate + reads)) / 1e6;
    total += usd;
    byClass[call.class] = (byClass[call.class] || 0) + usd;
  }
  return { total, byClass };
}

/** How long each cache lifetime keeps an entry, in minutes. */
export const CACHE_TTL_MINUTES = { "5m": 5, "1h": 60 };

/**
 * The lifetime, in minutes, that holds most of a context written as `w5` tokens with the 5-minute
 * lifetime and `w1h` with the hour's: its expiry is the one that forces the whole context to be
 * re-written, and a small write in the other lifetime does not change it. An hour when the two tie.
 */
export const lifetimeHolding = (w5, w1h) => CACHE_TTL_MINUTES[w5 > w1h ? "5m" : "1h"];

/**
 * Main-session requests that came after the cache expired and re-wrote the whole context: idle
 * longer than the lifetime the context was last written with (1 hour, or 5 minutes),
 * and not the first request after a compaction, which re-writes a new, smaller context anyway.
 * `trigger` says what the session waited on: "person" when the request answered someone's message
 * (they were away, which a hand-off could avoid), otherwise a long tool or a background notice
 * (which it could not). `cost` is what the expiry cost: the re-write of everything that was not
 * new since the previous request, less the cache read a warm request would have paid for it.
 *
 * ceiling: "whole" is a write of at least half the context and at least 50K tokens, a heuristic
 * for "the cache had expired"; the exact test needs the cache's own expiry, which transcripts
 * do not record.
 */
export function coldResumes(file, breaks = segmentBreaks(file)) {
  if (file.sub) return [];
  const out = [];
  // The context's lifetime is counted over what was written since the last compaction; before
  // anything is, the request's own writes decide it.
  let held = { "5m": 0, "1h": 0 };
  let previous;
  for (const r of file.requests) {
    if (breaks.has(r.index)) held = { "5m": 0, "1h": 0 };
    const ttl = held["5m"] + held["1h"] ? lifetimeHolding(held["5m"], held["1h"]) : lifetimeHolding(r.w5, r.w1h);
    held["5m"] += r.w5;
    held["1h"] += r.w1h;
    const before = previous;
    previous = r;
    if (!r.prevTs || !r.usd || breaks.has(r.index)) continue;
    const idle = (Date.parse(r.ts) - Date.parse(r.prevTs)) / 60_000;
    if (!(idle > ttl)) continue;
    const written = r.cache_creation_input_tokens;
    if (written < Math.max(50_000, 0.5 * r.ctx)) continue;
    // A warm request would still have written what is new since the previous one (the person's
    // message, a pasted block) and read the rest; only that rest is what the expiry cost.
    const fresh = before ? Math.max(0, r.ctx - promptOf(before) - before.output_tokens) : 0;
    const rewritten = Math.max(0, written - fresh);
    const cost = rewritten * (r.usd.write / written - r.rates.cacheRead / 1e6);
    // A session a tool kept busy was not waiting on its person, even if they also typed meanwhile.
    const trigger = r.afterTool && r.trigger === "person" ? "tool" : (r.trigger ?? "unknown");
    out.push({ session: file.session, ts: r.ts, idleMinutes: idle, ctx: r.ctx, cost, trigger });
  }
  return out;
}

/**
 * Per family: calls, bursts, and the cost a single command per burst would have saved. A burst is a
 * run of consecutive requests in one file, within one turn, that each make at least one call of
 * the family. A request whose calls are all something else ends it, and so does the end of a turn
 * (a request with no calls) or a request that answers a person or an event rather than a tool; a
 * parallel Read beside a family call does not. A call costs its request's cost split evenly across
 * the request's tool calls.
 * Only calls in a later request than the burst's first count as saved: calls issued in parallel
 * from one request share it, and folding them into one command removes no request.
 *
 * ceiling: an even split of a request's cost across its calls is a proxy; the true saving is the
 * re-read context of the requests a command removes, which needs a counterfactual replay.
 */
export function familyUsage(files) {
  const out = Object.fromEntries(Object.keys(FAMILIES).map((name) => [name, { calls: 0, bursts: 0, sessions: new Set(), cost: 0, saving: 0 }]));
  for (const file of files) {
    const byRequest = new Map();
    for (const call of file.calls) {
      if (!byRequest.has(call.request)) byRequest.set(call.request, []);
      byRequest.get(call.request).push(call);
    }
    for (const name of Object.keys(FAMILIES)) {
      const f = out[name];
      let inBurst = false;
      for (const r of file.requests) {
        // A person starts new work, and so does an event that woke the session on its own; a
        // notice that came in beside a tool's result, a compaction summary or a meta record do not.
        if (r.trigger === "person" || (r.trigger === "event" && !r.afterTool)) inBurst = false;
        const mine = (byRequest.get(r.index) ?? []).filter((c) => c.families.includes(name));
        if (!mine.length) {
          inBurst = false;
          continue;
        }
        const cost = (mine.length * r.cost) / Math.max(1, r.tools);
        f.calls += mine.length;
        f.cost += cost;
        f.sessions.add(file.session);
        if (inBurst) f.saving += cost;
        else f.bursts++;
        inBurst = true;
      }
    }
  }
  for (const f of Object.values(out)) f.sessions = f.sessions.size;
  return out;
}

export const RARE_CLASS = "seen in one session only";

/**
 * Command classes seen in at least two sessions, the rest pooled. A command word is a name, but a
 * secret pasted where a command goes would look like one; it would also appear in one session
 * only, so this keeps it out of the report without having to recognise it.
 *
 * ceiling: a letters-only token pasted as a command in two sessions would still be shown; the
 * upgrade is an allow-list of known command names, at the cost of pooling every new tool.
 */
export function commonClasses(byClass, classSessions) {
  const out = {};
  for (const [k, v] of Object.entries(byClass)) {
    const key = classSessions[k]?.size >= 2 ? k : RARE_CLASS;
    out[key] = (out[key] || 0) + v;
  }
  return out;
}

const coldSummary = (cold) => ({
  count: cold.length,
  cost: cold.reduce((a, x) => a + x.cost, 0),
  medianContext: median(cold.map((x) => x.ctx)),
  medianIdleHours: median(cold.map((x) => x.idleMinutes / 60)),
});

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The whole report, from extracted files. Prices the window first (see `priceFiles`), so a run
 * never reports a partial total. Segments and idle gaps are still measured against the requests
 * outside the window. The window is `since <= time < until`, either end open.
 */
export function summarize(files, { since, until, priceAs } = {}) {
  const sinceMs = since ? Date.parse(since) : -Infinity;
  const untilMs = until ? Date.parse(until) : Infinity;
  // Without a window everything is in; with one, a request with no readable time is out.
  const inWindow = (ts) => (!since && !until) || (Date.parse(ts) >= sinceMs && Date.parse(ts) < untilMs);
  priceFiles(files, { priceAs, inWindow });

  const totals = { cost: 0, read: 0, write: 0, output: 0, input: 0, search: 0, requests: 0 };
  const models = {};
  const who = { main: { cost: 0, requests: 0 }, subagents: { cost: 0, requests: 0 } };
  const buckets = CONTEXT_BUCKETS.map((b) => ({ label: b.label, requests: 0, cost: 0 }));
  const sessions = {};
  const carried = { cost: 0, byClass: {} };
  const classSessions = {};
  const cold = [];
  const windowed = [];
  let first = null;
  let last = null;

  for (const f of files) {
    for (const r of f.requests) {
      // A price is the one marker of "in the window", as in every analysis below.
      if (!r.usd) continue;
      totals.requests++;
      totals.cost += r.cost;
      for (const k of ["read", "write", "output", "input", "search"]) totals[k] += r.usd[k];
      const m = (models[r.model] ||= { cost: 0, requests: 0 });
      m.cost += r.cost;
      m.requests++;
      const w = f.sub ? who.subagents : who.main;
      w.cost += r.cost;
      w.requests++;
      const b = buckets[CONTEXT_BUCKETS.findIndex((x) => r.ctx < x.max)];
      b.requests++;
      b.cost += r.cost;
      const s = (sessions[f.session] ||= { cost: 0, requests: 0, subagentRequests: 0, peakContext: 0 });
      s.cost += r.cost;
      if (f.sub) s.subagentRequests++;
      else {
        s.requests++;
        s.peakContext = Math.max(s.peakContext, r.ctx);
      }
      if (!first || r.ts < first) first = r.ts;
      if (!last || r.ts > last) last = r.ts;
    }
    if (!f.requests.length) continue;
    const breaks = segmentBreaks(f);
    const c = carriedOutput(f, breaks);
    carried.cost += c.total;
    for (const [k, v] of Object.entries(c.byClass)) {
      carried.byClass[k] = (carried.byClass[k] || 0) + v;
      (classSessions[k] ||= new Set()).add(f.session);
    }
    cold.push(...coldResumes(f, breaks));
    windowed.push({ ...f, calls: f.calls.filter((call) => f.requests[call.request].usd) });
  }

  return {
    prices: { source: PRICE_SOURCE, checked: PRICES_CHECKED, priceAs: priceAs ?? null },
    window: { since: since ?? null, until: until ?? null, first, last },
    totals,
    models,
    who,
    contextBuckets: buckets,
    coldResumes: coldSummary(cold.filter((x) => x.trigger === "person")),
    coldOnAnythingElse: coldSummary(cold.filter((x) => x.trigger !== "person")),
    carried: { cost: carried.cost, byClass: commonClasses(carried.byClass, classSessions) },
    families: familyUsage(windowed),
    sessions,
    skipped: {
      synthetic: files.reduce((a, f) => a + f.synthetic, 0),
      duplicates: files.reduce((a, f) => a + f.duplicates, 0),
    },
  };
}

// ================================ output ================================

const usd = (x) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (x, of) => `${of ? ((100 * x) / of).toFixed(1) : "0.0"}%`;
const kTok = (x) => `${Math.round(x / 1000)}K`;
const top = (obj, n, key = (v) => v) =>
  Object.entries(obj)
    .sort((a, b) => key(b[1]) - key(a[1]))
    .slice(0, n);

/** The human report: line 1 is the verdict, at most 30 lines, aggregates only. */
export function formatReport(report, { logPath } = {}) {
  const t = report.totals;
  const day = (ts) => (ts ? ts.slice(0, 10) : "?");
  const sessionCount = Object.keys(report.sessions).length;
  const lines = [
    `usage: PASS ${usd(t.cost)} across ${sessionCount} sessions, ${t.requests.toLocaleString("en-US")} requests (${day(report.window.first)} to ${day(report.window.last)})`,
    `prices: per request at ${report.prices.priceAs ? `${report.prices.priceAs} rates for every model` : "the serving model's rates"}, ${report.prices.source} checked ${report.prices.checked}`,
    `split: cache reads ${pct(t.read, t.cost)} | cache writes ${pct(t.write, t.cost)} | output ${pct(t.output, t.cost)} | fresh input ${pct(t.input, t.cost)}` +
      (t.search ? ` | web search ${pct(t.search, t.cost)}` : ""),
    `models${report.prices.priceAs ? ` (all at ${report.prices.priceAs} rates)` : ""}: ${top(report.models, 6, (m) => m.cost)
      .map(([name, m]) => `${name} ${usd(m.cost)} (${m.requests})`)
      .join(" | ")}`,
    `who: main sessions ${usd(report.who.main.cost)} (${report.who.main.requests}) | subagents ${usd(report.who.subagents.cost)} (${report.who.subagents.requests})`,
    "context size when called: share of requests / share of cost",
    ...report.contextBuckets.map((b) => `  ${b.label.padEnd(11)} ${pct(b.requests, t.requests).padStart(6)} / ${pct(b.cost, t.cost).padStart(6)}`),
  ];
  const c = report.coldResumes;
  lines.push(
    `cold resumes: ${c.count} whole-context re-writes on a person's message after the cache expired, ${usd(c.cost)} = ${pct(c.cost, t.cost)}` +
      (c.count ? `; median context ${kTok(c.medianContext)}, median idle ${c.medianIdleHours.toFixed(1)}h` : "") +
      `; ${report.coldOnAnythingElse.count} more woken by anything else (a long tool, a notice), ${pct(report.coldOnAnythingElse.cost, t.cost)}`,
  );
  lines.push(
    `carried tool output (estimate, chars/4): ${usd(report.carried.cost)} = ${pct(report.carried.cost, t.cost)}; top: ` +
      top(report.carried.byClass, 5)
        .map(([k, v]) => `${k} ${pct(v, t.cost)}`)
        .join(", "),
  );
  lines.push("workflow families: calls, bursts, sessions, cost share, saving at one call per burst");
  for (const [name, f] of Object.entries(report.families)) {
    lines.push(
      `  ${name.padEnd(15)} ${String(f.calls).padStart(6)} ${String(f.bursts).padStart(6)} ${String(f.sessions).padStart(3)} ${pct(f.cost, t.cost).padStart(6)} ${pct(f.saving, t.cost).padStart(6)}`,
    );
  }
  lines.push(
    `top sessions: ${top(report.sessions, 4, (s) => s.cost)
      .map(([id, s]) => `${id.slice(0, 8)} ${usd(s.cost)} peak ${kTok(s.peakContext)}`)
      .join(" | ")}`,
  );
  // What was read but not counted, so a short total says why it is short.
  const skipped = report.skipped;
  const malformed = report.input?.malformedLines ?? 0;
  lines.push(`not counted, across all transcripts read: ${malformed} unreadable lines, ${skipped.duplicates} copied requests, ${skipped.synthetic} synthetic messages`);
  if (logPath) lines.push(`log: ${logPath}`);
  return lines.join("\n");
}

// ================================ shell ================================

const HELP = `usage: node scripts/agent.mjs usage [--since <date>] [--until <date>] [--price-as <model>] [--dir <path>]... [--json]

What agent sessions in this repo cost, at official per-model API rates. Read-only.

  --since <date>  only requests at or after YYYY-MM-DD (UTC midnight) or an ISO time with a zone
  --until <date>  only requests before that date or time, in the same forms
  --price-as <model>  price every request at this model's rates, so a before/after comparison
                  is not moved by a change of model (e.g. claude-opus-5-5)
  --dir <path>    a transcript directory to read instead of the default (repeatable);
                  default: every ~/.claude/projects folder for this repo and its worktrees
  --json          print the full report as JSON instead of the summary

Exit codes: 0 report produced, 2 could not run (no transcripts, a model with no price, bad args).`;

/** The ~/.claude/projects folder name Claude Code uses for a working directory. */
export const projectFolderName = (dir) => resolve(dir).replace(/[^A-Za-z0-9]/g, "-");

/** The main checkout, which worktree folders are named after; null when git cannot say. */
function mainCheckoutRoot(cwd) {
  const common = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return common ? dirname(common) : null;
}

/**
 * git's answer, trimmed, or null when git cannot give one. Optional locks are off, as in
 * `agent-guard.mjs`: a `git status` here would otherwise take `index.lock` in a checkout other
 * sessions are committing in.
 */
export function git(cwd, args) {
  try {
    const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
    return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/**
 * This repo's transcript folders: the main checkout's and every `.claude/worktrees/*` one.
 *
 * ceiling: a session started in a subdirectory, or in a worktree elsewhere, has its own folder,
 * and the folder name cannot tell `pet-shelter-src` (a subdirectory) from `pet-shelter-src` (a
 * sibling repo), so those are left out; `--dir` adds them by hand.
 */
export function defaultDirs(projectsDir, root, platform = process.platform) {
  if (!existsSync(projectsDir)) return [];
  // Claude Code keeps the case of the path as typed (`d:` gives `d--`), so where the file system
  // ignores case, so does this; on Linux `Repo` and `repo` are two checkouts.
  const fold = caseFolder(platform);
  const name = fold(projectFolderName(root));
  return readdirSync(projectsDir)
    .filter((d) => fold(d) === name || fold(d).startsWith(`${name}--claude-worktrees-`))
    .map((d) => join(projectsDir, d));
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.name.endsWith(".jsonl")) acc.push(p);
  }
  return acc;
}

/** Session id and subagent flag from a transcript path: `<session>.jsonl` or `<session>/subagents/*.jsonl`. */
export function fileMeta(file) {
  const sub = file.includes(`${sep}subagents${sep}`);
  return { sub, session: sub ? basename(dirname(dirname(file))) : basename(file, ".jsonl") };
}

/**
 * A date alone parses as UTC midnight, but a date-time with no zone parses as local time, so the
 * window would start somewhere else on every machine. Only the two unambiguous forms are taken.
 */
const SINCE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

/** Date.parse rolls 2026-02-30 over to March 2 instead of refusing it. */
const realDate = (v) => {
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

export function parseArgs(argv) {
  const opts = { dirs: [], json: false, since: undefined, until: undefined, priceAs: undefined, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--since" || a === "--until" || a === "--dir" || a === "--price-as") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      if (a === "--dir") opts.dirs.push(v);
      else if (a === "--price-as") {
        if (!Object.hasOwn(PRICES, priceKey(v))) throw new Error(`--price-as has no price for ${v}`);
        opts.priceAs = v;
      }
      else if (!SINCE.test(v) || !realDate(v) || Number.isNaN(Date.parse(v))) {
        throw new Error(`${a} takes YYYY-MM-DD (UTC midnight) or an ISO time with a zone, not ${v}`);
      } else opts[a.slice(2)] = v;
    } else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

/**
 * Lines split on "\n" only. `node:readline` also ends a line at U+2028 and U+2029, which JSON
 * allows raw inside a string, so it cut 78 real transcript records in half here.
 */
export async function* jsonlLines(chunks) {
  let pending = [];
  for await (const chunk of chunks) {
    let start = 0;
    let end;
    while ((end = chunk.indexOf("\n", start)) !== -1) {
      pending.push(chunk.slice(start, end));
      yield pending.join("");
      pending = [];
      start = end + 1;
    }
    pending.push(chunk.slice(start));
  }
  if (pending.join("")) yield pending.join("");
}

async function readFile(file, seen, vitest) {
  const extractor = createExtractor(fileMeta(file), seen, vitest);
  let malformed = 0;
  for await (const line of jsonlLines(createReadStream(file, { encoding: "utf8" }))) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      malformed++; // a line still being written when the file was read
      continue;
    }
    extractor.add(record);
  }
  return { ...extractor.finish(), malformed };
}

/**
 * Transcripts in the order a request was first written: a forked or relocated transcript copies
 * its parent's history, and the first file read owns each shared request.
 * ceiling: creation time stands in for "written first"; a copied file whose creation time was
 * preserved would sort wrongly, and so would a main-session fork on a filesystem with no creation
 * times, since its parent goes on being written after it. The exact order needs each request's
 * first appearance across all files, which means reading every file twice.
 */
function byCreation(files) {
  // Every file is read even under --since: skipping the ones written before the window would
  // change which file owns a copied request, and with it the numbers inside the window.
  // ceiling: about 20 s for 300 transcripts here, read one at a time. Reading them in parallel
  // would have to hold every parsed record until its turn (some 600 MB here); an index of each
  // file's request ids would let old files be skipped without changing ownership.
  return orderTranscripts(
    files.map((path) => {
      const s = statSync(path);
      return { path, born: s.birthtimeMs, written: s.mtimeMs, sub: fileMeta(path).sub };
    }),
  );
}

/**
 * Paths in creation order. Where the filesystem records no creation time, a parent session is
 * still being written after its subagents fork from it, so its modification time would sort it
 * last; then every main-session file goes before every subagent file, the order they were made.
 */
export function orderTranscripts(stats) {
  const byBirth = stats.every((f) => f.born > 0);
  const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return [...stats]
    .sort((a, b) => (byBirth ? a.born - b.born : Number(a.sub) - Number(b.sub) || a.written - b.written) || byPath(a, b))
    .map((f) => f.path);
}

export async function main(argv, io = {}) {
  const out = io.out ?? process.stdout;
  try {
    return await run(argv, io);
  } catch (error) {
    // Any failure still answers in this command's line-1 contract.
    out.write(`usage: ERROR ${error.message}\n`);
    return 2;
  }
}

async function run(argv, { env = process.env, cwd = process.cwd(), out = process.stdout, err = process.stderr, tmp = tmpdir() } = {}) {
  const fail = (message) => {
    out.write(`usage: ERROR ${message}\n`);
    return 2;
  };
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    return fail(`${error.message}\nnext: node scripts/agent.mjs usage --help`);
  }
  if (opts.help) {
    out.write(`${HELP}\n`);
    return 0;
  }

  const projectsDir = transcriptsHome(env);
  let dirs = opts.dirs;
  if (!dirs.length) {
    const root = mainCheckoutRoot(cwd);
    if (!root) return fail(`git could not name this repo's main checkout from ${cwd}\nnext: pass --dir <transcript folder>`);
    dirs = defaultDirs(projectsDir, root);
  }
  dirs = dirs.map((d) => resolve(cwd, d));
  const missing = dirs.filter((d) => !existsSync(d));
  if (missing.length) return fail(`no such transcript folder: ${missing.join(", ")}`);
  const files = byCreation(dirs.flatMap((d) => walk(d)));
  if (!files.length) return fail(`no transcripts found in ${dirs.length ? dirs.join(", ") : projectsDir}`);

  // The test scripts as this checkout defines them, from its top level whatever the cwd; without a
  // package.json, npm test runs are not told apart from other npm scripts.
  // ceiling: every transcript is read against today's scripts here, though a worktree or an old
  // session may have run different ones; the exact answer needs package.json as of each call.
  const packageJson = join(git(cwd, ["rev-parse", "--show-toplevel"]) ?? cwd, "package.json");
  const vitest = vitestScripts(existsSync(packageJson) ? JSON.parse(readFileSync(packageJson, "utf8")).scripts : {});

  const seen = new Set();
  const extracted = [];
  for (const file of files) extracted.push(await readFile(file, seen, vitest));

  let report;
  try {
    report = summarize(extracted, { since: opts.since, until: opts.until, priceAs: opts.priceAs });
  } catch (error) {
    if (!(error instanceof UnpriceableError)) throw error;
    return fail(`${error.message}\nnext: price what is named above in scripts/agent/usage.mjs from ${PRICE_SOURCE}`);
  }
  if (!report.totals.requests) return fail(`no priced requests in ${files.length} transcripts in the window`);
  report.input = { files: files.length, dirs, malformedLines: extracted.reduce((a, f) => a + f.malformed, 0) };

  const key = createHash("sha256").update(resolve(cwd)).digest("hex").slice(0, 8);
  const logPath = join(tmp, `agent-usage-${sessionId(env.CLAUDE_CODE_SESSION_ID) ?? "nosession"}-${key}.json`);
  try {
    writeFileSync(logPath, JSON.stringify(report, null, 2));
  } catch (error) {
    err.write(`usage: could not write ${logPath}: ${error.message}\n`);
  }
  out.write(opts.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatReport(report, { logPath })}\n`);
  return 0;
}

