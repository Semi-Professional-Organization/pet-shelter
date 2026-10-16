# The years and weeks unit boundaries are left unpinned by any test, on purpose

**Decided:** 2026-10-14 · from the PR #42 follow-up

Each unit pattern in `approximateBirthDate` (`src/lib/domain/petAge.ts`) ends in a word boundary,
`\b`. A mutation check removed that boundary from each pattern in turn and ran
`tests/unit/petAge.test.ts`:

| pattern | boundary removed |
|---|---|
| months | suite fails — `3 minggu` and `2 mggu` read as months |
| years | suite still passes |
| weeks | suite still passes |

So the months boundary is pinned and the other two are not. **That is deliberate, and should not be
"fixed" by adding a test.**

The months boundary has a job a test can name: it stops `3 minggu` (Malay for three weeks) being
read as three months. The years and weeks boundaries have no such case. The only inputs that tell a
bounded pattern from an unbounded one there are strings like `2 yrsold` or `3 weeksold`, where a
unit runs straight into more letters. With the boundary, those fall through to the intake date;
without it, they read as two years or three weeks. Falling through is the *wrong* answer in both.
For years it is a regression PR #42 introduced: `2 yrsold` read as two years before #42 and falls
through now (`tasks/open/approximate-birth-date-misreads-several-age-shapes.md`). For weeks it was
never right — there was no weeks unit before #42. Either way, a test that kills the boundary-removal
mutant would have to assert a wrong answer as correct, and would then stand in the way of fixing it.

**Reverse this when** the regressions are fixed and those shapes read correctly with the boundary
in place. At that point an input exists whose right answer the boundary protects, and it can be
pinned like the months case.
