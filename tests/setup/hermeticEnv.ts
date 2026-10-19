import { afterEach } from "vitest";

/**
 * Makes the unit, integration and components tiers independent of the machine
 * they run on. Registered first in `setupFiles`, ahead of `nextMocks.ts`, so it
 * runs before any module under test is loaded. The `integration-db` tier does
 * not use it: that tier exists to reach a real database.
 *
 * Three things leaked in before, and each made a local run differ from CI:
 *
 *  1. The developer's shell. A `RESEND_API_KEY` exported in a terminal turned
 *     simulated email into real sends; `DATABASE_URL` flipped the repositories
 *     into database mode; storage and registration variables changed asserted
 *     URLs and certificate text. CI sets none of these, so neither does a test
 *     run: a test that needs one stubs it with `vi.stubEnv`, which the config
 *     undoes between tests (`unstubEnvs`).
 *  2. The time zone. CI and Vercel run in UTC; this machine runs UTC+8, so date
 *     arithmetic near midnight could pass in one and fail in the other.
 *  3. The network. Nothing here may reach a real host. A call that is not
 *     stubbed fails the test that made it, with the URL — even when the code
 *     under test catches the error and carries on, which is exactly the case a
 *     plain rejection would hide.
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

process.env.TZ = "UTC";

const unexpectedRequests: string[] = [];

function describeRequest(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = describeRequest(input);
  unexpectedRequests.push(url);
  throw new TypeError(`Network access is disabled in tests; stub fetch for ${url}`);
}) as typeof fetch;

afterEach(() => {
  if (unexpectedRequests.length === 0) return;
  const urls = unexpectedRequests.splice(0);
  throw new Error(
    `This test tried to reach the network: ${urls.join(", ")}. ` +
      "Stub fetch for it (vi.spyOn(globalThis, \"fetch\")) or stop the code from calling out."
  );
});
