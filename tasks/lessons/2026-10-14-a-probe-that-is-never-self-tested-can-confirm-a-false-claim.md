# A probe that is never self-tested can confirm a false claim

**Learned:** 2026-10-14

To check what the pet birth-date backfill would do with an age string, the PR #42 follow-up
session emulated the migration's Postgres patterns in JavaScript. One was

    new RegExp("[0-9]+\\s*(years|year|yrs|yr|y)(?![A-Za-z0-9_])")

written into a `node -e` command and, separately, a quoted heredoc. In both, the backslash was
collapsed before Node saw it — `regex.source` printed `[0-9]+s*(…)`. So `\s` had become a literal
`s`, and the "whitespace" in every pattern was matching the letter *s*.

Nothing errored. The regex compiled, ran, and returned verdicts that looked reasonable. For inputs
without a space — `2y3m`, `1y6m` — they were even correct, because `s*` happily matches nothing.
For inputs *with* a space they were wrong, but mostly in a direction that happened to agree with
the truth: `6 mons` came out "no unit" through the broken pattern and through a correct one alike.
The session relied on those verdicts for a public ledger entry and in a message to another session.

It surfaced only when one verdict was impossible: `0.5 years` came out *not fractional*, although
the migration's own comment uses "1.5 years" as its canonical fractional example. Rebuilt with the
backslash made from its character code, and self-tested, the emulator flipped exactly the English
decimals — `0.5 years` and `1.5 months` are fractional after all — and left every other verdict
where it was. The Malay decimals had come out "no unit" through both versions, so the broken
probe was right about them by accident. (The public entry had separately claimed the backfill
refuses *all* the decimals "as fractional" — that one was reasoned, not run at all, and was wrong
for the Malay cases. A review caught it.)

**Rule:** before trusting a probe, prove it on a case whose answer you already know — and print what
it actually compiled, not what you meant it to. For a regex that means printing `regex.source` and
asserting one known match and one known non-match before running the inputs you care about. A
probe that returns plausible answers is not thereby a working probe; the dangerous failure is the
one that is right by luck for most inputs. In this harness, build a backslash with
`String.fromCharCode(92)` rather than typing it.
