@AGENTS.md

Workflow Orchestration
1. Plan Mode Default
Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
If something goes sideways, STOP and re-plan immediately - don't keep pushing
Use plan mode for verification steps, not just building
Write detailed specs upfront to reduce ambiguity
2. Subagent Strategy
Use subagents liberally to keep main context window clean
Offload research, exploration, and parallel analysis to subagents
For complex problems, throw more compute at it via subagents
One tack per subagent for focused execution
3. Self-Improvement Loop
After ANY correction from the user: add a file to tasks/lessons/ with the pattern
Write rules for yourself that prevent the same mistake
Ruthlessly iterate on these lessons until mistake rate drops
Review lessons at session start for relevant project
4. Verification Before Done
Never mark a task complete without proving it works
Diff behavior between main and your changes when relevant
Ask yourself: "Would a staff engineer approve this?"
Run tests, check logs, demonstrate correctness
5. Demand Elegance (Balanced)
For non-trivial changes: pause and ask "is there a more elegant way?"
If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
Skip this for simple, obvious fixes - don't over-engineer
Challenge your own work before presenting it
6. Autonomous Bug Fixing
When given a bug report: just fix it. Don't ask for hand-holding
Point at logs, errors, failing tests - then resolve them
Zero context switching required from the user
Go fix failing CI tests without being told how
Task Management
Plan First: Write plan to tasks/todo.md with checkable items
Verify Plan: Check in before starting implementation
Track Progress: Mark items complete as you go
Explain Changes: High-level summary at each step
Document Results: Add review section to tasks/todo.md
Capture Lessons: Add a file to tasks/lessons/ after corrections — one file per lesson, never append to another session's. See tasks/lessons/README.md
Core Principles
Simplicity First: Make every change as simple as possible. Impact minimal code.
No Laziness: Find root causes. No temporary fixes. Senior developer standards.
Minimal Impact: Changes should only touch what's necessary. Avoid introducing bugs.

## Closing a session

**Standing order, set 2026-09-10.** A session is not finished when the code works. It is finished
when the next person can pick it up without asking you anything. Run these in order and report
what each returned — announcing "done" without them is not a close.

1. **Verify, and name what you ran.** Every gate that applies: `typecheck`, `test`,
   `test:components`, `test:integration`, `lint`, `docs:check`, `build`. A gate that cannot run is
   reported with its exact command, its failure, and the residual risk — that rule is `AGENTS.md`
   "Verification"; what this adds is that the check happens *at close*, and that a gate deferred
   earlier in the session gets one more attempt before it is reported as a gap. **In a worktree,
   `npm run build` needs `npm ci` first** (vitest resolves by walking up to the parent checkout;
   Turbopack will not compile outside its workspace root) **and throwaway
   `SESSION_SECRET`/`ADMIN_SECRET_KEY` passed inline** — `next build` sets `NODE_ENV=production`,
   which turns the missing-secret warning into a throw. Never copy `.env.local` across to satisfy
   it: that file points `DATABASE_URL` at the production branch.
2. **Read the drift log, filtered to your own session**, and account for every path in it — the
   filter and the log's limits are in `AGENTS.md`, "Read the drift log before the close write".
   Anything touched that is not in a commit is either staged deliberately or explained out loud.
3. **Write the ledger** per `tasks/README.md` — live threads and conclusions-reached-without-
   evidence to `tasks/open/`, choices someone could reasonably reverse to `tasks/decisions/`, and
   delete any `open/` entry this session actually closed.
4. **Write the lessons**, one new file each, per `tasks/lessons/README.md`. Only patterns that
   would change a future decision; a "lesson" that restates the diff is noise.
5. **Fill in the review section of your stream in `tasks/todo.md`.** Prepend a new stream; never
   rewrite the file — it holds other sessions' streams below yours, and a full-file write deletes
   them. Record what was deliberately *not* done and why: the omissions are the part nobody can
   reconstruct from the code.
6. **`/code-review` the whole diff against `origin/main` before opening or merging a PR —
   including every commit that fixed an earlier review's findings.** A fix round is new code that
   nobody has reviewed, written in a hurry, and it is where the last three defects in this repo's
   history were: `tasks/lessons/2026-09-08-a-security-fix-needs-an-adversarial-pass-of-its-own-and-its-tests-ar.md`
   says so, and PR #38 shipped an unreviewed fix commit anyway, because that lesson was in
   `tasks/lessons/` and not in this list. Its second review found eleven real defects, one of them
   defeating the PR's headline claim. Verify each finding by probe before accepting or dismissing
   it; a finding that changes what the PR claims stops the merge.

   **Scope bounds the loop (owner's rule, 2026-10-20).** State in the PR body what done means, what
   is in scope and what is not; a heuristic gets a `ceiling:` comment saying what it handles and how
   its accuracy is measured. Triage every finding: fix in-scope correctness bugs; record anything
   beyond a stated ceiling, any new behaviour and anything out of scope once per class in
   `tasks/open/`, and decline it; fix wording or style only when trivial. Stop after two
   consecutive rounds with no in-scope correctness finding. At round 8, or sooner if in-scope
   findings are not falling, stop and ask the owner. Only the owner widens scope. Why: the first
   agent-scripts PR ran 25 rounds, most of them on shell spellings a measurement did not need.
7. **Merge-check against current `origin/main`, then commit and push.** `git fetch origin
   main`, then `git merge-tree --write-tree --name-only HEAD origin/main` — a dry run that
   touches no ref and no working tree. A conflicted PR gets no CI run at all, so resolve before
   opening one. **A clean result is not the end of the check:** git detects conflicts per *path*,
   so if main restructured something your branch also restructured under different names, both
   copies merge silently. Read `git log HEAD..origin/main` for anything that overlaps your
   work. **If you then merge, and the merge touched `prisma/`, run `npm run db:generate` before
   re-running step 1** — the generated client is untracked, so a schema change arrives without its
   types and `typecheck` fails in files you never opened. Messages checked with
   `node scripts/commit-msg.mjs`.
8. **Say plainly whether the session can be closed**, what remains open, and the single next
   command if there is one.

Steps 3–5 are not paperwork. Everything this session learned that is not in one of those three
places is lost at the context boundary, and the cost lands on whoever picks the branch up.
