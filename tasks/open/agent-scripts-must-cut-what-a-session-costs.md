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

Measured 2026-10-20 with
`node scripts/agent.mjs usage --price-as claude-opus-5-5 --until 2026-10-19T16:45:00Z` over every
transcript Claude Code still held for this repo, up to the moment work on `usage` began, so this
build session does not count toward its own baseline: 16 sessions and their subagents, 15,241 model
requests, 2026-09-09 to 2026-10-19. Every request is priced at Claude Opus 5.5 list rates, so a
later change of model cannot pose as a saving. Dollars are API list-price equivalents.

| Measure | Baseline |
|---|---:|
| Mean cost per main-session request | $0.143 |
| Mean cost per subagent request | $0.056 |
| Cost split: cache reads / cache writes / output | 57.1% / 30.6% / 12.3% |
| Share of cost from requests made above 400K context | 56.4% |
| Cold resumes: whole context re-written on a person's message after the cache expired | 41, 10.2% of cost |
| The same re-write woken by anything else (a long tool, a notice) | 13, 2.1% of cost |
| Carrying old tool output (estimated) | 12.9% of cost |
| Workflow families, saving at one command call per burst | 5.5% of cost combined |

A cold resume's cost is the re-write of everything that was not new since the previous request,
less the cache read a warm request would have paid for it, which is what a hand-off could save.

A workflow family is the set of calls one command would replace. The eight measured, with the
saving each would make at one call per burst: gates 1.4%, targeted test runs 0.7%, orient 0.3%,
ledger reads 1.7%, merge checks 0.2%, drift-log reads 0.1%, pull-request checks 1.1%, port checks
0.1%. A call can belong to two families, so the sum is an upper bound. A burst is a run of
requests that each call the family, and it ends at the end of a turn; calls issued in parallel
from one request save nothing, since one command would remove no request. The plan estimated
about 9% from a cruder weighting; this is the priced figure.

Two corrections to the plan's own method, found while building `usage`: its prototype took a
request's first streamed transcript line, which undercounts output (its 10% output share is 12.3%
measured), and `node:readline` cut 78 transcript records in half at a raw U+2028.

## Success

Measured with `usage --price-as claude-opus-5-5 --since <merge date>` once five main sessions have
run after the context meter (item 2 above) merges:

- mean cost per main-session request at least 20% below $0.143, the floor of the plan's 20% to
  31% hand-off estimate; and
- cold resumes on a person's message below 5% of cost.

For each command after it lands: at least half of the calls in its workflow family, over the next
five sessions, go through the command.

## Kill conditions

1. If, once items 2 to 4 above (the context meter, `pr` and `gates`) have merged and five main
   sessions have run since the last of them, mean cost per main-session request at Opus 5.5 rates
   is not at least 10% below $0.143, building further commands stops and the plan is re-measured
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

## 2026-10-21: what the meter's pull request adds, and how its two new commands are judged

Item 2 lands as hooks in `.claude/settings.json` and three commands: the `meter` hook, after tool
calls and when a message arrives; `orient --brief`, when a session starts; `ledger handoff`, which
writes the hand-off state as `tasks/open/HANDOFF-<slug>.md`; and `recall`, which searches the
session that wrote it. The success measure above is the meter's. Kill condition 2 cannot judge
`ledger handoff` or `recall`, because there is no family of manual calls for either to replace, so
these two are registered before either is built, and are as immutable as the two above:

3. Of the first five main sessions to pass 300K context after the meter merges, if fewer than
   three write a hand-off with `ledger handoff` before they reach 500K, a line in context did not
   change what agents do: no further command is built until the hand-off is enforced by a hook
   rather than asked for.
4. `recall` is deleted if it is not called once in the sessions that continue the first five
   hand-offs.

Both are counted from transcripts, by the commands' names in tool calls.

The meter's `PostToolUse` hook runs after every tool call, so it adds wall time to each. Measured
on 2026-10-21 on the owner's Windows machine: 0.34 s a call, of which starting node is 0.22 s and
importing `usage.mjs` for its price table 0.02 s. Moving the table into a module of its own would
save those 0.02 s and was declined in review; if the delay is ever felt, starting node is where it
is.
