# A suite that went red without a diff changed environment, not code

**Learned:** 2026-09-22

`npm test` passed 1580/1580. Twenty-five minutes later, with no edit to `src/` in between, it
failed 60 tests across 14 files. The obvious suspects — the `origin/master` merge that had landed
in between, and my own change to `src/actions/pets.ts` — were both wrong, and checking them cost
more than the answer did.

What actually settled it was reading the failure rather than reasoning about the diff:
`prisma.pet.create` raising `Unique constraint failed on the fields: (id)` inside a test that
passes a *fixed* id and never goes through `createPet`. A unique violation means a real database
answered. A unit run is supposed to have none. So the question was not "what did I break" but
"what is answering on port 5432" — and the answer was another Claude job's `embedded-postgres`,
started after my green run and gone an hour later. Filed as
`tasks/open/unit-tests-write-to-whatever-is-on-localhost-5432.md`.

The second trap followed immediately: with the port still busy I tried to force the offline path
by pointing `DATABASE_URL` at a dead port. That made it worse — 129 failures — because
`isDatabasePersistent()` keys on the *presence* of the variable, not on reachability. And once a
concurrent agent was running `test:components`, every re-run produced a fresh set of failures at a
uniform ~10,100 ms, which is a timeout, not an assertion.

Three signatures, three different non-code causes, none of them visible in `git diff`.

**Rule:** before attributing a red run to your change, check that the run is comparable to the
green one — same listeners on the ports the suite can reach, same concurrent load, same env vars.
Read the *shape* of the failures first: a uniform duration near a timeout value is contention; a
database error in a tier that should have no database is a stranger on a port; an assertion
difference is the only one of the three that is about your code. And on a machine running several
agents, treat a single green run taken while alone as better evidence than three red ones taken
while not.
