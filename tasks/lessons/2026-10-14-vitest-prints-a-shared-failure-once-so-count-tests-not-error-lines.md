# Vitest prints a shared failure once, so count the tests, not the error lines

**Learned:** 2026-10-14

A components run reported `12 failed`. To say how many were timeouts, the output was grepped:
`grep -ciE "Hook timed out|timed out in"` returned `3`. That went into
`tasks/open/unit-suite-is-order-dependent-in-both-directions.md` — a public, issue-mirrored entry —
as "three of the twelve component failures were `Hook timed out in 10000ms`", with the conclusion
that the hook-timeout mechanism was "a lead for the timeout-shaped subset, not for the
assertion-shaped one".

Both halves were wrong. Vitest lists every failing test, then prints each *distinct* error once
beneath all the tests that hit it. Ten tests shared one hook-timeout block; two more had a
`Test timed out in 20000ms` block each. Three blocks, twelve tests — and all twelve were timeouts.
There was no assertion-shaped remainder. The unit run had the same shape: seventeen failing tests,
one error block, and that block was the shared `beforeEach` at `tests/setup/nextMocks.ts:284`.

The number was not a typo. It changed what the entry told the next person to go and investigate.

**Rule:** count failures from the `FAIL` list, and classify them by reading which block each test
sits above — never by counting error lines. Before calling any failure a regression, grep the run
for `AssertionError`: none means nothing disagreed with the code, only that something ran out of
time.
