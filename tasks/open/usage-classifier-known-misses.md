# The usage command's shell classifier has known misses, recorded rather than chased

**Status:** open · opened 2026-10-20

`node scripts/agent.mjs usage` sorts each shell call into workflow families (gates, targeted test
runs, orient, ledger reads, merge checks, drift-log reads, pull-request checks, port checks) by
reading the command text. Twenty-five review rounds on its first pull request kept finding shell
shapes it read wrongly, and most fixes added one more special case. The owner set a scope rule on
2026-10-20: fix in-scope correctness bugs, record anything beyond a documented ceiling once per
class here, and decline it.

The classifier's ceiling is in `splitChain` in `scripts/agent/usage.mjs`: it is a tokenizer for
families, not a shell parser, and a miss matters only if it moves a family's share of cost. These
classes are known and left as they are:

- **Nested command substitution.** A `|` or `;` inside an unquoted `$( … )` splits the command
  there (`for f in $(ls tasks/open | sort); …`).
- **Substring test filters.** Vitest matches a filter as a substring of each path, so
  `vitest run unit` runs the whole unit tier, but usage reads it as a targeted run; telling them
  apart needs the file list.
- **A name filter inside a package.json script.** A script written `vitest run -t smoke` is read
  as passing a path, so `npm run` of it counts as a gate.
- **Burst and cold-resume triggers disagree in one case.** When a person types while a long tool
  runs, the cold-resume count files the request under the tool, while the burst count treats the
  person's message as new work.
- **The first request of a resumed transcript.** Its "new since the previous request" is taken as
  zero, because the previous request is in another file, so its whole write counts as expiry cost.
- **A main-session fork on a file system with no creation times.** It can be read before its
  parent and so own the parent's copied requests.
- **Parsing cost.** Each call is split twice and parsed by several families in turn; small beside
  reading the transcripts.

**Settles when:** a family's share in a `usage --json` run is shown to move by 0.1 percentage
points or more because of one of these classes, which makes that class worth fixing, or the
agent-scripts plan is stopped (`tasks/open/agent-scripts-must-cut-what-a-session-costs.md`).
