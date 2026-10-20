# The sponsor sign-in test file failed once while a production build ran beside it, and the error was not kept

**Status:** open · opened 2026-10-20 · seen while verifying the fourth review round of the test-harness branch

On `claude/project-thread-jdktt3`, an `npm test` started together with `npm run build` reported
`tests/unit/sponsorAuth.test.ts` as a failed file: `Test Files 1 failed | 109 passed (110)`,
`Tests 1923 passed (1923)`. None of the file's 30 tests were counted, so it failed while loading
or in its worker, not in a test or a hook. The output had been filtered through `grep`, so the
error text was lost.

The file passed on its own straight after (30 tests, 3.4 s), and the whole unit tier passed in
three more runs beside a build (110 files, 1,953 tests each). Other sessions on the machine may
have been running suites of their own during the first run. Two causes fit the pattern, and
neither is confirmed. One is a Vitest worker or RPC timeout under a saturated CPU. The other is
the build itself: `npm run build` ran `prisma generate` unconditionally, which deletes and
rewrites the generated client a loading test file needs. The build now skips that when the client
is current. Running the unit tier beside six back-to-back `prisma generate` runs did not reproduce
the failure (110 files, 1,966 tests, all passed), and neither did eight shuffled-order runs.

**Settles when:** a recurrence is caught with its full output (`npm test > run.log 2>&1`, not
filtered) and the error shows whether it is load (then decide on capping `maxWorkers`) or a
loading defect in the file (then fix it); or five more `npm test` runs beside `npm run build`
pass, which closes it as a one-off.
