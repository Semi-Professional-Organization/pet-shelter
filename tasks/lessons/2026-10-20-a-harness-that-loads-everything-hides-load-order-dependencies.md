# A harness that loads everything for every test hides the tests that depend on load order

**Learned:** 2026-10-20

The global `beforeEach` in `tests/setup/nextMocks.ts` imported eleven store owners before every
test. When it stopped doing that (each store now registers its own reset), 16 tests in
`tests/unit/transparency.test.ts` failed with `SESSION_SECRET is not set`.

Nothing in the product had changed. One test switches `NODE_ENV` to production and then imports
the transparency actions for the first time; that import chain loads `crypto.ts`, which resolves
the session secret at load and refuses to run in production without one. Before, the harness had
already loaded `crypto.ts` in test mode, in every file, so the test never reached that path. It was
green because of an import the harness made for an unrelated reason, and it would have broken the
day anyone changed the harness's import list, in a file nobody touched.

**Rule:** when a shared setup step stops doing work, treat every failure it surfaces as a hidden
dependency in the test, not a regression in the setup. Fix the test so it arranges what it needs
itself (here: the secret a production process always has), and say in the test why. A test that
switches the environment and then imports for the first time is depending on load order; stub
everything that environment requires.
