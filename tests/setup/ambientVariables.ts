/**
 * Every environment variable the code under test reads that a developer's shell
 * might set. `hermeticEnv.ts` deletes each one before a unit, integration or
 * component test file loads; `tests/unit/hermeticEnvCoversTheCode.test.ts` fails
 * when `src/` starts reading a variable that is neither here nor pinned elsewhere.
 */
export const AMBIENT_VARIABLES = [
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

/**
 * Read by the code but deliberately not deleted, because the harness sets them:
 * `NODE_ENV` in `hermeticRuntime.ts`, `STRICT_PERSISTENCE` per project in
 * `vitest.config.mts`.
 */
export const PINNED_VARIABLES = ["NODE_ENV", "STRICT_PERSISTENCE"] as const;
