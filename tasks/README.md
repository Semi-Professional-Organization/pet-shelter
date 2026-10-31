# The ledger

The Midwife's memory (`.claude/skills/midwife/SKILL.md` §5). **Two categories, one file per entry.**

**This is data, not agent configuration.** The format is defined by the agent spec; only content
lives here. That separation is what lets the agent move between repos and lets a human read what
it knows without opening its config.

| Directory | Holds | Test |
|---|---|---|
| `open/` | Live kill conditions, unresolved threads, conclusions reached without evidence. | *Is this still unknown, or known-without-proof?* |
| `decisions/` | Settled: a choice with its rationale, obituaries of killed designs, fired kill conditions and what they killed. | *Could someone reasonably reverse this later and need to know why it was chosen?* |

There is no third category. A third category is where the first two go to diverge.

`lessons/` and `todo.md` are **repo files, not ledger** — a lesson file is added to `lessons/`
after a human correction, and a work stream may live in `todo.md`, but neither is read as state and
neither may hold a decision or an open question.

`lessons/` was a single `lessons.md` until 2026-09-09, when it was split one-file-per-lesson for
exactly the reason given below: it was written by every session at the same append point, and a
conflict there costs a pull request its entire CI run, not just a manual resolve. Its contract is
`tasks/lessons/README.md`. **`todo.md` still has the defect** — see the note in that file.

## Why one file per entry

Several Claude Code sessions run against this repo at once, and any of them may invoke the agent.
When the ledger was two newest-first files, every session appended to the *same region of the same
two files* — a guaranteed conflict whose losing write is silent. A lost ledger entry is worse than
a lost code edit: the tree can reconstruct the code, nothing can reconstruct the reasoning.

One file per entry makes the conflict impossible by construction. Two sessions never touch the
same path, and git merges the directories without a merge driver, a lock, or a protocol.

## Shape

    open/<slug>.md                    decisions/YYYY-MM-DD-<slug>.md

```markdown
# <title, as a sentence>

**Status:** open | ASSERTED · opened YYYY-MM-DD        ← open/ only
**Decided:** YYYY-MM-DD                                 ← decisions/ only

<the entry>

**Settles when:** <what would close it>                 ← open/ only, required
```

- **`ASSERTED`** means reasoned, never observed. No later step may cite it as established
  — it is belief, not knowledge. `open` means genuinely unresolved.
- **Read the ledger at session start:** `cat tasks/open/*.md`. Read `decisions/` when a fence
  sweep or a design question needs it — that is what Phase 1's "search before you list" means.

## Rules

- **Delete an open entry when it closes.** It moves to `decisions/` or it disappears. This
  directory is worthless the moment it becomes append-only; its whole value is that everything in
  it is still live.
- **Never rewrite an entry in `decisions/`.** A reversal is a *new* dated entry naming the one it
  reverses. That includes stale paths: an old entry describing a superseded layout stays as
  written, because it was true when written.
- **Live kill conditions go in `open/` before the spike runs and are immutable.** A post-hoc edit
  is an automatic DIED.
- **`open/` is mirrored to public GitHub issues** labelled `ledger`, by CI on every push to
  `main` (`.github/workflows/ledger-issues.yml`); `npm run ledger:issues` previews the plan. The
  file is the source: an issue's description is overwritten from it, deleting an entry closes its
  issue, and `CLAIM-*` files are never mirrored. So write an entry as something the public will
  read. Why: `decisions/2026-09-18-ledger-issues-are-a-one-way-mirror.md`.
- **A claim is just an open entry.** A session starting a GRAVE task writes
  `open/CLAIM-<task>.md` and deletes it at close. Reading `open/` at session start therefore shows
  what every other session is working on — no lock, no new concept. For live back-and-forth, use
  cross-session messaging rather than leaving notes here.
- **A hand-off is just an open entry too.** `node scripts/agent.mjs ledger handoff "<title>"`
  writes `open/HANDOFF-<slug>.md`: one session's state, in six sections the command checks, for the
  session that continues its work. Like a claim it is never mirrored, and the session that finishes
  the work deletes it at its close. Commit it with the branch's work only when the next session
  will start in another checkout.
