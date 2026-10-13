# Two sessions wrote the same migration because neither listed the branches

**Learned:** 2026-09-22

Two Claude sessions independently authored a production migration converting `pets.age` /
`pets.ageCategory` to `birthDate` / `birthDateIsEstimate`, on the same day, in adjacent worktrees
of the same checkout. Both rehearsed on an embedded PostgreSQL. Both wrote a decision entry, a set
of lessons, and an edit to the same `tasks/open/` file. One of them — the other one's — had
already been pushed to `origin` while the second was still being written.

The audit that would have caught it costs one command:

    git branch -a --sort=-committerdate | head -20
    gh pr list --state open

That would have shown `fix/pets-birth-date-production-migration` *and* PR #42
"feat(admin): Add birth date input to pet form", open since 2026-09-14 — the other half of the
same task. The ledger did not show either: `tasks/open/production-schema-has-drifted-ahead-of-master.md`
described the problem in detail and named no branch working it, because an entry records what is
*known*, not who is *doing* something about it. `tasks/README.md` says a session claiming a GRAVE
task writes `open/CLAIM-<task>.md`; neither session wrote one, so the mechanism that exists for
exactly this did not fire.

The cost was not only the duplicated hours. It was that the two files disagree — one clamps a
month-end rollover, the other rolls it forward like the application does — so applying both in
sequence would derive different birthdays for the same animal, and the person applying them has
to adjudicate two decision documents that each read as authoritative.

The salvage was real, though, and is the reason this is a lesson rather than a complaint: reading
the other branch adversarially found two genuine defects in mine that my own rehearsal had missed,
because its edge-case list was different from mine. Duplicated work is a bad way to get a review
and still a review.

**Rule:** before writing anything that lands in a shared, singular location — a migration file, a
schema change, a ledger entry that others amend — list the branches and the open PRs first, not
just the ledger. `git branch -a --sort=-committerdate` and `gh pr list` are cheaper than any
reconciliation they prevent. And when starting one, write the `open/CLAIM-*.md` the ledger
contract already asks for, so the next session's `cat tasks/open/*.md` sees you.
