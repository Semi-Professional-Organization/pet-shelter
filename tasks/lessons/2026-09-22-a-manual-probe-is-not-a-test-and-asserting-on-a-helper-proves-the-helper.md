# A manual probe is not a test, and asserting on a helper proves only the helper

**Learned:** 2026-09-22

`tests/unit/homeAnchors.test.ts` was given comment-stripping so that a commented-out mount would
stop counting as rendered. The fix was verified two ways and shipped, and the commit message said
"re-probed".

The probe was real and it passed: commenting out `<HomeProcessSection />` in `src/app/page.tsx` made
the suite red and named the three links that broke. What shipped beside it was a case titled "does
not count a commented-out mount as rendered" that called `stripComments` on a string and asserted
about the returned text. It never called the walker.

Review probed the difference. Deleting `stripComments(...)` from inside the walk — reverting the
entire fix — left **all** tests in the file green, and the guard silently returned to the behaviour
the case is named for. The manual probe had exercised the whole path; the committed test had not,
and only the committed test runs again.

Two distinct mistakes, and it is worth separating them. The manual probe proves the system works
*now* and protects nothing afterwards. Asserting on a helper proves the helper is correct and says
nothing about whether anything calls it. Both feel like verification at the time, and their failure
mode is identical: a later change reverts the behaviour with the suite green.

The replacement writes a two-file fixture page to a temp dir, runs `idsRenderedBy` over it, and
asserts the commented-out section's id is absent. Deleting the strip call now fails it.

**Rule:** a regression test must call the same entry point production calls, not a helper the
entry point happens to use. After writing one, delete the fix it covers and watch it fail — the
manual probe you already ran does not substitute for that, because the probe is not what CI runs.
Where the real input is inconvenient, build a fixture and point the real entry point at it.
