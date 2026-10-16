# A spy installed in a test cannot see a store that read its key at import

**Learned:** 2026-09-22

`tasks/open/hero-mounts-a-quiz-and-sponsor-dialog-nothing-can-open.md` measured the cost of two
dead dialog mounts as `localStorage` reads: rendering `<Hero />` read `hope_for_strays_pets_v1`
and `hope_for_strays_donation_receipts_v1` even with both dialogs closed. So the regression test
written for the fix spied on `Storage.prototype.getItem`, rendered `Hero`, and asserted neither key
was read.

It passed. It also passed against the **unfixed** component, with both mounts still in place. A
test that cannot fail is not a test, and this one would have shipped as the proof that the defect
was gone.

The cause is the same one `.claude/skills/test-harness/SKILL.md` gives for importing the reset
helpers dynamically: the dialogs' stores run at module scope, so they read their keys when the
module is first imported — before any `beforeEach`, and before any spy the test body installs.
`vi.mock` is hoisted above the imports and would have worked; `vi.spyOn` inside `it()` never could.

What replaced it: `vi.mock` on both dialog modules with recording stubs, asserting neither
component function is invoked. Run against the unfixed component it failed with
`Number of calls: 1`.

Note that the observable the ledger entry chose was real — the reads do happen. It was not
reproducible *from a test*, which is a different property, and the entry could not have known that.

**Rule:** before a regression test is allowed to stand as evidence, run it against the unfixed
code and watch it fail. If it cannot be made to fail, the assertion is about something other than
the change. For anything a module reads at import — a store, a cached client, a frozen config — a
spy installed inside `it()` is always the wrong instrument; mock the module instead.
