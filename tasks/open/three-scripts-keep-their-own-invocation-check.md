# Three scripts keep their own check for whether they were run directly

**Status:** open · opened 2026-10-20

A script module that is also imported by tests decides whether to run its CLI by looking at
`process.argv[1]`. The agent scripts use one helper for that, `scripts/lib/invokedAs.mjs`, which
matches whole path segments and ignores case on Windows and macOS. Three older scripts carry their
own, looser copy:

- `scripts/commit-msg.mjs` and `scripts/ledger-issues.mjs`:
  `process.argv[1].replace(/\\/g, "/").endsWith("scripts/<name>.mjs")`, so
  `myscripts/commit-msg.mjs` would match and `node Scripts/commit-msg.mjs` on Windows would not.
- `scripts/check-doc-invariants.mjs`: a `file://` comparison or a bare file-name suffix.

Review of the first agent-scripts pull request found these differ, which the repo's own rule
("once two copies have diverged, that is the defect") calls a defect. Changing them was out of
that pull request's scope, and two of them need care: `ledger-issues.mjs` runs from a workflow
that triggers only when that file changes, so it should not import a helper whose edits would not
trigger it, and the commit-msg hook checks only that `commit-msg.mjs` exists, so an import from
`scripts/lib/` could fail every commit in a partial checkout.

**Settles when:** the three scripts share one rule (the helper, or an identical inline copy pinned
by a test), with the two constraints above handled.
