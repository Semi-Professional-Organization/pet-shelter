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
 * `STRICT_PERSISTENCE` is not here, because the integration project sets it on
 * purpose; the other projects pin it off in `vitest.config.mts` instead.
 * `hermeticRuntime.ts` holds the parts every tier shares: the time zone and the
 * network guard.
 */

/** Every variable the code under test reads that a developer's shell might set. */
const AMBIENT_VARIABLES = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "NEON_BRANCH",
  "PRISMA_LOG",
  "DB_CONNECT_TIMEOUT_MS",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "SHELTER_NOTIFICATION_EMAIL",
  "STORAGE_PROVIDER",
  "AWS_S3_BUCKET",
  "AWS_S3_ENDPOINT",
  "AWS_REGION",
  "CLOUDINARY_CLOUD_NAME",
  "NEXT_PUBLIC_STORAGE_URL",
  "NEXT_PUBLIC_APP_URL",
  "ROS_REGISTRATION_NO",
  "TRUSTED_PROXY_HEADER",
  "VERCEL",
  "ALLOW_REMOTE_SEED",
  "ALLOW_REMOTE_DB_TESTS",
  "E2E_ALLOW_REMOTE_DATABASE",
  "SESSION_SECRET",
  "ADMIN_SECRET_KEY",
  "STAFF_INVITE_SECRET",
] as const;

for (const name of AMBIENT_VARIABLES) {
  delete process.env[name];
}
