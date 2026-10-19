# The agent scripts have to cut what an agent session costs, or the build stops

**Status:** open · opened 2026-10-20

The agent-scripts plan builds a set of commands behind `node scripts/agent.mjs`, one per pull
request, to make agent sessions in this repo cheaper. In build order:

1. `usage`, the measuring stick (this entry's pull request);
2. a **context meter**: hooks that tell an agent its real context size and the cache's state, and
   ask it to write its hand-off state and continue in a fresh session above set sizes;
3. `pr`, one snapshot of a pull request's checks;
4. `gates`, the verification gates in one call;
5. and later `orient`, `drift`, `merge`, `close`, the rest of `ledger`, `commit` and `probe`.

Its premise, that the meter and the commands save money, is an estimate from simulations, not an
observation. This entry registers the baseline, what success looks like, and the conditions that
stop the build, before any saving is claimed. The kill conditions below are immutable; a later
edit to them is an automatic DIED.

## Baseline

Measured 2026-10-20 with `node scripts/agent.mjs usage --price-as claude-opus-5-5` over every
transcript Claude Code still held for this repo: 17 sessions and their subagents, 17,173 model
requests, 2026-09-09 to 2026-10-19. Every request is priced at Claude Opus 5.5 list rates, so a
later change of model cannot pose as a saving. Dollars are API list-price equivalents.

| Measure | Baseline |
|---|---:|
| Mean cost per main-session request | $0.144 |
| Mean cost per subagent request | $0.056 |
| Cost split: cache reads / cache writes / output | 58.4% / 29.2% / 12.4% |
| Share of cost from requests made above 400K context | 56.1% |
| Cold resumes: whole context re-written on a person's message after the cache expired | 43, 9.5% of cost |
| The same re-write after a long tool or a background notice | 11, 1.6% of cost |
| Carrying old tool output (estimated) | 13.4% of cost |
| Workflow families, saving at one command call per burst | 5.0% of cost combined |

A cold resume's cost is the re-write beyond the cache read a warm request would have paid for the
same tokens, which is what a hand-off could save.

A workflow family is the set of calls one command would replace. The eight measured, with the
saving each would make at one call per burst: gates 1.3%, targeted test runs 0.9%, orient 0.3%,
ledger reads 1.0%, merge checks 0.2%, drift-log reads 0.1%, pull-request checks 1.1%, port checks
0.1%. A call can belong to two families, so the sum is an upper bound. A burst is a run of
requests that each call the family, and it ends at the end of a turn; calls issued in parallel
from one request save nothing, since one command would remove no request. The plan estimated
about 9% from a cruder weighting; this is the priced figure.

Two corrections to the plan's own method, found while building `usage`: its prototype took a
request's first streamed transcript line, which undercounts output (its 10% output share is 12.4%
measured), and `node:readline` cut 78 transcript records in half at a raw U+2028.

## Success

Measured with `usage --price-as claude-opus-5-5 --since <merge date>` once five main sessions have
run after the context meter (item 2 above) merges:

- mean cost per main-session request at least 20% below $0.144, the floor of the plan's 20% to
  31% hand-off estimate; and
- cold resumes on a person's message below 5% of cost.

For each command after it lands: at least half of the calls in its workflow family, over the next
five sessions, go through the command.

## Kill conditions

1. If, once items 2 to 4 above (the context meter, `pr` and `gates`) have merged and five main
   sessions have run since the last of them, mean cost per main-session request at Opus 5.5 rates
   is not at least 10% below $0.144, building further commands stops and the plan is re-measured
   before anything else is built.
2. A command whose family's calls go through it less than half the time over five sessions after
   it lands is deleted.

## What this cannot see

Quality. A cheaper session that needs more review rounds or rework is not a saving, and `usage`
measures neither. Per-request cost also moves with the mix of work: a stretch of migrations or
long reviews is dearer than a stretch of small fixes, so one comparison of five sessions is
directional. Claude Code deletes transcripts after 30 days by default, so the baseline above is the
record; it cannot be recomputed later.

**Settles when:** kill condition 1 fires, or the success measure is met and recorded as a decision
in `tasks/decisions/`.
