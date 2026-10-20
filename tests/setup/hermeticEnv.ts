import { AMBIENT_VARIABLES } from "./ambientVariables";

/**
 * Makes the unit, integration and components tiers independent of the shell
 * they are started from. Registered first in `setupFiles`, so it runs before any
 * module under test is loaded. The `integration-db` tier does not use it: that
 * tier exists to reach the database its `DATABASE_URL` names.
 *
 * A developer's shell leaked in before, and made a local run differ from CI: a
 * `RESEND_API_KEY` exported in a terminal turned simulated email into real
 * sends, `DATABASE_URL` flipped the repositories into database mode, and storage
 * and registration variables changed asserted URLs and certificate text. CI sets
 * none of these, so neither does a test run: a test that needs one stubs it with
 * `vi.stubEnv`, which the config undoes between tests (`unstubEnvs`).
 *
 * The list lives in `ambientVariables.ts`, where a guard test checks it against
 * the variables `src/` actually reads. `hermeticRuntime.ts` holds the parts every
 * tier shares: the mode, the time zone and the network guard.
 */
for (const name of AMBIENT_VARIABLES) {
  delete process.env[name];
}
