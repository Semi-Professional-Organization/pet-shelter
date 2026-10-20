# Time each phase of the suite before tuning the runner or raising a timeout

**Learned:** 2026-10-20

The open entry on local test failures had recommended raising `hookTimeout` since 2026-09-22, and
an earlier session had raised `testTimeout` to 20 s for the same symptom. A custom Vitest reporter
that records each file's phases (environment, setup, collect) and every test's duration showed
the actual cause in one run: a pure `money` test took 515 ms locally and 3 ms once the shared hook
stopped re-hashing three demo passwords with scrypt. That hook cost about 100 ms on every one of
2,251 tests on CI, about half of all test time, and under local load it was what crossed 10 s.

Raising the timeout would have kept every one of those milliseconds and hidden them better. Runner
tuning was no better: on throwaway copies, 4 workers doubled the time, the threads pool was slower
and broke `process.chdir` tests, and `isolate: false` was 10% faster while failing 179 tests.

**Rule:** before raising a timeout, changing the pool or sharding, measure where the time goes per
phase and per test (Vitest's `TestModule.diagnostic()` gives environment, setup, collect and
duration per file in a 40-line reporter). A cost that is the same for every test, including pure
ones, is shared setup, and the fix is to delete that work, not to give it more time.
