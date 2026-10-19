import { assertSecretsConfigured } from "@/lib/security/secrets";

/**
 * Next.js calls `register` once per server instance, and it must complete before
 * the server accepts requests — which makes it the correct place to fail a
 * production boot carrying unsafe authentication secrets.
 *
 * Deliberately not guarded on `NEXT_RUNTIME`: `secrets.ts` imports only
 * `publishedPasswords.ts` (which imports nothing) and only reads `process.env`,
 * so it is safe on both the Node.js and Edge runtimes, and a misconfigured
 * deploy should fail on either. Keep both files free of Node-only imports.
 *
 * In development and test this throws nothing; it surfaces the one-time warning
 * for each weak secret at startup instead of on the first request that needs one.
 */
export function register(): void {
  assertSecretsConfigured();
}
