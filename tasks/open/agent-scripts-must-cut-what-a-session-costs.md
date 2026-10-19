# The agent scripts have to cut what an agent session costs, or the build stops

**Status:** open · opened 2026-10-20

The agent-scripts plan builds one command per pull request behind `node scripts/agent.mjs`, plus a
context meter, to make agent sessions in this repo cheaper. Its premise, that the meter and the
commands save money, is an estimate from simulations, not an observation. This entry registers
the baseline, what success looks like, and the condition that stops the build, before any saving
is claimed. The kill conditions below are immutable; a later edit to them is an automatic DIED.

## Baseline

Measured 2026-10-20 with `node scripts/agent.mjs usage --price-as claude-opus-5-5` over every
transcript Claude Code still held for this repo: 17 sessions and their subagents, 16,445 model
requests, 2026-09-09 to 2026-10-19. Every request is priced at Claude Opus 5.5 list rates, so a
later change of model cannot pose as a saving. Dollars are API list-price equivalents.

| Measure | Baseline |
|---|---:|
| Mean cost per main-session request | $0.144 |
| Mean cost per subagent request | $0.056 |
| Cost split: cache reads / cache writes / output | 58.1% / 29.5% / 12.4% |
| Share of cost from requests made above 400K context | 56.3% |
| Cold resumes (whole context re-written on a message after over an hour idle) | 51, 11.1% of cost |
| The same re-write after a tool that ran over an hour | 3, 0.7% of cost |
| Carrying old tool output (estimated) | 13.2% of cost |
| Workflow families, saving at one command call per burst | 4.6% of cost combined |

The families' combined saving is the sum of the eight families in the catalog's section 4 (gates
1.3%, targeted tests 0.8%, orient 0.4%, ledger 0.4%, merge 0.2%, drift 0.1%, pr 1.2%, ports 0.2%);
a call can belong to two families, so the sum is an upper bound. A burst is a run of requests
that each call the family, and it ends at the end of a turn; calls issued in parallel from one
request save nothing, since one command would remove no request. The catalog estimated about 9%
from a different weighting; this is the priced figure.

Two corrections to the catalog's own method, found while building `usage`: the prototype took a
request's first streamed transcript line, which undercounts output (its 10% output share is 12.4%
measured), and `node:readline` cut 78 transcript records in half at a raw U+2028.

## Success

Measured with `usage --price-as claude-opus-5-5 --since <merge date>` over the first five main
sessions after the context meter (build order PR 2) merges:

- mean cost per main-session request at least 20% below $0.144, the floor of the catalog's
  20% to 31% hand-off estimate; and
- cold resumes on a message below 5% of cost.

For each command after it lands: at least half of the calls in its workflow family, over the next
five sessions, go through the command.

## Kill conditions

1. If, once build-order PRs 2 to 4 have merged and five main sessions have run since the last of
   them, mean cost per main-session request at Opus 5.5 rates is not at least 10% below $0.144,
   building further commands stops and the plan is re-measured before anything else is built.
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
