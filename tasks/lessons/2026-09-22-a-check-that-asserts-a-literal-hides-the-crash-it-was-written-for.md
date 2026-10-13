# A check that asserts a literal hides the very crash it was written for

**Learned:** 2026-09-22

The birth-date rehearsal opened with

```js
await c.query(MIGRATION);
check("A3 migration.sql applies", true);
```

which reads as "assert the migration applies" and asserts nothing. If the migration stops
applying — the one thing A3 exists to notice — the `await` rejects, the top-level await kills the
process, and the reader gets a stack trace with no `FAIL` line, no teardown, and an embedded
Postgres left running. The same shape appeared at `B1`, and again at `J3`, whose summary line
passed a literal `true` while its loop pushed real failures into a list nobody read.

`J3` is the part worth keeping: it was written *in the round that fixed* the identical defect in
`J1`, two lines under a comment describing that defect. Knowing the pattern did not stop me
reproducing it while fixing it, because a literal `true` is what you type when the interesting
work is the loop above it.

The repair is mechanical — route the operation through the same `expectFail` helper every other
check uses and pass its result — and it paid immediately. The rewritten `A3` caught a regression
introduced minutes earlier in the same session: `COMMENT ON COLUMN ... IS 'literal' || expr` is a
syntax error, because `COMMENT` takes a literal and not an expression. The previous `A3` would
have crashed the run and shown a stack trace instead.

**Rule:** no `check`/`expect`/`assert` in a harness takes a constant. If the argument is not an
expression computed from the thing under test, the line is a comment wearing a check's clothes.
Two habits close it: route every operation a check is *about* through the failure-capturing
helper, never a bare `await`; and once a suite is green, break the thing it watches and confirm it
goes red for that reason — the mutation is the only evidence a check can fail at all. Related:
[[2026-09-22-a-regex-that-finds-a-number-beside-a-unit-does-not-find-the-number]].
